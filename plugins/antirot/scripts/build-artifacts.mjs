#!/usr/bin/env node
// antirot — deterministic artifact generation.
//
// Reads the approved manifest and writes the structural skeleton of the vault:
// module dirs, the course-map MOC (with a mermaid DAG generated from the edge
// list), per-module overview MOCs, and skeleton note files
// carrying frontmatter + beat headings + a `status: skeleton` marker.
//
// The LLM never writes these — generating them from the manifest removes whole
// classes of syntax failure (broken mermaid, malformed frontmatter, wrong slugs).
// Lesson-writers later fill in prose between the beat headings and flip status.
//
// It also canonicalizes each note's file path (filename = the note title, folder
// = the module's "<NN> - <title>") and writes the manifest back, so Obsidian
// surfaces the title and the slug is purely a stable link ID (a frontmatter
// alias). Links never use the filename, so this rename is safe.
//
//   node build-artifacts.mjs <manifest.json> [--state .antirot/build-state.json]
//
// Idempotent: existing notes whose frontmatter says `status: complete` are left
// untouched (resume-safe); skeletons are (re)written.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const manifestPath = args.find((a) => !a.startsWith("--"));
if (!manifestPath) {
  console.error("usage: build-artifacts.mjs <manifest.json> [--state path]");
  process.exit(2);
}
const statePath =
  valueOf("--state") ?? join(".antirot", "build-state.json");
const briefsDir = valueOf("--briefs") ?? join(".antirot", "briefs");

const m = JSON.parse(readFileSync(manifestPath, "utf8"));
const outDir = resolve(m.course.outDir);
const conceptById = new Map(m.concepts.map((c) => [c.id, c]));
const noteBySlug = new Map(m.notes.map((n) => [n.slug, n]));
const moduleBySlug = new Map(m.modules.map((mod) => [mod.slug, mod]));

// Canonicalize note file paths so Obsidian surfaces the TITLE, not the slug:
// filename = "<NN> - <title>.md" (NN = the note's position within its module),
// folder = the module's "<NN> - <title>". The slug stays the stable link ID (a
// frontmatter alias); nothing links by filename, so renaming is safe. Persist
// the canonical paths back to the manifest so the briefs, the generation
// workflow, and check.mjs all resolve the same files.
{
  const seqByModule = new Map();
  for (const n of [...m.notes].sort((a, b) => a.order - b.order)) {
    const seq = (seqByModule.get(n.module) ?? 0) + 1;
    seqByModule.set(n.module, seq);
    const mod = moduleBySlug.get(n.module);
    const dir = mod ? modDirName(mod) : n.module;
    n.path = `${dir}/${String(seq).padStart(2, "0")} - ${sanitizeFilename(n.title)}.md`;
  }
  writeFileSync(manifestPath, JSON.stringify(m, null, 2));
}

const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : { notes: {} };

mkdirSync(outDir, { recursive: true });

let written = 0;
let skipped = 0;

// --- course map MOC (with mermaid DAG) -------------------------------------
writeFile(
  join(outDir, "00 - Course Map.md"),
  courseMap(),
  /*structural*/ true,
);

// --- per-module overview MOCs ----------------------------------------------
for (const mod of [...m.modules].sort((a, b) => a.order - b.order)) {
  const dir = join(outDir, modDirName(mod));
  mkdirSync(dir, { recursive: true });
  writeFile(join(dir, `${overviewBasename(mod)}.md`), moduleOverview(mod), true);
}

// --- Resources appendix (built from researched sources) --------------------
// No glossary: definitions are lesson-canonical (^def-<id> in the home lesson)
// and linked inline ([[concept]] / [[concept#^def-id]]); a separate index page
// would only duplicate the course.
mkdirSync(join(outDir, "Appendix"), { recursive: true });
writeFile(join(outDir, "Appendix", "Resources.md"), resourcesStub(), true);

