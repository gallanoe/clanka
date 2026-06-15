---
name: course-design
description: Use when designing an antirot course from a curriculum outline — building the concept dependency DAG, assigning canonical concept homes, authoring the build manifest, defining beat structure, the notation/voice contract, and the already-taught ledger. Triggers on "design a course", "build the manifest", "antirot design phase", "course syllabus", or when /antirot runs its design step. This is the brain of the design phase; it does not write lesson prose.
---

# Course design — authoring the build manifest

The design phase converts a vague outline into a **frozen coordination manifest** (`skills/course-design/manifest.schema.json`). Everything downstream executes on top of it, so design errors propagate. Two facts shape this whole skill:

- The manifest controls **names, order, and structure** — not semantics or correctness. Get the structure right; correctness is caught later by checks and review.
- You are a fallible author with no calibrated certainty. **Express uncertainty explicitly** (edge confidences, criticality tags) so the gate and the dag-critic can find your mistakes before they cost a full build.

## The pedagogy model (what the manifest encodes)

- **Concept dependency DAG.** Lessons are generated in topological order. A concept may only be *used* after its canonical definition.
- **One-new-thing-per-beat.** Each note is a short ordered list of *beats*; each beat introduces or uses exactly one concept. This bounds load — and because it lives in the manifest (not in prose), it is checkable.
- **Define / use / preview.** Every concept *mention* has a kind: `define` (the canonical home — the writer follows the arc **motivate → build intuition → formal definition → worked example → quick check**, see the `lesson-craft` skill), `use` (reference an already-defined concept), `preview` (a flagged forward pointer, allowed only as a callout).
- **Motivation is first-class.** Every concept carries a `motivation`: *why it exists* — the problem it solves, or the limitation of a prior concept that demands it (e.g. "the simple approach breaks down at scale → so we need this"). The DAG gives logical order; motivation gives the narrative reason, which order alone can't. Without it, concepts arrive because it's their turn, not because the reader feels the need.
- **Pacing is two axes, not one.** `density` (word economy) and `scaffolding` (motivation + intuition depth) are independent. "Fast but not confusing" = low density of words + healthy scaffolding — economical prose where every concept is still motivated and intuited. Do **not** equate fast with thin; cutting motivation to save words is the failure you are designing against.

## Procedure

1. **Extract concepts + their motivation.** Atomic, teachable units. If a candidate bundles several ideas a reader must absorb separately, split it (under-decomposition overloads a beat); if two "concepts" are always taught together, merge them (over-decomposition bloats the graph). For each, write a one-line `motivation` — the problem it solves or the prior-concept limitation it resolves. If you can't motivate a concept, question whether it belongs in the course.
2. **Build the DAG.** For each concept, ask: what must the reader already understand for its *definition and first worked example* to make sense? Those are its prereq edges. For every edge set `confidence` honestly (0–1) and a one-line `why` (e.g. "concept B's definition refers to concept A"). Low confidence is information, not weakness — it tells the gate where to look. **No cycles.**
3. **Assign canonical homes.** Each concept gets exactly one `homeNote` — the unique `define` site. A concept seeded as intuition early and formalized later: the *formal* note is the home; the early mention is a `preview`.
4. **Lay out notes & modules.** Group into modules, assign a global topological `order` to every note (lower order = taught earlier). Give every note a `path` and a kebab-case `slug`.
5. **Write beats per note.** The ordered concepts the note covers, each tagged define/use/preview. A note defines a concept iff it is that concept's `homeNote`.
6. **Compute the closed `linkVocab`** for each note: its beat concepts + its prereqs + any glossary concept it references. This is the *only* set the lesson-writer may link to — anything else is a build failure, which surfaces missing concepts.
7. **Author the contracts (pillar A):**
   - **notation table** — one canonical LaTeX symbol per recurring object. The single biggest source of cross-lesson drift; freeze it here.
   - **voice** — register, person, and a 1–2 paragraph **exemplar passage**. Writers imitate the exemplar; an adjective list ("fast-paced, clear") does not anchor independent samples. Write the exemplar in the actual voice you want.
   - **alreadyTaught ledger** — per note, which prereqs the reader has already seen (so the writer links instead of re-teaching).
8. **Tag criticality, difficulty & grounding** per concept. `criticality: critical` = downstream correctness depends on it → routed to the stronger model and to claim-level review. `difficulty: proof` is treated as critical too. Set `groundingRequired: true` on any concept the writing model may not reliably know — niche, cutting-edge, low-confidence, or correctness-critical. Those concepts get a real-source research pass (the `researcher` agent) before they are written, and their `sources` populate the Resources appendix. Be generous here: an LLM is most fluent — and most confidently wrong — exactly on specialized material it has only seen in passing.
9. **Pick `course.outDir`** and both pacing axes — `density` (word economy: terse/balanced/gentle) **and** `scaffolding` (on-ramp depth: lean/standard/rich) — plus `assumedBackground`, `timeBudgetMin`. For a fast-paced course that doesn't confuse, default to `density: terse` (or `balanced`) with `scaffolding: standard` or `rich`. Never reach for `gentle` density as a substitute for scaffolding — verbosity is not motivation.

Write the result to `.antirot/manifest.json` and confirm it satisfies the schema.

## Understanding-checks

Exercises are planned in the manifest so coverage and solutions are *checkable*, not left to the writer's whim (the same move that made pacing checkable via beats):

- Every define beat carries a per-beat **quick check** (the writer emits it; the checker requires one understanding-check per defined concept).
- Give each note an `exercises` list — `concept` + cognitive `kind`. **Prefer `apply` / `derive` / `prove` over `recall`** (recall is the quick check's job; a manifest full of recall exercises produces a course that tests memory, not understanding). Optionally `interleave` already-taught (lower-order) concepts for spaced retrieval.
- Give a module an optional `capstone` integrating several of its concepts — the end-of-module synthesis.

Every exercise and capstone gets a foldable, verified solution at generation time; the checker enforces that solutions exist and the reviewer verifies they're correct. Plan the *kind* well: that is the lever that decides whether the course builds understanding or just quizzes recall.

## Tiering

Count the lesson notes. ≤5 → the course is written inline, serially. >5 → the generation workflow fans out writers. Either way the manifest is identical; only execution differs.

## The amendment protocol (pillar C — the freeze is an optimistic lock)

Correctness is only fully discoverable while writing prose, which happens *after* the manifest is frozen. So the freeze must not be absolute. A lesson-writer that discovers the manifest is wrong returns an **amendment** rather than inventing a link, teaching inline, or omitting. When amendments come back:

- **Trivial** (a clearly-missing prereq edge, a concept to flag for the glossary): ratify into the manifest and re-run only the affected notes.
- **Structural** (a concept needs splitting, a home is wrong, a cycle was masked): escalate to the human gate — do not auto-apply.

Treat manifest immutability as a parallelization optimization, never as a correctness guarantee.

## What you must not do

Do not write lesson prose here. Do not present the DAG as authoritative — surface low-confidence edges and dag-critic flags at the gate for human judgment. Do not let a tidy mermaid diagram substitute for checking the edges that matter.
