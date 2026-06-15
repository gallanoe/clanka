#!/usr/bin/env node
// antirot — deterministic artifact generation.
//
// Reads the approved manifest and writes the structural skeleton of the vault:
// module dirs, the course-map MOC (with a mermaid DAG generated from the edge
// list), per-module overview MOCs, glossary stubs, and skeleton note files
// carrying frontmatter + beat headings + a `status: skeleton` marker.
//
// The LLM never writes these — generating them from the manifest removes whole
// classes of syntax failure (broken mermaid, malformed frontmatter, wrong slugs).
// Lesson-writers later fill in prose between the beat headings and flip status.
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
  writeFile(join(dir, "00 - Overview.md"), moduleOverview(mod), true);
}

// --- glossary stubs (one note per glossary concept, declares a block id) ----
const glossDir = join(outDir, "Appendix", "Glossary");
mkdirSync(glossDir, { recursive: true });
for (const c of m.concepts.filter((c) => c.glossary)) {
  writeFile(join(glossDir, `${c.id}.md`), glossaryStub(c), true);
}
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
    .map((mod) => `- [[${mod.slug}-overview|${mod.title}]]`)
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
- Glossary: see \`Appendix/Glossary/\`
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

function glossaryStub(c) {
  const fm = frontmatter({
    title: c.title,
    aliases: [`${c.id}-glossary`],
    type: "glossary",
    tags: ["glossary", `course/${m.course.slug}`],
    status: "skeleton",
  });
  // Declares the canonical block id used for transclusion: ^def-<id>
  return `${fm}# ${c.title}

> [!note] Definition ^def-${c.id}
> _(to be written — canonical definition of ${c.title}; transcluded wherever this term is used)_
`;
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
  const beatsHeadings = n.beats
    .map((b) => {
      const c = conceptById.get(b.concept);
      const label = c ? c.title : b.concept;
      const tag =
        b.kind === "define"
          ? " <!-- define: canonical home for this concept -->"
          : b.kind === "preview"
            ? " <!-- preview: forward pointer only, do not teach -->"
            : "";
      return `## ${label}${tag}\n`;
    })
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
  return `${String(mod.order).padStart(2, "0")} - ${mod.title}`;
}

function escapeLabel(s) {
  return s.replace(/"/g, "'");
}

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