// --- skeleton lesson notes --------------------------------------------------
for (const n of [...m.notes].sort((a, b) => a.order - b.order)) {
  const full = join(outDir, n.path);
  if (isComplete(full)) {
    skipped++;
    continue;
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFile(full, skeletonNote(n), false);
}

// --- per-note writer briefs (small; lesson-writers read these, not the 224KB
//     manifest — keeps the workflow args tiny and writer context lean) ---------
mkdirSync(briefsDir, { recursive: true });
for (const n of m.notes) {
  writeFileSync(join(briefsDir, `${n.slug}.json`), JSON.stringify(noteBrief(n), null, 2));
}

writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log(
  `build-artifacts: ${written} written, ${skipped} complete-and-skipped, ${m.notes.length} briefs. outDir=${outDir}`,
);

// A self-contained brief: everything a lesson-writer needs to write one note,
// without reading (and re-parsing) the whole manifest.
function noteBrief(n) {
  const titleOf = (id) => conceptById.get(id)?.title ?? id;
  return {
    slug: n.slug,
    title: n.title,
    path: n.path,
    course: { title: m.course.title, slug: m.course.slug },
    pacing: m.course.pacing ?? {},
    voice: m.voice ?? null,
    notation: m.notation ?? [],
    beats: (n.beats ?? []).map((b) => ({ concept: b.concept, title: titleOf(b.concept), kind: b.kind })),
    linkVocab: (n.linkVocab ?? []).map((id) => ({ id, title: titleOf(id) })),
    prereqs: (n.prereqs ?? []).map((id) => ({
      id,
      title: titleOf(id),
      alreadyTaught: (n.alreadyTaught ?? []).includes(id),
    })),
    blockIds: n.blockIds ?? [],
    exercises: n.exercises ?? [],
    figures: n.figures ?? [],
    sources: Object.fromEntries(
      noteConceptIds(n)
        .map((id) => [id, conceptById.get(id)?.sources ?? []])
        .filter(([, ss]) => ss.length),
    ),
  };
}

// ---------------------------------------------------------------------------

function courseMap() {
  const fm = frontmatter({
    title: m.course.title,
    type: "moc",
    tags: ["course", `course/${m.course.slug}`],
  });
  const modLinks = [...m.modules]
    .sort((a, b) => a.order - b.order)
    .map((mod) => `- [[${overviewBasename(mod)}|${mod.title}]]`)
    .join("\n");
  return `${fm}# ${m.course.title}

> [!summary] Course map
> Generated from the build manifest. The prerequisite graph below is the spine of the course — follow it in order.

## Prerequisite graph

\`\`\`mermaid
${mermaidDag()}
\`\`\`

## Modules

${modLinks}

## Appendix

- [[Resources]]
`;
}

function mermaidDag() {
  // Deterministic: nodes from concepts, edges from the manifest. Labels are
  // quoted so parentheses / math never break the parser.
  const lines = ["graph TD"];
  for (const c of m.concepts) {
    lines.push(`  ${c.id}["${escapeLabel(c.title)}"]`);
  }
  for (const e of m.edges) {
    // to is the prerequisite; arrow points from prereq -> dependent (reading order)
    lines.push(`  ${e.to} --> ${e.from}`);
  }
  return lines.join("\n");
}

function moduleOverview(mod) {
  const fm = frontmatter({
    title: mod.title,
    aliases: [`${mod.slug}-overview`],
    type: "moc",
    tags: ["module", `course/${m.course.slug}`],
  });
  const lessons = m.notes
    .filter((n) => n.module === mod.slug)
    .sort((a, b) => a.order - b.order)
    .map((n) => `- [[${n.slug}|${n.title}]]`)
    .join("\n");
  let capstone = "";
  if (mod.capstone) {
    const concepts = (mod.capstone.concepts ?? [])
      .map((id) => `[[${id}]]`)
      .join(", ");
    capstone = `\n## Capstone

> [!question]- Capstone — integrate ${concepts || "this module"}
> ${mod.capstone.prompt ? mod.capstone.prompt : "_(to be written — a task that requires combining the module's concepts, not just recalling them)_"}

> [!success]- Solution
> _(to be written — full worked solution; verifiable)_
`;
  }
  return `${fm}# ${mod.title}

> [!summary] Module overview
> Lessons in dependency order.

${lessons}
${capstone}`;
}

function resourcesStub() {
  // Built deterministically from manifest.concepts[].sources — real, fetched
  // references populated by the researcher pass. Never hand-written, so no
  // hallucinated citations. Empty until research has run.
  const grounded = m.concepts.filter((c) => (c.sources ?? []).length);
  const status = grounded.length ? "complete" : "skeleton";
  const fm = frontmatter({
    title: "Resources",
    type: "appendix",
    tags: ["appendix", `course/${m.course.slug}`],
    status,
  });

  if (!grounded.length) {
    return `${fm}# Resources

> [!note] Going deeper
> Populated from researched sources after the generation pass. _(none yet)_
`;
  }

  // group concepts by module (via their home note)
  const byModule = new Map();
  for (const c of grounded) {
    const home = noteBySlug.get(c.homeNote);
    const modSlug = home ? home.module : "_";
    if (!byModule.has(modSlug)) byModule.set(modSlug, []);
    byModule.get(modSlug).push(c);
  }
  const sections = [...byModule.entries()]
    .sort((a, b) => (moduleBySlug.get(a[0])?.order ?? 99) - (moduleBySlug.get(b[0])?.order ?? 99))
    .map(([modSlug, concepts]) => {
      const modTitle = moduleBySlug.get(modSlug)?.title ?? modSlug;
      const items = concepts
        .map((c) => {
          const links = c.sources
            .map((s) => `  - [${mdEscape(s.title)}](${s.url})${s.note ? ` — ${mdEscape(s.note)}` : ""}`)
            .join("\n");
          return `- **${mdEscape(c.title)}** ([[${c.id}]])\n${links}`;
        })
        .join("\n");
      return `## ${mdEscape(modTitle)}\n\n${items}`;
    })
    .join("\n\n");

  return `${fm}# Resources

> [!note] Going deeper
> Curated, fetched references per concept. Generated from the build manifest — every link was verified by the research pass.

${sections}
`;
}

function mdEscape(s) {
  return String(s).replace(/([\[\]])/g, "\\$1");
}

function skeletonNote(n) {
  const taught = new Set(n.alreadyTaught ?? []);
  const beatsHeadings = n.beats
    .map((b) => {
      const c = conceptById.get(b.concept);
      const label = c ? c.title : b.concept;
      if (b.kind === "define") {
        // Arc: motivate -> intuition -> definition. Seed the motivation (from the
        // manifest) BEFORE the definition callout so the section never opens with
        // formalism. The canonical definition lives HERE; ^def-<id> is the single
        // source (linkable as [[<concept>#^def-<id>]], transcludable with ![[…]]).
        const motiv = c?.motivation
          ? `${c.motivation}\n`
          : `_(motivate: why this concept exists — to be written)_\n`;
        return `## ${label}\n\n${motiv}\n> [!note] Definition ^def-${b.concept}\n> _(to be written)_\n`;
      }
      if (b.kind === "preview") {
        return `## ${label}\n\n> [!tip] Coming up\n> _(to be written — forward pointer only; do not teach here)_\n`;
      }
      // USE beat. An already-taught prereq must NOT get its own top-level
      // section — an empty heading for a known concept begs a recap paragraph
      // ("you have already seen…"), the #1 prose regression. The concept stays
      // in linkVocab and is linked INLINE at the point it is used. A use-beat
      // for a concept not yet seen (e.g. one defined earlier in THIS note) is a
      // genuine application sub-topic and keeps its heading.
      if (taught.has(b.concept)) return null;
      return `## ${label}\n`;
    })
    .filter((s) => s !== null)
    .join("\n");
  const definesHere = m.concepts
    .filter((c) => c.homeNote === n.slug)
    .map((c) => c.id);
  const fm = frontmatter({
    title: n.title,
    aliases: [n.slug, ...definesHere],
    type: "lesson",
    module: n.module,
    order: n.order,
    status: "skeleton",
    prereqs: (n.prereqs ?? []).map((p) => `[[${p}]]`),
    tags: ["lesson", `course/${m.course.slug}`],
  });
  return `${fm}# ${n.title}

> [!info] Skeleton
> Headings are the beat structure from the manifest. Fill prose between them.
> One new concept per beat. Link only within the closed vocabulary. Do not add headings for concepts not listed here.

${beatsHeadings}
${exercisesSection(n)}## Summary

## Flashcards
${furtherReading(n)}`;
}

// concept ids this note touches (its beats), used for per-lesson Further reading
function noteConceptIds(n) {
  return [...new Set((n.beats ?? []).map((b) => b.concept))];
}

// Per-lesson "Further reading", generated deterministically from the manifest
// sources of this note's concepts. The writer never emits citation URLs — this
// section is stamped from verified sources and left untouched.
function furtherReading(n) {
  const seen = new Set();
  const items = [];
  for (const id of noteConceptIds(n)) {
    for (const s of conceptById.get(id)?.sources ?? []) {
      if (seen.has(s.url)) continue;
      seen.add(s.url);
      items.push(`- [${mdEscape(s.title)}](${s.url})${s.note ? ` — ${mdEscape(s.note)}` : ""}`);
    }
  }
  if (!items.length) return "";
  return `\n## Further reading\n\n${items.join("\n")}\n`;
}

function exercisesSection(n) {
  const ex = n.exercises ?? [];
  if (!ex.length) return "";
  const blocks = ex
    .map((e) => {
      const c = conceptById.get(e.concept);
      const label = c ? c.title : e.concept;
      const inter = (e.interleave ?? []).length
        ? ` (also draws on ${e.interleave.join(", ")})`
        : "";
      return `> [!question]- Exercise — ${e.kind}: ${label}${inter}\n> _(to be written — must require ${e.kind}, not mere restatement)_\n\n> [!success]- Solution\n> _(to be written — full worked solution; computational steps must be verifiable)_`;
    })
    .join("\n\n");
  return `## Exercises\n\n${blocks}\n\n`;
}

// --- helpers ---------------------------------------------------------------

function isComplete(path) {
  if (!existsSync(path)) return false;
  const txt = readFileSync(path, "utf8");
  return /^status:\s*complete\s*$/m.test(txt.split(/^---$/m)[1] ?? "");
}

function writeFile(path, content, structural) {
  // Structural artifacts are always (re)generated. Lesson skeletons are written
  // only when not already complete (checked by caller).
  writeFileSync(path, content);
  state.notes[path] = {
    hash: createHash("sha256").update(content).digest("hex").slice(0, 16),
    structural: !!structural,
    generatedAs: "skeleton",
  };
  written++;
}

function frontmatter(obj) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${yamlScalar(item)}`);
    } else {
      lines.push(`${k}: ${yamlScalar(v)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function yamlScalar(v) {
  if (typeof v === "number") return String(v);
  const s = String(v);
  return /[:#\[\]{}]|^\s|\s$/.test(s) ? JSON.stringify(s) : s;
}

function modDirName(mod) {
  return `${String(mod.order).padStart(2, "0")} - ${sanitizeFilename(mod.title)}`;
}

// Overview note basename. Unique per module (titles are unique) AND sorts first
// within the module folder via the "00 - " prefix. Uniqueness is required: a
// shared "00 - Overview.md" across every module collides, and Obsidian can't
// resolve a [[link]] to one specific colliding-basename note. The Course Map
// links by this basename, so it resolves deterministically (and survives the
// course being nested inside a larger vault, unlike a path link).
function overviewBasename(mod) {
  return `00 - Overview - ${sanitizeFilename(mod.title)}`;
}

// Strip characters illegal in filenames / wikilinks (\ / : * ? " < > | # ^ [ ])
// so a title-based filename is always valid and linkable. Commas, parens,
// ampersands, dashes are fine and kept.
function sanitizeFilename(s) {
  return String(s)
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeLabel(s) {
  return s.replace(/"/g, "'");
}

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
