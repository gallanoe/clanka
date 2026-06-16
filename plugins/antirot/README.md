# antirot

Turn a high-level curriculum outline into a fully-written, fast-paced, **Obsidian-native** Markdown course. Enable the plugin, run `/antirot` with an outline, approve the generated syllabus, and get a linked vault of lessons + appendices.

## Install

```
/plugin marketplace add gallanoe/clanka
/plugin install antirot@clanka
```

Then, in any project where you want the course written:

```
/antirot path/to/outline.md
```

(or paste the outline after the command). Output lands in a course directory in your cwd; point Obsidian at it.

## How it works

antirot is built around one idea: **separate what's knowable in advance from what's only knowable while writing.** A frozen *manifest* coordinates the former (note paths, slugs, the concept dependency graph, beat structure, the notation/voice contract); deterministic checks and an adversarial review catch the latter (whether the prose is actually correct).

```
outline
  │
  ▼  design (inline, Opus) ── dag-critic ──► GATE (you approve, low-confidence edges first)
  │
  ▼  research.js ──► fetch real sources for grounding-required concepts ──► persist to manifest
  │
  ▼  build-artifacts.mjs ──► skeleton (MOCs, frontmatter, DAG mermaid)
  │                          + per-note briefs + per-lesson Further reading + Resources
  ▼  build-course.js workflow ──► lesson-writers (parallel, read briefs, routed by criticality)
  │                               + course-reviewer (claim-level, per lesson) + seam pass
  ▼  build-figures.mjs ──► render graph specs → committed SVG
  │
  ▼  check.mjs ──► links / slugs / forward-refs / beats / exercises / callouts / citations / figures
  │
  ▼  route-findings.mjs ──► turn review verdicts + seams into per-note findings + revise args
  │
  ▼  revise.js workflow ──► reviser per flagged note + capstone writers
  │                         + MANDATORY verify loop (re-review every touched note, re-revise until clean)
  ▼  report (with residual risk surfaced)
```

> **Scale note:** the workflow never receives the manifest as `args` (it can be hundreds of KB and gets silently trimmed). It gets a small slug list + paths; each lesson-writer reads its own per-note **brief** from `.antirot/briefs/<slug>.json`.

### The manifest (`.antirot/manifest.json`)
The coordination spine. Schema: `skills/course-design/manifest.schema.json`. It freezes names, order, and structure — **not** correctness. Its freeze is an *optimistic lock*: a lesson-writer that finds the plan wrong emits an **amendment** instead of inventing a link, so reality can flow back into the plan.

### Why this shape
LLMs are most dangerous exactly where they're most fluent — confident, wrong definitions and proofs. So:
- structural artifacts are **generated, not written** (no hallucinated mermaid/frontmatter/slugs)
- lesson-writers link only within a **closed vocabulary** (forbid by omission, not instruction)
- a **deterministic checker** proves structure (it can't be sycophantic)
- a **cold, claim-level, canary-tested** reviewer judges meaning, chunked per-lesson to avoid long-context rubber-stamping
- a **notation/voice/already-taught contract** keeps parallel writers from drifting
- a **research pass** fetches real sources for concepts the model may not reliably know, so writers ground definitions in fact instead of fluent recall, the reviewer verifies against them, and the Resources appendix is built from real (not hallucinated) citations
- **understanding-checks are planned in the manifest** (per-beat quick checks, per-lesson exercises by cognitive kind, per-module capstones) with foldable attempt-then-reveal solutions; the checker enforces coverage + solution-present and the reviewer verifies the solutions are correct
- **per-lesson Further reading** is stamped into each note from that note's verified sources (deterministic — the model never emits citation URLs)
- **definitions are lesson-canonical**: a concept is defined once, in the lesson that introduces it (a pre-stamped `^def-<id>` block); every reference links/jumps there (`[[concept]]` / `[[concept#^def-id]]`) or transcludes it (`![[concept#^def-id]]`) — no separate glossary, no duplicated or fragmented definitions
- **motivation is first-class**: every concept carries a `motivation` (why it exists / the prior-concept limitation it resolves); define sections open with it and build intuition *before* the formal definition. Pacing is two axes — `density` (word economy) and `scaffolding` (on-ramp depth) — so "fast" never means "unmotivated" (the checker flags a definition with no motivation before it; the reviewer judges depth)
- **combinatorial graphs are spec-driven** — writers author a graph spec (never raw SVG), rendered to committed SVG by Graphviz; KaTeX is math-only, so graphs never go through it

## Components

| Kind | Name | Role |
|---|---|---|
| command | `/antirot` | Orchestrates design → gate → generate → check → revise |
| skill | `course-design` | Pedagogy, DAG, manifest authoring, amendment protocol |
| skill | `obsidian-authoring` | The exact Obsidian syntax the checker enforces |
| skill | `lesson-craft` | Writing craft: motivate, build intuition, pace without confusing, design examples |
| skill | `course-review` | Claim-level, chunked, canary-calibrated review method |
| agent | `lesson-writer` | Writes one lesson vs the frozen manifest (parallel); grounds via web when unsure |
| agent | `dag-critic` | Independent critique of the DAG before the gate |
| agent | `researcher` | Fetches real sources for grounding-required concepts |
| agent | `course-reviewer` | Cold adversarial reviewer (per-lesson + seams); verifies against sources |
| workflow | `research.js` | Pre-step: fetch real sources for grounding-required concepts |
| workflow | `build-course.js` | Fan out writers (read per-note briefs) + review |
| workflow | `revise.js` | Apply review/seam findings + fill capstones, then re-verify every touched note in a loop until clean |
| script | `build-artifacts.mjs` | Deterministic skeleton + per-note briefs + per-lesson Further reading + Resources |
| script | `merge-sources.mjs` | Persist researcher output into the manifest (unwraps the workflow envelope; sanitizes to schema) |
| script | `fix-self-links.mjs` | De-link self-owned concept links (the systematic writer forward-ref) — keeps prereq/preview/transclusion links |
| script | `route-findings.mjs` | Turn build-course verdicts/seams/capstones into per-note findings + `revise.js` args |
| script | `build-figures.mjs` | Render graph specs → committed SVG (Graphviz) |
| script | `check.mjs` | Deterministic structural / completion / citation / figure checks |

## Models

Design, dag-critic, reviewer, and correctness-critical lessons run on Opus 4.8; ordinary lessons on Sonnet 4.6; structural generation and checks are plain Node scripts. Routing is by **correctness-criticality** (from the manifest), not raw difficulty.

To override the writer or researcher model, just ask in the prompt — e.g. "use Opus 4.8 for all writers" or "use Opus for research." The command passes `writerModel` / `researcherModel` to the workflows; the reviewer stays on Opus regardless.

## Optional tooling
`check.mjs` runs its core checks with zero dependencies. If `mmdc` (mermaid-cli) or the `katex` package are present, it will additionally render-check the DAG and LaTeX (wiring is stubbed for the first release).

## License
MIT
