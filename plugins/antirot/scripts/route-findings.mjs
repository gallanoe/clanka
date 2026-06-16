#!/usr/bin/env node
// antirot — deterministic revision prep.
//
// Turns the build-course workflow's return value into the inputs the revise.js
// workflow consumes, so the orchestrator never hand-assembles findings files or
// arg lists (which it previously improvised — costly and error-prone).
//
//   node route-findings.mjs <manifest.json> --result <build-course-result.json> \
//        [--out .antirot/revisions] [--args .antirot/revise-args.json] [--briefs .antirot/briefs]
//
// build-course returns:
//   { written, blocked, amendments:[{slug,type,detail,concept}],
//     needsRevision:[{slug, findings:[{kind,detail}]}],
//     seamFindings:[{seam,detail}] }
//
// This script writes:
//   <out>/<slug>.json   per flagged note: { slug, path, findings:[{kind,detail}] }
//   <out>/_seams.json   the raw seam list (revisers read it and self-route)
//   <out>/_amendments.json  writer amendments, for the orchestrator (manifest/gate)
//   <args>              { manifestPath, outDir, briefsDir, revisionsDir, notes, capstones }
//
// Capstones emitted are only those whose overview still carries a "to be written"
// stub — matching check.mjs's unfilled-stub. Amendments are NOT auto-routed to
// revisers: they may need a manifest edit or the gate, so they are surfaced.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const argv = process.argv.slice(2);
const manifestPath = argv.find((a) => !a.startsWith("--"));
if (!manifestPath) {
  console.error("usage: route-findings.mjs <manifest.json> --result <result.json> [--out dir] [--args path] [--briefs dir]");
  process.exit(2);
}
const valueOf = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : dflt;
};
const resultPath = valueOf("--result");
const outDir = valueOf("--out", join(".antirot", "revisions"));
const argsPath = valueOf("--args", join(".antirot", "revise-args.json"));
const briefsDir = valueOf("--briefs", join(".antirot", "briefs"));

const m = JSON.parse(readFileSync(manifestPath, "utf8"));
const courseOut = resolve(m.course.outDir);
const noteBySlug = new Map(m.notes.map((n) => [n.slug, n]));

let result = { needsRevision: [], seamFindings: [], amendments: [] };
if (resultPath && existsSync(resultPath)) {
  const raw = JSON.parse(readFileSync(resultPath, "utf8"));
  // tolerate the workflow's {summary, result, ...} envelope
  result = raw.result && (raw.result.needsRevision || raw.result.seamFindings) ? raw.result : raw;
} else if (resultPath) {
  console.error(`warn: --result ${resultPath} not found; proceeding with capstones only`);
}

mkdirSync(outDir, { recursive: true });

// --- per-note findings files -----------------------------------------------
const notes = [];
for (const r of result.needsRevision ?? []) {
  const n = noteBySlug.get(r.slug);
  if (!n) { console.error(`warn: needsRevision names unknown slug "${r.slug}" — skipping`); continue; }
  const findings = (r.findings ?? []).map((f) => ({ kind: f.kind ?? "other", detail: f.detail }));
  if (!findings.length) continue;
  writeFileSync(join(outDir, `${r.slug}.json`), JSON.stringify({ slug: r.slug, path: n.path, findings }, null, 2));
  notes.push({ slug: r.slug, path: n.path });
}

// --- shared seam findings (revisers self-route) -----------------------------
writeFileSync(join(outDir, "_seams.json"), JSON.stringify(result.seamFindings ?? [], null, 2));

// --- amendments: surfaced for the orchestrator, NOT auto-applied ------------
writeFileSync(join(outDir, "_amendments.json"), JSON.stringify(result.amendments ?? [], null, 2));

// --- unfilled capstones ------------------------------------------------------
const capstones = [];
for (const mod of m.modules) {
  if (!mod.capstone) continue;
  const modDir = `${String(mod.order).padStart(2, "0")} - ${sanitizeFilename(mod.title)}`;
  const overviewPath = `${modDir}/00 - Overview - ${sanitizeFilename(mod.title)}.md`;
  const full = join(courseOut, overviewPath);
  if (!existsSync(full)) { console.error(`warn: overview for module "${mod.slug}" not found at ${overviewPath}`); continue; }
  const txt = readFileSync(full, "utf8");
  if (!/^##\s+Capstone\s*$/m.test(txt)) continue;
  if (!/to be written/i.test(txt)) continue; // already filled
  capstones.push({
    module: mod.slug,
    overviewPath,
    prompt: mod.capstone.prompt ?? "",
    concepts: mod.capstone.concepts ?? [],
  });
}

// --- emit revise-args.json ---------------------------------------------------
const reviseArgs = {
  manifestPath: resolve(manifestPath),
  outDir: courseOut,
  briefsDir: resolve(briefsDir),
  revisionsDir: resolve(outDir),
  notes,
  capstones,
};
mkdirSync(dirname(argsPath), { recursive: true });
writeFileSync(argsPath, JSON.stringify(reviseArgs, null, 2));

const seamCount = (result.seamFindings ?? []).length;
const amendCount = (result.amendments ?? []).length;
console.log(
  `route-findings: ${notes.length} note(s) to revise, ${capstones.length} capstone(s) to fill, ` +
    `${seamCount} seam finding(s) (revisers self-route), ${amendCount} amendment(s) surfaced.`,
);
console.log(`  revise-args → ${argsPath}`);
if (amendCount) console.log(`  ⚠ ${amendCount} amendment(s) in ${join(outDir, "_amendments.json")} — ratify trivial into the manifest or escalate structural to the gate; not auto-applied.`);

// Kept in sync with build-artifacts.mjs / check.mjs sanitizeFilename.
function sanitizeFilename(s) {
  return String(s)
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
