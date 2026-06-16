#!/usr/bin/env node
// antirot — deterministic manifest (plan) validator.
//
// Runs right after the design phase, BEFORE the gate and before any generation.
// check.mjs validates the produced course; this validates the *plan*, so a
// malformed manifest is caught before 40 lessons are generated on top of it.
// Deterministic — no LLM, no dependencies.
//
//   node validate-manifest.mjs <manifest.json>
//
// Exit 0 = plan is structurally sound (warnings allowed), 1 = errors, 2 = usage.

import { readFileSync } from "node:fs";

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("usage: validate-manifest.mjs <manifest.json>");
  process.exit(2);
}

let m;
try {
  m = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (e) {
  console.error(`ERROR [unparseable] manifest is not valid JSON: ${e.message}`);
  process.exit(1);
}

const findings = [];
const err = (code, where, detail) => findings.push({ sev: "error", code, where, detail });
const warn = (code, where, detail) => findings.push({ sev: "warn", code, where, detail });

// --- shape ------------------------------------------------------------------
for (const [field, kind] of [["course", "object"], ["concepts", "array"], ["notes", "array"], ["modules", "array"]]) {
  const v = m[field];
  const ok = kind === "array" ? Array.isArray(v) : v && typeof v === "object";
  if (!ok) err("missing-field", "(root)", `"${field}" must be a ${kind}`);
}
if (findings.some((f) => f.code === "missing-field")) finish(); // can't go further safely

for (const f of ["title", "slug", "outDir"])
  if (!m.course?.[f]) err("missing-field", "course", `course.${f} is required`);

// --- indexes + uniqueness ---------------------------------------------------
const concepts = m.concepts ?? [];
const notes = m.notes ?? [];
const modules = m.modules ?? [];
const edges = m.edges ?? [];

const conceptById = index(concepts, "id", "concept id");
const noteBySlug = index(notes, "slug", "note slug");
const moduleBySlug = index(modules, "slug", "module slug");
uniqueField(notes, "order", "note order");

const orderOfConcept = (id) => {
  const home = conceptById.get(id);
  const note = home && noteBySlug.get(home.homeNote);
  return note ? note.order : undefined;
};

// --- concepts ---------------------------------------------------------------
for (const c of concepts) {
  if (!c.homeNote) err("concept-no-home", c.id ?? "(?)", "concept has no homeNote");
  else if (!noteBySlug.has(c.homeNote)) err("dangling-home", c.id, `homeNote "${c.homeNote}" is not a note slug`);
  if (!c.motivation) warn("no-motivation", c.id, "concept has no motivation — the writer has nothing to open the define section with; consider whether it earns its place");
}

// --- edges: refs, confidence, cycles ---------------------------------------
const adj = new Map(concepts.map((c) => [c.id, []]));
for (const e of edges) {
  if (!conceptById.has(e.from)) err("edge-bad-ref", "(edges)", `edge.from "${e.from}" is not a concept`);
  if (!conceptById.has(e.to)) err("edge-bad-ref", "(edges)", `edge.to "${e.to}" is not a concept`);
  if (typeof e.confidence === "number" && (e.confidence < 0 || e.confidence > 1))
    err("edge-confidence", "(edges)", `edge ${e.from}->${e.to} confidence ${e.confidence} out of [0,1]`);
  if (adj.has(e.from) && conceptById.has(e.to)) adj.get(e.from).push(e.to); // from depends on to
}
for (const cyc of findCycles(adj)) err("cycle", "(edges)", `dependency cycle: ${cyc.join(" -> ")}`);

// --- notes: modules, beats, vocab, prereqs, topo, exercises, figures --------
const figureIds = new Map();
for (const n of notes) {
  if (!moduleBySlug.has(n.module)) err("dangling-module", n.slug, `module "${n.module}" not defined`);

  const beatConcepts = new Set();
  for (const b of n.beats ?? []) {
    if (!conceptById.has(b.concept)) err("beat-bad-ref", n.slug, `beat concept "${b.concept}" is not a concept`);
    else beatConcepts.add(b.concept);
    if (b.kind === "define" && conceptById.get(b.concept)?.homeNote !== n.slug)
      err("define-not-home", n.slug, `beat defines "${b.concept}" but its homeNote is "${conceptById.get(b.concept)?.homeNote}"`);
  }

  const prereqs = new Set(n.prereqs ?? []);
  for (const p of prereqs) {
    if (!conceptById.has(p)) { err("prereq-bad-ref", n.slug, `prereq "${p}" is not a concept`); continue; }
    const po = orderOfConcept(p);
    if (po !== undefined && po >= n.order)
      err("prereq-not-earlier", n.slug, `prereq "${p}" is taught at order ${po} >= this note's ${n.order} (forward reference in the plan)`);
  }

  const taught = new Set(n.alreadyTaught ?? []);
  for (const a of taught)
    if (!prereqs.has(a)) warn("alreadytaught-not-prereq", n.slug, `alreadyTaught "${a}" is not in prereqs`);

  // A `use` beat for an already-taught concept becomes an empty section heading,
  // which the writer fills with a "you have already seen…" recap — the dominant
  // prose regression. Drop the beat; link the prereq inline instead.
  for (const b of n.beats ?? [])
    if (b.kind === "use" && taught.has(b.concept))
      warn("recap-beat", n.slug, `use-beat "${b.concept}" is already-taught — drop the beat and link it inline; a use-beat for a known concept produces a recap-opening section`);

  const vocab = new Set(n.linkVocab ?? []);
  for (const v of vocab) if (!conceptById.has(v)) err("vocab-bad-ref", n.slug, `linkVocab "${v}" is not a concept`);
  for (const b of beatConcepts) if (!vocab.has(b)) err("beat-not-in-vocab", n.slug, `beat concept "${b}" missing from linkVocab`);
  for (const p of prereqs) if (conceptById.has(p) && !vocab.has(p)) err("prereq-not-in-vocab", n.slug, `prereq "${p}" missing from linkVocab`);
  for (const v of vocab)
    if (!beatConcepts.has(v) && !prereqs.has(v))
      warn("vocab-extra", n.slug, `linkVocab "${v}" is neither a beat nor a prereq concept`);

  for (const ex of n.exercises ?? [])
    if (!vocab.has(ex.concept)) err("exercise-out-of-vocab", n.slug, `exercise concept "${ex.concept}" not in linkVocab`);

  for (const fig of n.figures ?? []) {
    if (figureIds.has(fig.id)) err("figure-dup-id", n.slug, `figure id "${fig.id}" also used in "${figureIds.get(fig.id)}"`);
    else figureIds.set(fig.id, n.slug);
  }
}

finish();

// ---------------------------------------------------------------------------
function finish() {
  const errors = findings.filter((f) => f.sev === "error");
  for (const f of findings) console.log(`${f.sev.toUpperCase()} [${f.code}] ${f.where}: ${f.detail}`);
  console.log(`\nvalidate-manifest: ${errors.length} error(s), ${findings.length - errors.length} warning(s).`);
  process.exit(errors.length ? 1 : 0);
}

function index(arr, key, label) {
  const map = new Map();
  for (const item of arr ?? []) {
    const k = item?.[key];
    if (k == null) { err("missing-id", label, `an item is missing ${key}`); continue; }
    if (map.has(k)) err("duplicate-id", label, `duplicate ${label} "${k}"`);
    else map.set(k, item);
  }
  return map;
}

function uniqueField(arr, key, label) {
  const seen = new Set();
  for (const item of arr ?? []) {
    const v = item?.[key];
    if (v == null) continue;
    if (seen.has(v)) err("duplicate-order", label, `duplicate ${label} ${v}`);
    seen.add(v);
  }
}

function findCycles(adjMap) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map([...adjMap.keys()].map((k) => [k, WHITE]));
  const cycles = [];
  const stack = [];
  const dfs = (u) => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adjMap.get(u) ?? []) {
      if (color.get(v) === GRAY) cycles.push([...stack.slice(stack.indexOf(v)), v]);
      else if (color.get(v) === WHITE) dfs(v);
    }
    stack.pop();
    color.set(u, BLACK);
  };
  for (const k of adjMap.keys()) if (color.get(k) === WHITE) dfs(k);
  return cycles;
}
