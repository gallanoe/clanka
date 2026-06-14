---
description: Turn a curriculum outline into a full Obsidian course (design → gate → generate → check).
argument-hint: [path to outline, or paste the outline after the command]
---

You are running the **antirot** course-builder. The user's curriculum outline is in `$ARGUMENTS` (a path or pasted text). Drive the pipeline below. Do not improvise structure — the manifest is the contract every later step depends on.

Plugin root: `${CLAUDE_PLUGIN_ROOT}`. Runtime state lives in `.antirot/` (gitignored). Course output goes to the manifest's `course.outDir`.

## 1 — Design (inline, this session)
Load the `course-design` skill. Read the outline. Produce a **build manifest** that validates against `${CLAUDE_PLUGIN_ROOT}/skills/course-design/manifest.schema.json`:
- extract concepts and build the prerequisite DAG; give every edge a calibrated `confidence` (0–1) and a one-line `why`
- assign each concept a canonical `homeNote`; lay out notes, modules, paths, slugs
- write the **beat structure** for every note (one new concept per beat) and its **closed `linkVocab`** (its beats + prereqs + glossary only)
- author the **notation table**, the **voice spec + exemplar passage**, and each note's **alreadyTaught** ledger
- tag concept `criticality` (`critical` = downstream correctness depends on it) and `difficulty`
- pick `course.outDir` (default `./<Course Title>`); confirm it with the user if ambiguous

Write the manifest to `.antirot/manifest.json`. Sanity-check it parses and satisfies the schema before continuing.

## 2 — Independent DAG critique
Spawn the `dag-critic` agent with the full manifest. It looks for missing/spurious edges, cycles, mis-homed concepts, and over/under-decomposition. Fold clearly-correct fixes back into the manifest; carry genuinely uncertain ones into the gate.

## 3 — Gate (do not skip, no "approve all" shortcut)
Present to the user, using AskUserQuestion where a decision is needed:
- the module/lesson outline and the prereq DAG
- **the lowest-confidence edges first**, plus every dag-critic flag, each as an explicit accept/fix choice

Iterate until the user approves. Re-write `.antirot/manifest.json` on every change. Only proceed once the user has explicitly approved.

## 4 — Deterministic skeleton
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/build-artifacts.mjs .antirot/manifest.json --state .antirot/build-state.json
```
This generates the course map (with the DAG mermaid), module overviews, glossary stubs, frontmatter, and beat-headed skeleton notes — all from the manifest, never by hand.

## 5 — Generate (tiered)
- **≤5 lessons:** write them inline, serially, yourself — follow the `lesson-writer` agent's rules exactly (closed vocab, notation table, voice exemplar, one-new-thing-per-beat, amend-don't-invent).
- **>5 lessons:** invoke the generation workflow. Read `.antirot/manifest.json`, parse it, and call the Workflow tool with `scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/build-course.js"` and `args` set to the parsed manifest object. It fans out `lesson-writer`s (model routed by criticality) and runs the `course-reviewer` per lesson plus a cross-seam pass.

## 6 — Check
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs .antirot/manifest.json --report .antirot/check-report.json
```
Fix every hard error (dead/non-canonical links, forward refs, out-of-vocab links, beat violations, unresolved transclusions, incomplete notes) by editing the offending note or, if it's a structural problem, by amending the manifest and re-running from step 4 for affected notes only.

## 7 — Resolve amendments & revisions
- **Amendments** from blocked writers (`missing-prereq` / `mis-homed` / `needs-split`): ratify trivial ones into the manifest and re-run only the affected notes; escalate structural ones back to the gate (step 3).
- **Revise verdicts** and **seam findings** from the reviewer: apply the fixes to the named notes, then re-check.

## 8 — Report
Summarize for the user: notes written, what the checker caught and how it was fixed, any amendments applied, and — explicitly — anything still uncertain (low-confidence edges that survived, claims the reviewer flagged but couldn't fully verify). Never report "done" without the check passing clean; surface residual risk plainly.
