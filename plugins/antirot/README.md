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
  ▼  build-artifacts.mjs ──► deterministic skeleton (MOCs, frontmatter, DAG mermaid, glossary)
  │
  ▼  build-course.js workflow ──► lesson-writers (parallel, model routed by criticality)
  │                               + course-reviewer (claim-level, per lesson) + seam pass
  ▼  check.mjs ──► links / slugs / forward-refs / beats / callouts / transclusions / completion
  │
  ▼  resolve amendments & revisions ──► report (with residual risk surfaced)
```

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

## Components

| Kind | Name | Role |
|---|---|---|
| command | `/antirot` | Orchestrates design → gate → generate → check |
| skill | `course-design` | Pedagogy, DAG, manifest authoring, amendment protocol |
| skill | `obsidian-authoring` | The exact Obsidian syntax the checker enforces |
| skill | `course-review` | Claim-level, chunked, canary-calibrated review method |
| agent | `lesson-writer` | Writes one lesson vs the frozen manifest (parallel); grounds via web when unsure |
| agent | `dag-critic` | Independent critique of the DAG before the gate |
| agent | `researcher` | Fetches real sources for grounding-required concepts |
| agent | `course-reviewer` | Cold adversarial reviewer (per-lesson + seams); verifies against sources |
| workflow | `build-course.js` | Research → fan out writers → review |
| script | `build-artifacts.mjs` | Deterministic skeleton generation |
| script | `check.mjs` | Deterministic structural + completion checks |

## Models

Design, dag-critic, reviewer, and correctness-critical lessons run on Opus 4.8; ordinary lessons on Sonnet 4.6; structural generation and checks are plain Node scripts. Routing is by **correctness-criticality** (from the manifest), not raw difficulty.

## Optional tooling
`check.mjs` runs its core checks with zero dependencies. If `mmdc` (mermaid-cli) or the `katex` package are present, it will additionally render-check the DAG and LaTeX (wiring is stubbed for the first release).

## License
MIT
