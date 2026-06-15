---
description: Turn a curriculum outline into a full Obsidian course (design → gate → research → generate → check).
argument-hint: [path to outline, or paste the outline after the command]
---

You are running the **antirot** course-builder. The user's curriculum outline is in `$ARGUMENTS` (a path or pasted text). Drive the pipeline below in order. The manifest is the contract every later step depends on; do not improvise structure.

Plugin root: `${CLAUDE_PLUGIN_ROOT}`. Runtime state lives in `.antirot/` (gitignored): `manifest.json`, `briefs/`, `build-state.json`. Course output goes to the manifest's `course.outDir`.

**Key architecture rule:** never inline the manifest into a Workflow `args` call — it can be hundreds of KB and gets silently trimmed. Workflows get small args (paths + a slug list); the agents read their own brief/the manifest from disk.

## 1 — Design (inline, this session)
Load the `course-design` skill. Read the outline. Produce a **build manifest** that validates against `${CLAUDE_PLUGIN_ROOT}/skills/course-design/manifest.schema.json`:
- extract concepts; build the prereq DAG; every edge gets a calibrated `confidence` (0–1) + one-line `why`
- assign each concept a canonical `homeNote`; lay out notes, modules, paths, slugs
- write each note's **beats** (one new concept per beat) and its closed **`linkVocab`**
- author the **notation table**, **voice** spec + exemplar, and each note's **alreadyTaught** ledger
- tag concept `criticality` + `difficulty`
- set `groundingRequired: true` on concepts the model may not reliably know (niche/cutting-edge/low-confidence/critical)
- plan **exercises** per note (`kind`, prefer apply/derive/prove) and an optional per-module `capstone`
- plan **figures** per note (`figures: [{id, kind, caption}]`) wherever a combinatorial graph helps — graph rewrites, interaction nets, DAGs
- pick `course.outDir` (default `./<Course Title>`)

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
Generates: course map (with DAG mermaid), module overviews (+ capstones), glossary stubs, the Resources appendix, skeleton notes (with beat headings, Exercises, a generated **Further reading** section per lesson), and a small **brief** per note under `.antirot/briefs/`.

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

## 9 — Resolve amendments & revisions
- **Amendments** (blocked writers): ratify trivial ones into the manifest + re-run affected notes; escalate structural ones to the gate (step 3).
- **Revise verdicts** + **seam findings** (reviewer): apply fixes to the named notes, then re-check.

## 10 — Report
Summarize: notes written, what the checker caught and how it was fixed, amendments applied, and — explicitly — residual risk (low-confidence edges that survived, claims the reviewer flagged but couldn't fully verify). Never report "done" without check passing clean.
