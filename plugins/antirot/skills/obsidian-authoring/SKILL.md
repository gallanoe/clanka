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

## Figures — which tool for which job
Pick the tool by what you're showing. Each tool does one thing well; using the wrong one produces broken or ugly output.

| You want to show… | Use | Notes |
|---|---|---|
| **Math** — equations, formulas, matrices, derivations, symbols | **KaTeX** (`$…$` / `$$…$$`) | Math typesetting only. **KaTeX cannot draw graphs or diagrams** — never attempt one in `$…$`. |
| **Process / flow** — flowchart, state machine, sequence, ER, class diagram, simple tree/DAG, git graph | **Mermaid** (inline) | Native, text, no toolchain; good auto-layout for these standard named diagram types. |
| **Combinatorial graph** — nodes & edges, interaction nets (ports), automata, dependency graphs, multi-edges, precise/custom layout | **Figure spec → SVG** (Graphviz) | Ports, clusters, multi-edges, and precise layout that mermaid can't do. |
| **Structured layout** — memory/byte layout, register fields, block architectures (e.g. a Transformer as boxes-and-arrows), pipelines | **Figure spec → SVG** (record/struct nodes) — or a plain **Markdown table** for a pure grid | dot `record` nodes model cells/blocks well. |
| **Pictorial / illustrative** — a scene, a UI mockup, a photo ("a man walking a dog") | **Not generated** — describe in prose, or embed a real external image you have (`![[name.png]]`) | No tool here draws illustrations, and you must never hand-write SVG (coordinate hallucination). |

Rule of thumb, mermaid vs figure-spec→SVG: **mermaid** for the standard named diagram types when its auto-layout is fine; **figure spec → SVG** when you need ports, precise/custom layout, record/struct nodes, or graph-theoretic structure mermaid mangles. Only **figure-spec→SVG** figures are planned in the manifest (`note.figures`) and rendered by the build; mermaid and KaTeX are authored inline as needed.

## LaTeX
- Inline `$...$`, block `$$...$$`. Use the **notation table's exact symbol** for every recurring object — no substitutes.
- Define every symbol you introduce. Balance every delimiter. Avoid bare `$` in prose (write "USD 5" or escape it) so it isn't read as math.

## Mermaid (simple graphs only)
- For a simple node-edge diagram, write mermaid directly — Obsidian renders it natively. Quote every node label (`id["Label (with parens)"]`) so parens/slashes/math don't break the parser; avoid reserved words as node ids.
- The prereq DAG is generated for you; you don't hand-write it.

## Combinatorial graphs & figures (never draw graphs in KaTeX/LaTeX)
**KaTeX renders math, not graphs — never try to draw a graph in `$...$` / `$$...$$`.** For figures that mermaid can't do well (ports, interaction nets, multi-edges, precise rewrite rules), the note has a planned figure (see your brief's `figures`). For each planned figure:
1. Author a **graph spec** — never raw SVG — at `.antirot/figures/<id>.json`:
   ```json
   {"id":"<id>","kind":"digraph"|"graph"|"interaction-net","rankdir":"LR",
    "nodes":[{"id":"a","label":"A","ports":["l","r"]}],
    "edges":[{"from":"a","to":"b","label":"f","fromPort":"r","toPort":"l"}]}
   ```
   Edges may only reference declared node ids (the checker rejects dangling edges).
2. **Embed it inline** where it belongs in the lesson: `![[assets/<id>.svg]]` with a one-line caption beneath.
A build step renders the spec to `assets/<id>.svg`; you never write SVG by hand.

## Definitions live in the lesson, not a glossary
The canonical definition of a concept lives in **the lesson that introduces it** — the `define` beat's `> [!note] Definition ^def-<id>` callout (your skeleton pre-stamps this block; just fill it, don't move or rename `^def-<id>`). There is no separate authored glossary definition.
- Reference a term: `[[concept-id]]` (jumps to its home lesson) or `[[concept-id#^def-id]]` to land on the exact definition block.
- Transclude a definition inline where you genuinely need it: `![[concept-id#^def-id]]`.
- The `Glossary` page is **auto-generated** and transcludes these lesson definitions — never author definitions there.

## Transclusion
- `![[note-or-concept#^block-id]]` embeds a block. Only target a block id that exists (every define beat declares `^def-<id>`; plus any `note.blockIds`). A transclusion to an undeclared block fails the check.

## Flashcards
Under `## Flashcards`, one per line as `Question :: Answer`. The answer must actually answer the question and be entailed by the lesson body (the reviewer round-trips these).

## Lesson shape (fill the skeleton)
The skeleton gives you frontmatter, one `##` heading per beat, a `## Summary`, and a `## Flashcards` section. For each beat:
1. **DEFINE** beat → intuition (plain language) → fill the pre-stamped `> [!note] Definition ^def-<id>` callout (the canonical definition; keep the `^def-<id>` block id) → `> [!example]` worked example → `> [!question]` quick check.
2. **USE** beat → one or two sentences applying the already-defined concept; link it with `[[id]]`.
3. **PREVIEW** beat → a single `> [!tip]` or `> [!preview]` callout pointing ahead; do **not** teach it.

If the skeleton has an `## Exercises` section, fill every planned exercise: a foldable `> [!question]-` matching its declared kind (recall/apply/derive/prove — prefer apply/derive; do not write a circular "restate the definition" check) and a foldable `> [!success]-` solution with a complete, correct, fully-worked answer. Every exercise must have a solution; computational steps must be verifiable (they will be recomputed). Replace every `_(to be written)_` placeholder.

Then write `## Summary` (a `> [!summary]` recap of the new concepts) and the flashcards. When done, set frontmatter `status: complete` and delete the `> [!info] Skeleton` callout.

## Finishing rule
One new concept per beat. No heading for a concept not in your beats. Same object, same symbol, every lesson. Link only within the closed vocabulary. If you can't obey these because the plan is wrong, emit an amendment — don't bend the rules.
