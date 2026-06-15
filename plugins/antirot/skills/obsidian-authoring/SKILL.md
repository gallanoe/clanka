---
name: obsidian-authoring
description: Use when writing antirot lesson prose into Obsidian-flavored Markdown — wikilinks, callouts, LaTeX, mermaid, transclusion, flashcards, and frontmatter. Triggers on "write the lesson", "Obsidian note", "callout/wikilink/LaTeX/flashcard syntax", or when a lesson-writer fills a skeleton. Covers the exact syntax the deterministic checker enforces, so following it keeps the build green.
---

# Obsidian authoring conventions

These syntaxes are underrepresented in training data and fail in predictable ways. The checker enforces the rules below; matching them keeps the build green. Structural artifacts (frontmatter, MOCs, the DAG mermaid) are generated from the manifest — you write *prose only*, between the beat headings already in the skeleton.

## Wikilinks
- `[[concept-id]]` links to a concept's canonical home note (resolved via the alias the skeleton declares). `[[concept-id|display text]]` for custom text.
- Link **only** concept ids in this note's closed `linkVocab`. Never invent a target, never guess a slug variant (`gradient_descent` vs `gradient-descent`) — the checker rejects non-canonical slugs and does not auto-fix them.
- Never link a concept taught later (higher `order`) outside a preview callout — that's an illegal forward reference.

## Callouts (closed enum — others are rejected)
`note` `info` `example` `question` `tip` `warning` `summary` `preview` `success`. Semantics:
- `> [!note]` — a definition or key fact
- `> [!example]` — a worked example
- `> [!question]` — a quick check (the per-beat comprehension check) or an exercise
- `> [!success]` — a solution to an exercise
- `> [!tip]` / `> [!preview]` — going-deeper or a **forward pointer** (the only place a later concept may be linked)
- `> [!warning]` — a common mistake
- `> [!summary]` — the end-of-lesson recap

Every continuation line of a callout must begin with `>`. To declare a transcludable block, append `^block-id` to the callout's first line: `> [!note] Definition ^def-confluence`.

**Foldable callouts** (attempt-then-reveal): append `-` to collapse by default, `+` to expand. Exercises and their solutions are foldable so the learner attempts before revealing:

```
> [!question]- Exercise — derive: <concept>
> <the task>

> [!success]- Solution
> <full worked solution; every computational step shown>
```

## LaTeX
- Inline `$...$`, block `$$...$$`. Use the **notation table's exact symbol** for every recurring object — no substitutes.
- Define every symbol you introduce. Balance every delimiter. Avoid bare `$` in prose (write "USD 5" or escape it) so it isn't read as math.

## Mermaid
- You generally do not hand-write mermaid — the DAG is generated. If you must, quote every node label (`id["Label (with parens)"]`) so parentheses, slashes, and math don't break the parser, and avoid reserved words as node ids.

## Transclusion
- `![[concept-glossary#^def-concept]]` embeds a glossary definition. Only target a block id that was actually declared (glossary stubs declare `^def-<id>`). A transclusion to an undeclared block fails the check.

## Flashcards
Under `## Flashcards`, one per line as `Question :: Answer`. The answer must actually answer the question and be entailed by the lesson body (the reviewer round-trips these).

## Lesson shape (fill the skeleton)
The skeleton gives you frontmatter, one `##` heading per beat, a `## Summary`, and a `## Flashcards` section. For each beat:
1. **DEFINE** beat → intuition (plain language) → `> [!note]` formal definition (declare a block id if it's a glossary concept) → `> [!example]` worked example → `> [!question]` quick check.
2. **USE** beat → one or two sentences applying the already-defined concept; link it with `[[id]]`.
3. **PREVIEW** beat → a single `> [!tip]` or `> [!preview]` callout pointing ahead; do **not** teach it.

If the skeleton has an `## Exercises` section, fill every planned exercise: a foldable `> [!question]-` matching its declared kind (recall/apply/derive/prove — prefer apply/derive; do not write a circular "restate the definition" check) and a foldable `> [!success]-` solution with a complete, correct, fully-worked answer. Every exercise must have a solution; computational steps must be verifiable (they will be recomputed). Replace every `_(to be written)_` placeholder.

Then write `## Summary` (a `> [!summary]` recap of the new concepts) and the flashcards. When done, set frontmatter `status: complete` and delete the `> [!info] Skeleton` callout.

## Finishing rule
One new concept per beat. No heading for a concept not in your beats. Same object, same symbol, every lesson. Link only within the closed vocabulary. If you can't obey these because the plan is wrong, emit an amendment — don't bend the rules.
