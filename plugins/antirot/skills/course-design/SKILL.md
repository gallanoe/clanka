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
- **One-new-thing-per-beat.** Each note is a short ordered list of *beats*; each beat introduces or uses exactly one concept. This is the pacing governor — and because it lives in the manifest (not in prose), it is checkable.
- **Define / use / preview.** Every concept *mention* has a kind: `define` (the canonical home — give intuition → formal def → worked example → quick check), `use` (reference an already-defined concept), `preview` (a flagged forward pointer, allowed only as a callout).

## Procedure

1. **Extract concepts.** Atomic, teachable units. If a candidate bundles several ideas a reader must absorb separately, split it (under-decomposition overloads a beat); if two "concepts" are always taught together, merge them (over-decomposition bloats the graph).
2. **Build the DAG.** For each concept, ask: what must the reader already understand for its *definition and first worked example* to make sense? Those are its prereq edges. For every edge set `confidence` honestly (0–1) and a one-line `why` ("beta-reduction uses substitution in its definition"). Low confidence is information, not weakness — it tells the gate where to look. **No cycles.**
3. **Assign canonical homes.** Each concept gets exactly one `homeNote` — the unique `define` site. A concept seeded as intuition early and formalized later: the *formal* note is the home; the early mention is a `preview`.
4. **Lay out notes & modules.** Group into modules, assign a global topological `order` to every note (lower order = taught earlier). Give every note a `path` and a kebab-case `slug`.
5. **Write beats per note.** The ordered concepts the note covers, each tagged define/use/preview. A note defines a concept iff it is that concept's `homeNote`.
6. **Compute the closed `linkVocab`** for each note: its beat concepts + its prereqs + any glossary concept it references. This is the *only* set the lesson-writer may link to — anything else is a build failure, which surfaces missing concepts.
7. **Author the contracts (pillar A):**
   - **notation table** — one canonical LaTeX symbol per recurring object. The single biggest source of cross-lesson drift; freeze it here.
   - **voice** — register, person, and a 1–2 paragraph **exemplar passage**. Writers imitate the exemplar; an adjective list ("fast-paced, clear") does not anchor independent samples. Write the exemplar in the actual voice you want.
   - **alreadyTaught ledger** — per note, which prereqs the reader has already seen (so the writer links instead of re-teaching).
8. **Tag criticality, difficulty & grounding** per concept. `criticality: critical` = downstream correctness depends on it → routed to the stronger model and to claim-level review. `difficulty: proof` is treated as critical too. Set `groundingRequired: true` on any concept the writing model may not reliably know — niche, cutting-edge, low-confidence, or correctness-critical. Those concepts get a real-source research pass (the `researcher` agent) before they are written, and their `sources` populate the Resources appendix. Be generous here: an LLM is most fluent — and most confidently wrong — exactly on specialized material it has only seen in passing.
9. **Pick `course.outDir`** and pacing knobs (`density`, `assumedBackground`, `timeBudgetMin`).

Write the result to `.antirot/manifest.json` and confirm it satisfies the schema.

## Tiering

Count the lesson notes. ≤5 → the course is written inline, serially. >5 → the generation workflow fans out writers. Either way the manifest is identical; only execution differs.

## The amendment protocol (pillar C — the freeze is an optimistic lock)

Correctness is only fully discoverable while writing prose, which happens *after* the manifest is frozen. So the freeze must not be absolute. A lesson-writer that discovers the manifest is wrong returns an **amendment** rather than inventing a link, teaching inline, or omitting. When amendments come back:

- **Trivial** (a clearly-missing prereq edge, a glossary stub to add): ratify into the manifest and re-run only the affected notes.
- **Structural** (a concept needs splitting, a home is wrong, a cycle was masked): escalate to the human gate — do not auto-apply.

Treat manifest immutability as a parallelization optimization, never as a correctness guarantee.

## What you must not do

Do not write lesson prose here. Do not present the DAG as authoritative — surface low-confidence edges and dag-critic flags at the gate for human judgment. Do not let a tidy mermaid diagram substitute for checking the edges that matter.
