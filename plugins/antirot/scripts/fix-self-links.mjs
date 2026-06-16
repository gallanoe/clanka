#!/usr/bin/env node
// antirot — de-link self-owned concept links (deterministic auto-fix).
//
// Every run, lesson-writers wikilink the concepts their OWN note defines
// (e.g. [[set]] inside the lesson that defines `set`). The checker forbids
// these — a concept link whose home note is this note resolves to order
// >= the note's own order, an illegal self/forward reference. Test-run-3
// produced 187 of them; the orchestrator hand-wrote a de-link pass each time.
// This ships that pass: a concept is defined right here, so just use its name
// in prose instead of linking it.
//
//   node fix-self-links.mjs <manifest.json> [--dry]
//
// De-links ONLY concept links the note itself owns (homeNote === note.slug),
// and ONLY where the checker would flag them — never inside a preview/tip
// callout (forward refs are legal there), and never a transclusion of a def
// block (![[id#^def-id]], which the checker permits). Legitimate prereq links
// to earlier notes are untouched.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const manifestPath = argv.find((a) => !a.startsWith("--"));
const dry = argv.includes("--dry");
if (!manifestPath) {
  console.error("usage: fix-self-links.mjs <manifest.json> [--dry]");
  process.exit(2);
}

const m = JSON.parse(readFileSync(manifestPath, "utf8"));
const outDir = resolve(m.course.outDir);
const conceptById = new Map(m.concepts.map((c) => [c.id, c]));

const linkRe = /(!?)\[\[([^\]|#]+?)(#\^?[^\]|]+)?(\|[^\]]+)?\]\]/g;
const calloutRe = /^>\s*\[!([a-zA-Z]+)\]/;
const PREVIEW = new Set(["preview", "tip"]);

let totalFixed = 0;
const perNote = [];

for (const n of m.notes) {
  const full = join(outDir, n.path);
  if (!existsSync(full)) continue;
  const txt = readFileSync(full, "utf8");
  const lines = txt.split("\n");
  const calloutType = computeCalloutSpans(lines, calloutRe);

  let fixed = 0;
  const out = lines.map((line, idx) => {
    if (!line.includes("[[")) return line;
    const inPreview = PREVIEW.has(calloutType[idx]);
    return line.replace(linkRe, (whole, bang, target, block, alias) => {
      target = target.trim();
      // asset embeds aren't concept links
      if (bang === "!" && /\.(svg|png|jpe?g|gif|webp)$/i.test(target)) return whole;
      const c = conceptById.get(target);
      if (!c || c.homeNote !== n.slug) return whole;          // not a self-owned concept
      if (bang === "!" && block) return whole;                // self def-block transclusion — legal
      if (inPreview) return whole;                            // forward ref legal in preview/tip
      fixed++;
      return alias ? alias.slice(1) : c.title;                // de-link to display text
    });
  });

  if (fixed) {
    if (!dry) writeFileSync(full, out.join("\n"));
    totalFixed += fixed;
    perNote.push({ slug: n.slug, fixed });
  }
}

for (const p of perNote) console.log(`  ${p.slug}: ${p.fixed} self-link(s) de-linked`);
console.log(`fix-self-links: ${totalFixed} self-link(s) across ${perNote.length} note(s)${dry ? " [DRY — files not written]" : ""}.`);

function computeCalloutSpans(lines, re) {
  // Mirrors check.mjs: a callout block is the [!type] line plus following ">" lines.
  const span = new Array(lines.length).fill(undefined);
  let cur;
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i].match(re);
    if (c) { cur = c[1].toLowerCase(); span[i] = cur; continue; }
    if (/^>/.test(lines[i]) && cur) { span[i] = cur; continue; }
    cur = undefined;
  }
  return span;
}
