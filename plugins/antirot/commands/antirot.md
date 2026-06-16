---
description: Turn a curriculum outline into a full Obsidian course (design → gate → research → generate → check).
argument-hint: [path to outline, or paste the outline after the command]
---

You are running the **antirot** course-builder. The user's curriculum outline is in `$ARGUMENTS` (a path or pasted text). Drive the pipeline below in order. The manifest is the contract every later step depends on; do not improvise structure.

Plugin root: `${CLAUDE_PLUGIN_ROOT}`. Runtime state lives in `.antirot/` (gitignored): `manifest.json`, `briefs/`, `build-state.json`. Course output goes to the manifest's `course.outDir`.

**Key architecture rule:** never inline the manifest into a Workflow `args` call — it can be hundreds of KB and gets silently trimmed. Workflows get small args (paths + a slug list); the agents read their own brief/the manifest from disk.

**Pass `args` as a JSON object value, not a JSON-encoded string.** A stringified `args` reaches the workflow as a bare string with no `.manifestPath`/`.notes`, so the run aborts spuriously (`missing-manifestPath` / `bad-args`). The workflows now defensively coerce a stringified `args` back to an object, but pass it correctly regardless. If a `scriptPath` workflow call fails on args, fix the args shape and **re-invoke the same script** — do **not** reimplement `build-course.js` / `research.js` / `revise.js` inline. Hand-authoring an inline equivalent defeats the deterministic pipeline, reintroduces the manifest-trimming bug, and overloads this session; the canned scripts are the contract. The revision/verification/capstone phase is `revise.js` (step 9) — invoke it, don't rebuild it.

## 1 — Design (inline, this session)
Load the `course-design` skill. Read the outline. Produce a **build manifest** that validates against `${CLAUDE_PLUGIN_ROOT}/skills/course-design/manifest.schema.json`:
- extract concepts; write a one-line `motivation` per concept (why it exists / the prior-concept limitation it resolves); build the prereq DAG; every edge gets a calibrated `confidence` (0–1) + one-line `why`
- assign each concept a canonical `homeNote`; lay out notes, modules, paths, slugs
- write each note's **beats** (one new concept per beat) and its closed **`linkVocab`**
- author the **notation table**, **voice** spec + exemplar, and each note's **alreadyTaught** ledger
- tag concept `criticality` + `difficulty`
- set `groundingRequired: true` on concepts the model may not reliably know (niche/cutting-edge/low-confidence/critical)
- plan **exercises** per note (`kind`, prefer apply/derive/prove) and an optional per-module `capstone`
- plan **figures** per note (`figures: [{id, kind, caption}]`) wherever a combinatorial graph helps — dependency graphs, state machines, trees, networks
- pick `course.outDir` (default `./<Course Title>`) and both pacing axes — `density` (word economy) and `scaffolding` (motivation/intuition depth); "fast but not confusing" = terse/balanced density + standard/rich scaffolding (never `gentle` density as a substitute for scaffolding)

Write it to `.antirot/manifest.json`. Then run the deterministic **plan check** and fix every error before continuing:
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.mjs .antirot/manifest.json
```
It catches structural plan bugs (cycles, dangling homeNote/beat/vocab/prereq refs, prereqs that aren't topo-legal, duplicate ids/orders, exercise/figure scope) before any generation happens. Do not proceed past errors.

## 2 — Independent design critique (surface it)
Spawn the `dag-critic` agent with the manifest. It judges what the validator can't — semantically wrong dependency edges, mis-homed concepts, decomposition, plus pedagogy (overloaded beats, weak exercise plan, grounding gaps). **Show the user a summary of its findings**; do not silently fold them in.

## 3 — Gate (mandatory; no "approve all" shortcut)
Use AskUserQuestion to walk the user through:
- the module/lesson outline and the prereq DAG
- **the lowest-confidence edges first**, plus every dag-critic flag, each as an explicit accept/fix choice

Iterate, re-writing `.antirot/manifest.json` on each change. **Do not proceed to generation until the user has explicitly approved.** This gate is a core safety step — never skip or auto-pass it.

## 4 — Research (ground before writing)
Build the small grounding list from the manifest: `grounding = concepts.filter(c => c.groundingRequired).map(c => ({id: c.id, title: c.title}))`. If non-empty, invoke the Workflow tool with `scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/research.js"` and `args: { manifestPath: "<abs path to .antirot/manifest.json>", grounding }`. It returns `{ sources: { conceptId: [...] } }`.

If the user asked for a specific research model — e.g. "use Opus for research" — add `researcherModel: "opus"` (or `sonnet`/`fable`/`haiku`) to the args. Omit to default to Sonnet.

