#!/usr/bin/env node
// antirot — deterministic course checker (the most-trusted QC layer).
//
// Validates the generated vault against the frozen manifest. Cannot be
// sycophantic. Native checks have no external dependencies; optional checks
// (mermaid render, KaTeX render) run only if the tool is on PATH.
//
//   node check.mjs <manifest.json> [--state .antirot/build-state.json] [--report path]
//
// Exit code 0 = clean (warnings allowed), 1 = hard errors found, 2 = bad usage.
//
// Hard-error checks (native):
//   dead-link, slug-canonicalization, out-of-vocab link, topological legality,
//   beat legality, callout enum, transclusion block resolution, completion.
// Notes / warnings:
//   notation manifest consistency, optional mermaid/KaTeX render.
//
// What this CANNOT do (delegated to course-reviewer): judge whether prose is
// pedagogically correct, whether a definition is right, whether a proof holds.
// The checker proves structure; the reviewer judges meaning.

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const manifestPath = args.find((a) => !a.startsWith("--"));
if (!manifestPath) {
  console.error("usage: check.mjs <manifest.json> [--report path]");
  process.exit(2);
}
const reportPath = valueOf("--report") ?? join(".antirot", "check-report.json");

const m = JSON.parse(readFileSync(manifestPath, "utf8"));
const outDir = resolve(m.course.outDir);

const CALLOUT_ENUM = new Set([
  "note", "info", "example", "question", "tip", "warning", "summary", "preview",
]);
const PREVIEW_CALLOUTS = new Set(["preview", "tip"]); // forward pointers allowed here

const findings = []; // {severity, code, note, detail}
const err = (code, note, detail) =>
  findings.push({ severity: "error", code, note, detail });
const warn = (code, note, detail) =>
  findings.push({ severity: "warn", code, note, detail });

// --- build the canonical slug universe from the manifest -------------------
// alias -> { kind: 'concept'|'note'|'glossary'|'module', noteSlug, order, concept? }
const alias = new Map();
const conceptById = new Map(m.concepts.map((c) => [c.id, c]));
const noteBySlug = new Map(m.notes.map((n) => [n.slug, n]));
const orderOfConcept = (id) => {
  const c = conceptById.get(id);
  const home = c && noteBySlug.get(c.homeNote);
  return home ? home.order : Infinity;
};

for (const n of m.notes) {
  alias.set(n.slug, { kind: "note", noteSlug: n.slug, order: n.order });
}
for (const c of m.concepts) {
  // a concept id resolves to its home (lesson) note
  alias.set(c.id, {
    kind: "concept",
    noteSlug: c.homeNote,
    order: orderOfConcept(c.id),
    concept: c.id,
  });
  if (c.glossary) {
    alias.set(`${c.id}-glossary`, {
      kind: "glossary",
      concept: c.id,
      blockIds: new Set([`^def-${c.id}`]),
    });
  }
}
for (const mod of m.modules) {
  alias.set(`${mod.slug}-overview`, { kind: "module", module: mod.slug });
}

// block-id universe: from manifest note.blockIds + glossary ^def-<id>
const blockIdsByTarget = new Map();
for (const n of m.notes) {
  blockIdsByTarget.set(n.slug, new Set(n.blockIds ?? []));
}
for (const c of m.concepts.filter((c) => c.glossary)) {
  blockIdsByTarget.set(`${c.id}-glossary`, new Set([`^def-${c.id}`]));
}

// --- notation manifest consistency -----------------------------------------
{
  const bySymbol = new Map();
  const byObject = new Map();
  for (const e of m.notation ?? []) {
    if (byObject.has(e.object))
      err("notation-dup-object", "(manifest)", `object "${e.object}" has two symbols`);
    if (bySymbol.has(e.symbol))
      warn("notation-shared-symbol", "(manifest)", `symbol "${e.symbol}" used for "${byObject.get(e.symbol) ?? e.object}" and "${e.object}"`);
    byObject.set(e.object, e.symbol);
    bySymbol.set(e.symbol, e.object);
  }
}

