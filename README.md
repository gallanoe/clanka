# clanka

A multi-agent orchestration framework (plugin) for Claude Code.

## What it is

When clanka is enabled, the `orchestrator` agent becomes the main conversation thread. This is configured via the plugin's root `settings.json` (`"agent": "orchestrator"`), which Claude Code loads at session start.

The orchestrator never implements directly — it has no `Edit` tool and its `Write` is restricted to the run-directory at `.claude/clanka/run/`. Instead, it:

1. **Classifies your intent** — explicit task, exploratory question, open-ended goal, or ambiguous request.
2. **Delegates to specialist subagents** using the `delegation` skill (a 7-section prompt template that ensures specialists can execute without follow-up turns).
3. **Synthesizes their results** — one finding per specialist, contradictions named, a single merged answer to your original ask.
4. **Verifies completion** before reporting done — claims require evidence (test output, file contents, command results), not inference.

A run-scoped memory layer under `.claude/clanka/run/<task-id>/` carries state across steps. After each unit-level milestone the orchestrator writes a `progress.json` checkpoint there, which survives context compaction.

## Install

```
/plugin marketplace add gallanoe/clanka
/plugin install clanka@clanka
/reload-plugins
```

Restart Claude Code once after installing. The orchestrator is set as the main agent at session start via `settings.json` — a reload alone is not enough on first install.

## Heads-up: it takes over the main agent

While clanka is enabled, **every session** is orchestrator-driven. That means:

- All work goes through delegation — even trivial changes are handed to a `general` worker rather than implemented inline.
- Token use and latency are higher than a single-agent session.
- Advisory specialists (read-only agents) may run in parallel; write workers are always serialized.

Disable via `/plugin` when you want a normal single-agent session.

## Agents

| Agent | Model | Role |
|---|---|---|
| `orchestrator` | opus | Main thread; classifies intent, delegates, synthesizes, verifies; never implements directly |
| `explorer` | sonnet | Codebase search; returns findings with file:line, not file dumps |
| `researcher` | sonnet | External docs/web research with citations |
| `reasoner` | opus | Deep reasoning for hard architecture/debugging; read-only; used sparingly |
| `planner` | sonnet | Breaks a goal into an ordered, atomic plan |
| `scope-analyst` | sonnet | Pre-planning; surfaces ambiguities as clarifying questions |
| `critic` | opus | Red-teams a plan before coding |
| `code-reviewer` | opus | Post-implementation diff review in independent/fresh context |
| `frontend` | sonnet | UI / React / CSS / accessibility implementation |
| `document-writer` | sonnet | Technical docs (READMEs, guides, references) |
| `viewer` | sonnet | Interprets screenshots, PDFs, images, diagrams |
| `general` | sonnet | Default implementation worker (backend, scripts, refactors, fixes) |

## How it routes work

These are prompt-encoded conventions the orchestrator is instructed to follow, not hard runtime guarantees enforced by a separate runtime layer.

**Read-only / advisory tasks** fan out to multiple specialists in parallel — `explorer` + `researcher`, for example, can run simultaneously.

**Write / coding work** is routed by *coupling*. Before delegating, the orchestrator applies a Coupling Test:

- If the work shares contracts, shared state, or cross-file design decisions, it is one coupled unit — the entire unit goes to a single `general` or `frontend` worker that carries full context for all sub-steps.
- If the work is genuinely independent (no shared contract), it may go to separate workers, but still serialized — two write workers never run concurrently.
- When coupling is ambiguous, the orchestrator defaults to one unit. Over-merging costs only context budget; over-splitting causes cross-unit contract drift.

After implementation, a cold `code-reviewer` pass runs in a fresh context (no prior worker reasoning in scope).

**Skills used by the orchestrator:**

- `delegation` — a 7-section template (TASK, EXPECTED OUTCOME, REQUIRED SKILLS, REQUIRED TOOLS, MUST DO, MUST NOT DO, CONTEXT) that ensures specialists can execute without follow-up turns.
- `verification` — a SPEC → RED → GREEN → REFACTOR workflow for write-workers, with evidence requirements at each phase.

## Updating

Bump `version` in `.claude-plugin/plugin.json`, push to the repo, then run:

```
/plugin marketplace update clanka
```

on each machine. Updates are version-gated — no version bump means no update is detected.

Current version: `0.2.0` (see `.claude-plugin/plugin.json`).

## License

MIT
