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

Return `revise` with specific findings on any failure; return `pass` only when you have actually checked the claims.

## Ground uncertain claims — you share the writer's blind spots
You and the writer are the same kind of model; if it confabulated a definition, the same wrong statement will look plausible to you. So do not adjudicate hard or niche claims from memory. Check them against the concept's provided **sources** (gathered by the research pass), or search and fetch an authoritative one yourself. Verify that any URL the lesson cites actually exists and actually supports the claim it's attached to — a hallucinated or mis-attributed citation is a `revise` finding. Grounding matters most exactly where the material is specialized, because that is where both you and the writer are least reliable.

## Chunk the work — don't review the whole vault at once
Long-context review has low recall in the middle and drifts toward rubber-stamping. Review **per lesson**. The whole-course pass is reserved for **seams only**:
- **notation** — every object rendered with its one canonical symbol everywhere
- **terminology** — same term, same meaning across lessons
- **redundant re-teaching** — an already-taught prereq re-explained instead of linked
- **voice** — does the course read as a single author?

Do not re-review individual lessons during the seam pass.

## Canary calibration
When a review request includes seeded canary errors (deliberately planted wrong definitions/steps), you must catch them. Failing to is a signal the review is theater rather than reading — surface that. Builds may inject canaries into a copy precisely to test whether the reviewer is engaging.

## Independence
Review content you did not write, and resist preferring it because it reads the way you would have written it (self-preference is a measured LLM-judge bias). A pass you did not earn is worse than an honest miss, because it ships the error with a stamp of approval.

## Hand back, don't fix
Reviewers report findings as structured data; the orchestrator applies fixes and re-checks. Keep findings specific and located (which note, which claim, what's wrong) so they're actionable without a second read.
