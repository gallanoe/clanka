---
name: lesson-craft
description: Use when writing antirot lesson prose — how to motivate a concept, build intuition before formalism, pace without confusing, and design worked examples. Triggers on "write the lesson", "explain this concept", "motivation/intuition/pacing", "fast but not confusing", or when a lesson-writer fills a skeleton. This is the writing craft; obsidian-authoring is the syntax, course-design is the plan.
---

# Lesson craft — motivate, build intuition, pace without confusing

A lesson is not a definition dump in topological order. The reader should feel *why* each concept exists before they meet its formalism, and should never be confused even when the prose is fast. This skill is the craft for that. The plan (beats, vocab, sources) is in your brief; the syntax is in `obsidian-authoring`; here is how to actually write.

## The define-beat arc
For every `define` beat, write in this order — it is the spine of a good explanation:

1. **Motivate.** Open with *why this concept exists*. Your brief gives a one-line `motivation` (usually the limitation of a prior concept: "the approach so far falls apart once the input gets large → we need something that doesn't"). Expand it into a sentence or two that makes the reader *want* the concept before it arrives. This is not optional and not padding — it is the difference between a concept that lands and one that's just *there*.
2. **Build intuition.** Before any formalism: a concrete instance, a picture, or an analogy. Concrete before abstract; example before definition where it helps. Give the one-sentence mental model the reader can carry ("a graph is just dots joined by lines — the dots hold data, the lines say what's related"). State analogies' limits if they can mislead.
3. **Formal definition.** Now fill the pre-stamped `> [!note] Definition ^def-<id>` callout. Precise, every symbol defined. The reader meets the formalism already knowing what it's *for* and what it *feels like*.
4. **Worked example.** A minimal but non-trivial instance, every step shown, tied back to the definition. Pick the smallest example that still exercises the idea (not so trivial it's vacuous).
5. **Quick check.** A `> [!question]` that probes the new concept — something a reader who *gets it* can answer and one who skimmed can't.

A `use` beat skips 1–4: name the already-defined concept, link it (`[[concept]]`), apply it. A `preview` beat is one `> [!tip]` pointer forward — no teaching.

## Motivation craft
- Lead with the **need**, not the name. "Here is X" is weak; "We keep hitting Y, which X fixes" is strong.
- The best motivation is usually the **previous concept's limitation** — the course is a chain of "that almost works, but…". Use the prior beat/lesson as the setup.
- Tie to a stake the reader already has (a problem from an earlier lesson, a goal of the course). Motivation is a bridge from what they know to what they're about to learn.

## Intuition craft
- **Concrete before abstract.** A specific instance first, then generalize. Don't open with the universally-quantified statement.
- **Example before definition** when the definition is dense — let the reader pattern-match, then name the pattern.
- **Analogy with a leash.** An analogy is a fast on-ramp; always say where it breaks so it doesn't become a misconception.
- Give the **portable one-liner** — the sentence the reader will repeat to themselves later.

## Pacing without confusing (the two axes)
`density` and `scaffolding` are independent (see your brief's `pacing`).
- **density = word economy.** terse = no padding, no hedging, no restatement, high info-rate. gentle = more words, more elaboration. This controls *how many words per idea*.
- **scaffolding = on-ramp depth.** lean = minimal motivation/intuition. rich = thorough. This controls *how much motivation and intuition per concept*.

Fast-but-not-confusing = **terse density + standard/rich scaffolding**: economical sentences, but every concept still motivated and intuited. To hit it:
- **Cut freely:** filler, hedging ("it's worth noting that"), throat-clearing, restating what was just said, meta-commentary about the lesson itself.
- **Never cut to save words:** the motivation, the load-bearing step of a derivation, the definition of a symbol, the one intuition that makes the concept click. If you must trade, trade words elsewhere.
- Confusion comes from a *missing step or missing motivation*, not from brevity. A terse lesson that keeps every step is clear; a verbose one that skips the motivation is not.

## Worked-example design
- Smallest instance that still shows the idea working.
- Show **every** step — the ones you'd "obviously" skip are where readers get lost (and where your math gets silently checked).
- End by connecting the result back to the definition or motivation ("…which is exactly the result the definition promised").

## What good looks like vs the failure
- **Good:** the reader meets each concept already wanting it, gets a concrete feel, then the precise definition, then sees it work — fast, no wasted words, no gaps.
- **Failure (what you're avoiding):** concepts dumped in dependency order, each opening with a formal definition, no sense of why, "fast" achieved by cutting the on-ramp. Technically complete, pedagogically dead.