// --- per-note structural checks --------------------------------------------
const linkRe = /(!?)\[\[([^\]|#]+?)(#\^?[^\]|]+)?(\|[^\]]+)?\]\]/g;
const calloutRe = /^>\s*\[!([a-zA-Z]+)\]/;
const headingRe = /^##\s+(.+?)\s*(<!--.*-->)?\s*$/;

for (const n of [...m.notes].sort((a, b) => a.order - b.order)) {
  const full = join(outDir, n.path);
  if (!existsSync(full)) {
    err("missing-note", n.slug, `manifest note has no file at ${n.path}`);
    continue;
  }
  const txt = readFileSync(full, "utf8");
  const { fm, body } = splitFrontmatter(txt);

  // completion
  const status = (fm.match(/^status:\s*(\S+)/m) ?? [])[1];
  if (status !== "complete")
    err("incomplete", n.slug, `status is "${status ?? "missing"}", expected "complete"`);
  if (/\[!info\]\s*Skeleton/i.test(body))
    err("skeleton-marker", n.slug, "skeleton marker still present — note not written");

  const vocab = new Set(n.linkVocab ?? []);
  const lines = body.split("\n");
  const calloutTypePerLine = computeCalloutSpans(lines);

  // beat legality: headings must correspond to this note's beats (or be the
  // fixed Summary/Flashcards sections). A heading naming a known concept that
  // is NOT one of this note's beats is a beat violation.
  const beatConcepts = new Set((n.beats ?? []).map((b) => b.concept));
  const titleToConcept = new Map(m.concepts.map((c) => [c.title.toLowerCase(), c.id]));
  for (const line of lines) {
    const h = line.match(headingRe);
    if (!h) continue;
    const cid = titleToConcept.get(h[1].toLowerCase());
    if (cid && !beatConcepts.has(cid))
      err("beat-illegal", n.slug, `heading "${h[1]}" introduces concept "${cid}" not in this note's beats`);
  }

  // callouts
  for (const line of lines) {
    const c = line.match(calloutRe);
    if (c && !CALLOUT_ENUM.has(c[1].toLowerCase()))
      err("callout-unknown", n.slug, `unknown callout type [!${c[1]}]`);
  }

  // links
  let mt;
  linkRe.lastIndex = 0;
  while ((mt = linkRe.exec(body))) {
    const isEmbed = mt[1] === "!";
    const target = mt[2].trim();
    const block = mt[3] ? mt[3].replace(/^#/, "") : null;
    const lineIdx = body.slice(0, mt.index).split("\n").length - 1;

    const resolved = alias.get(target);
    if (!resolved) {
      const near = nearest(target, alias.keys());
      err(
        "dead-or-noncanonical-link",
        n.slug,
        `[[${target}]] resolves to nothing` +
          (near ? ` (did you mean "${near}"? canonical slugs are not auto-fixed)` : ""),
      );
      continue;
    }

    // transclusion block resolution
    if (isEmbed && block) {
      const decl = blockIdsByTarget.get(target) ?? blockIdsByTarget.get(resolved.noteSlug);
      if (!decl || !decl.has(block.startsWith("^") ? block : `^${block}`))
        err("transclusion-block", n.slug, `![[${target}${mt[3]}]] targets undeclared block id`);
      continue;
    }

    // out-of-vocab (only concept links are vocab-gated; structural links are free)
    if (resolved.kind === "concept" && vocab.size && !vocab.has(resolved.concept)) {
      err(
        "out-of-vocab",
        n.slug,
        `[[${target}]] links concept "${resolved.concept}" outside this note's closed vocabulary — likely a missing concept; quarantine to design`,
      );
    }

    // topological legality
    if (resolved.kind === "concept" && resolved.order >= n.order) {
      const inPreview = PREVIEW_CALLOUTS.has(calloutTypePerLine[lineIdx]);
      if (!inPreview)
        err(
          "forward-ref",
          n.slug,
          `[[${target}]] is taught at order ${resolved.order} >= ${n.order}; illegal forward reference (allowed only inside a preview/tip callout)`,
        );
    }
  }
}

// --- optional external renderers -------------------------------------------
optionalMermaid();
optionalKatex();

// --- report ----------------------------------------------------------------
const errors = findings.filter((f) => f.severity === "error");
const warns = findings.filter((f) => f.severity === "warn");
const report = { ok: errors.length === 0, errors, warns, manifest: manifestPath, outDir };
try {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(join(".antirot"), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
} catch { /* report file is best-effort */ }

for (const f of findings)
  console.log(`${f.severity.toUpperCase()} [${f.code}] ${f.note}: ${f.detail}`);
console.log(`\ncheck: ${errors.length} error(s), ${warns.length} warning(s).`);
process.exit(errors.length ? 1 : 0);

// ---------------------------------------------------------------------------

function computeCalloutSpans(lines) {
  // crude: a callout block is the [!type] line plus following lines that start
  // with ">". Returns per-line callout type (or undefined).
  const out = new Array(lines.length).fill(undefined);
  let cur;
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i].match(calloutRe);
    if (c) { cur = c[1].toLowerCase(); out[i] = cur; continue; }
    if (/^>/.test(lines[i]) && cur) { out[i] = cur; continue; }
    cur = undefined;
  }
  return out;
}

function splitFrontmatter(txt) {
  if (txt.startsWith("---")) {
    const end = txt.indexOf("\n---", 3);
    if (end >= 0) return { fm: txt.slice(3, end), body: txt.slice(end + 4) };
  }
  return { fm: "", body: txt };
}

function nearest(target, keys) {
  const norm = (s) => s.toLowerCase().replace(/[\s_-]+/g, "");
  const t = norm(target);
  for (const k of keys) if (norm(k) === t && k !== target) return k;
  return null;
}

function optionalMermaid() {
  if (!has("mmdc")) { warn("mermaid-skipped", "(optional)", "mmdc not on PATH — DAG mermaid not rendered"); return; }
  // The DAG mermaid lives in the course map; rendering would extract and feed
  // it to mmdc. Hook left intentionally light for the first build.
  warn("mermaid-todo", "(optional)", "mmdc present; wire extraction in a follow-up");
}

function optionalKatex() {
  try { require.resolve("katex"); } catch { warn("katex-skipped", "(optional)", "katex not installed — LaTeX not render-checked"); return; }
  warn("katex-todo", "(optional)", "katex present; wire $..$ extraction in a follow-up");
}

function has(bin) {
  try { execSync(`command -v ${bin}`, { stdio: "ignore" }); return true; }
  catch { return false; }
}

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