Persist those sources back into `.antirot/manifest.json` (set each concept's `sources`). This must happen **before** build-artifacts so Further reading + Resources are generated from real citations.

## 5 — Deterministic skeleton + briefs
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/build-artifacts.mjs .antirot/manifest.json --state .antirot/build-state.json --briefs .antirot/briefs
```
Generates: course map (with DAG mermaid), module overviews (+ capstones), the Resources appendix, skeleton notes (with beat headings, a pre-stamped `^def-<id>` Definition callout per define beat, Exercises, and a generated **Further reading** section), and a small **brief** per note under `.antirot/briefs/`. No glossary — definitions are lesson-canonical (`^def-<id>` in the home lesson) and linked inline.

It also **canonicalizes note file paths** (filename = the note title, folder = the module's `NN - title`) and writes the manifest back, so the slug is purely a stable link ID and Obsidian surfaces the title. Downstream steps read the updated paths from the manifest — build args (step 6) and checks (step 8) pick up the canonical paths automatically.

## 6 — Generate (tiered)
- **≤5 lessons:** write them inline, serially, following the `lesson-writer` rules (read each note's brief at `.antirot/briefs/<slug>.json`; closed vocab; notation; voice; one-new-thing-per-beat; fill exercises with verified solutions; amend-don't-invent; leave the generated Further reading untouched).
- **>5 lessons:** invoke the Workflow tool with `scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/build-course.js"` and **small args**:
  ```
  { manifestPath, outDir, briefsDir: ".antirot/briefs",
    notes: [ {slug, title, path, critical} ... ],
    writerModel?: "opus" | "sonnet" | "fable" | "haiku" }
  ```
  where `critical` is true if any of the note's beat concepts has `criticality: "critical"` or `difficulty: "proof"`. Do NOT put the manifest, concepts, beats, or sources in args — writers read their brief from disk.
  **`writerModel`** (optional): if the user asked for a specific writer model — e.g. "use Opus 4.8 for all writers" / "write everything with Opus" — pass it here (`"opus"`) to force every lesson-writer to that model. Omit to keep the default cost-routing (Opus for critical notes, Sonnet otherwise). The reviewer stays on Opus regardless.

## 7 — Figures (render graph specs to SVG)
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/build-figures.mjs .antirot/manifest.json --out <outDir>
```
Compiles each `antirot-graph` figure spec authored in the lessons into a committed SVG under `<outDir>/assets/` and ensures the embed exists. (Needs `@hpcc-js/wasm` or a system `dot`; warns and skips if absent.)

## 8 — Check
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs .antirot/manifest.json --report .antirot/check-report.json
```
Fix every hard error: bad links, forward refs, out-of-vocab links, beat/exercise/solution coverage, citation validity, figure specs. Edit the offending note, or amend the manifest and re-run from step 5 for affected notes only.

## 9 — Resolve amendments, revisions & capstones (workflow, don't improvise)
The build-course workflow returns `{ needsRevision, seamFindings, amendments, blocked }`, and the module **capstone** solutions ship as stubs (build-artifacts stamps the placeholders; writers fill lessons, not overviews). Do **not** hand-roll a revision loop, a verification sweep, or a capstone-fill pass — the `revise.js` workflow owns all three, including a **mandatory** re-verify loop (a reviser fixing one bug can introduce another; spot-checking misses it).

1. **Save** the build-course return value to `.antirot/build-course-result.json`.
2. **Prep deterministically:**
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/route-findings.mjs .antirot/manifest.json --result .antirot/build-course-result.json
   ```
   It writes per-note findings files to `.antirot/revisions/<slug>.json`, the shared `_seams.json`, an `_amendments.json`, and `.antirot/revise-args.json` (note + unfilled-capstone lists, with absolute paths).
3. **Amendments** (`.antirot/revisions/_amendments.json`, NOT auto-applied): ratify trivial ones into the manifest + re-run affected notes from step 5; escalate structural ones to the gate (step 3). Trivial ratifiable case: a note legitimately needs an earlier-taught concept not in its `linkVocab`/`prereqs` — add it.
4. **Revise + verify + capstones:** if `revise-args.json` has any `notes` or `capstones`, read it and invoke the Workflow tool with `scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/revise.js"` and `args` set to that **object** (not a stringified copy). Pass `writerModel` through as `reviserModel` if the user pinned a writer model. The workflow fans out a reviser per flagged note (applies its findings + any seam naming it, under closed-vocab / no-self-link rules), fills each capstone, then re-reviews every touched note and re-revises failures until clean (`maxVerifyRounds`, default 2).
5. Surface its `stillFailing` (items the verify loop couldn't clear) and `blocked` (revisers that need a plan change) — fix those yourself or escalate to the gate.
6. **Re-run the checker (step 8). It must pass clean before you report done.**

## 10 — Report
Summarize: notes written, what the checker caught and how it was fixed, amendments applied, and — explicitly — residual risk (low-confidence edges that survived, claims the reviewer flagged but couldn't fully verify). Never report "done" without check passing clean.
