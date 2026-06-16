#!/usr/bin/env node
// antirot — persist researcher output into the manifest (deterministic).
//
// The research.js workflow returns { sources: { conceptId: [{title,url,kind?,note?}] } },
// but a Workflow task's saved output wraps it in a {summary, result, ...}
// envelope, so the sources live at $.result.sources — a path the orchestrator
// has mis-read before (merging 4 of 27 concepts, nearly shipping a course with
// almost no citations). This script unwraps it robustly, sanitizes each source
// to the manifest schema, and writes the manifest back in place.
//
//   node merge-sources.mjs <manifest.json> --result <research-result.json> [--dry]
//
// --result may be the raw workflow return OR the enveloped task-output file.

import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const manifestPath = argv.find((a) => !a.startsWith("--"));
const valueOf = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
const resultPath = valueOf("--result");
const dry = argv.includes("--dry");

if (!manifestPath || !resultPath) {
  console.error("usage: merge-sources.mjs <manifest.json> --result <research-result.json> [--dry]");
  process.exit(2);
}

const m = JSON.parse(readFileSync(manifestPath, "utf8"));
const raw = JSON.parse(readFileSync(resultPath, "utf8"));

// Unwrap the {summary, result, ...} envelope: try the nesting levels the
// Workflow runtime can produce, deepest-meaningful first.
function findSources(o, depth = 0) {
  if (!o || typeof o !== "object" || depth > 4) return null;
  if (o.sources && typeof o.sources === "object" && !Array.isArray(o.sources)) return o.sources;
  if (o.result) return findSources(o.result, depth + 1);
  return null;
}
const sources = findSources(raw);
if (!sources) {
  console.error("error: no { sources: { conceptId: [...] } } object found in --result (looked through .result envelopes)");
  process.exit(1);
}

const KINDS = new Set(["paper", "book", "docs", "reference", "tutorial", "other"]);
const conceptById = new Map(m.concepts.map((c) => [c.id, c]));

let merged = 0, total = 0, dropped = 0, unknownIds = 0;
for (const [id, list] of Object.entries(sources)) {
  const c = conceptById.get(id);
  if (!c) { console.error(`warn: result names unknown concept id "${id}" — skipping`); unknownIds++; continue; }
  const clean = [];
  for (const s of Array.isArray(list) ? list : []) {
    const title = (s?.title ?? "").trim();
    const url = (s?.url ?? "").trim();
    if (!title || !url) { dropped++; continue; }
    try { const u = new URL(url); if (u.protocol !== "http:" && u.protocol !== "https:") { dropped++; continue; } }
    catch { dropped++; continue; }
    const out = { title, url };
    if (s.kind && KINDS.has(s.kind)) out.kind = s.kind;
    if (s.note && String(s.note).trim()) out.note = String(s.note).trim();
    clean.push(out);
  }
  if (clean.length) { c.sources = clean; merged++; total += clean.length; }
}

if (!dry) writeFileSync(manifestPath, JSON.stringify(m, null, 2));

console.log(`merge-sources: ${merged} concept(s) given sources, ${total} source(s) total${dropped ? `, ${dropped} dropped (missing title/url or bad URL)` : ""}${unknownIds ? `, ${unknownIds} unknown id(s) skipped` : ""}${dry ? " [DRY — manifest not written]" : ""}.`);

// Surface grounding gaps the checker would later hard-error on (ungrounded).
const stillEmpty = m.concepts.filter((c) => c.groundingRequired && !(c.sources ?? []).length);
if (stillEmpty.length) {
  console.error(`⚠ ${stillEmpty.length} groundingRequired concept(s) still have no sources — re-run research for: ${stillEmpty.map((c) => c.id).join(", ")}`);
  process.exit(1);
}
