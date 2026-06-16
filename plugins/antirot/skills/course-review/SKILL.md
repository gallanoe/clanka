---
name: course-review
description: Use when reviewing antirot course content for correctness and pacing — the judgment a deterministic checker cannot make. Triggers on "review the lesson", "check the course", "verify the explanations", or when the course-reviewer agent runs. Covers claim-level verification, canary calibration, chunked review, and the cross-lesson seam pass.
---

# Course review — catching fluent-but-wrong content

The deterministic checker (`check.mjs`) already proved the structure: links resolve and are canonical, no forward references, callouts valid, transclusions resolve, notes complete. Review judges **meaning**, which a script cannot. This is the layer that stands between the user and a confidently-wrong explanation — the worst failure a learning tool can ship.

## The core failure mode
LLM-written technical prose is fluent and confidently wrong: definitions with a swapped quantifier, proofs that glide past the load-bearing step, worked examples with a wrong algebraic move, flashcard answers that don't follow. All of these read beautifully. **Fluency is not evidence.** Self-consistency is not truth. Treat every claim as wrong until checked.

## Review is claim-level, never holistic
Do not skim a lesson and pronounce it good — that is exactly how LLM judges miss errors and rubber-stamp. Instead extract and verify in isolation:
- **Definitions** — correct, complete, all symbols defined? Watch quantifiers and necessary-vs-sufficient confusions.
- **Theorems / claims** — is the statement right? Does any proof sketch actually hold, or skip the hard step?
- **Worked examples** — recompute every step yourself; flag any that doesn't follow.
- **Flashcards** — does the answer answer the question, and is it entailed by the body?
- **Exercises & solutions** — does each exercise require its declared kind (not a circular restatement)? Recompute computational solutions; confirm conceptual ones are correct, complete, and reachable from the lesson. A wrong solution is worse than a wrong explanation, because the learner self-checks against it.
- **Pacing** — genuinely one new concept per beat, or are extra concepts smuggled in undefined?
- **Prose quality** — judge against the brief's `voice.exemplar` and `pacing` (`density` + `scaffolding`), not a generic ideal:
  - **Opens on the problem, not the prereqs** — a lesson/section opening with a prereq recap ("you have already seen…", "as a refresher…") instead of the concept's motivation is a `revise`.
  - **Motivation → intuition → formal, as scaffolding dictates** — `standard`/`rich` must motivate + build intuition before the definition; `lean` may go straight to formal (don't flag a terse foundational note for it).
  - **Establishes before it uses** — flag a notion the lesson leans on as if known but never built (not defined here, not a prereq, no intuition). The classic case is a **representation shift** (a term taught as an inductive grammar, then used "as a tree → as a graph" with the picture asserted, not established). The checker is blind to it — the notion is plain prose, not a `[[concept]]` — so it is yours to catch. It's the opposite of a recap: a recap re-explains the known; this fails to explain the relied-upon. Don't dismiss it as "universal background."
  - **Voice matches the exemplar** — judge against the brief's `voice.exemplar`, not your own preference.
  - **Examples carry intuition** — flag decorative examples or examples that always land after every definition; the box is fine, the sequencing is the issue.
  - **Earns its length** — padding/hedging/restatement against a terse density; but a `gentle` course's elaboration is intended, not padding.
  - **Don't over-flag** — a one-line `[[prereq]]` pointer is correct (ban the recap *ledger*, not orientation); honor the manifest's chosen density/scaffolding/voice.

Return `revise` with specific findings on any failure; return `pass` only when you have actually checked the claims.

## Ground uncertain claims — you share the writer's blind spots
You and the writer are the same kind of model; if it confabulated a definition, the same wrong statement will look plausible to you. So do not adjudicate hard or niche claims from memory. Check them against the concept's provided **sources** (gathered by the research pass), or search and fetch an authoritative one yourself. Verify that any URL the lesson cites actually exists and actually supports the claim it's attached to — a hallucinated or mis-attributed citation is a `revise` finding. Grounding matters most exactly where the material is specialized, because that is where both you and the writer are least reliable.

## Chunk the work — don't review the whole vault at once
Long-context review has low recall in the middle and drifts toward rubber-stamping. Review **per lesson**. The whole-course pass is reserved for **seams only**:
- **notation** — every object rendered with its one canonical symbol everywhere
- **terminology** — same term, same meaning across lessons
- **redundant re-teaching** — an already-taught prereq re-explained instead of linked
- **voice** — does the course read as a single author?
- **opener/template repetition** — do many lessons open with the same formula sentence (e.g. "Here is the move that makes X…")? Stamped openings read as machine-generated; flag the template so it gets varied.

Do not re-review individual lessons during the seam pass.

## A re-review is not correctness-only
When you re-review a lesson after a reviser applied fixes (or in any verification sweep), the tight goal is "did the fix land and introduce no new error" — but do **not** narrow the lens to *correctness alone*. A pass scoped to "recompute the math, ignore pacing/intuition" is exactly how an introduce-before-use gap survives every layer: the checker can't see it (it's prose), and a correctness-only reviewer is told not to look. Keep the establishes-before-it-uses lens on in re-reviews too. (This is a real post-mortem: a "terms are trees" assumption passed the writer's reviewer, the checker, *and* a correctness-scoped verification sweep — only a human reading for flow caught it.)

## Canary calibration
When a review request includes seeded canary errors (deliberately planted wrong definitions/steps), you must catch them. Failing to is a signal the review is theater rather than reading — surface that. Builds may inject canaries into a copy precisely to test whether the reviewer is engaging.

## Independence
Review content you did not write, and resist preferring it because it reads the way you would have written it (self-preference is a measured LLM-judge bias). A pass you did not earn is worse than an honest miss, because it ships the error with a stamp of approval.

## Hand back, don't fix
Reviewers report findings as structured data; the orchestrator applies fixes and re-checks. Keep findings specific and located (which note, which claim, what's wrong) so they're actionable without a second read.
