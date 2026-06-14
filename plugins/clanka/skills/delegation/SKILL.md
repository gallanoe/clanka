---
name: delegation
description: Use when about to spawn a specialist subagent and crafting the delegation prompt. Provides the 7-section template that ensures specialists can execute without follow-up turns.
---

# Delegation

A delegation prompt that's missing a section costs an extra round-trip. The 7 sections are not optional.

## Template

```
TASK: <single, specific, atomic action — one sentence>

EXPECTED OUTCOME: <concrete deliverable + how to know it's done>

REQUIRED SKILLS: <expertise needed — usually implicit from agent choice, but state if non-obvious>

REQUIRED TOOLS: <specific tools the specialist should use; restricts scope>

MUST DO:
- <exhaustive list of requirements>
- <leave nothing implicit>

MUST NOT DO:
- <forbidden actions — common: don't modify unrelated files, don't refactor while you're at it, don't exceed N lines of response>

CONTEXT:
- File paths: <relevant files>
- Patterns: <code patterns to match or avoid>
- Constraints: <project rules, deadlines, dependencies>
- Background: <prior turns the specialist needs to know about>
```

## Section-by-section

### TASK
One sentence. Verb-first. Atomic — if you can't describe the work in one sentence, the task is too big and needs to be split.

Bad: "Improve authentication."
Good: "Replace the JWT validation middleware in api/middleware/auth.go with the new RS256-based version."

### EXPECTED OUTCOME
What the *result* looks like, observable. Not "auth works" — "the test in api/middleware/auth_test.go passes, and `curl -H 'Authorization: Bearer ...' /api/me` returns 200 with a valid token, 401 with invalid."

### REQUIRED SKILLS
For most delegations this is implicit (you chose the specialist). State it explicitly when:
- Multiple specialists could plausibly handle the task
- The task crosses domains
- A skill module (e.g., `verification`) should be loaded

### REQUIRED TOOLS
Lock down what the specialist uses. If the task is read-only analysis, list `Read, Grep, Glob` and explicitly say "no Write/Edit". This prevents tool sprawl.

### MUST DO
Exhaustive. Everything you would notice if it were missing. Tests? Comments? Updating callers? Updating docs? Verifying with a command? List it all.

### MUST NOT DO
The most common entries:
- "Do not modify files outside <list>"
- "Do not refactor unrelated code"
- "Do not add error handling for cases that can't happen"
- "Keep your response under N lines"
- "Do not run destructive commands"

### CONTEXT
Everything the specialist needs that isn't in their system prompt. File paths the specialist should read first. Project conventions. Prior decisions. The user's actual ask (specialists don't see the user's original message — only your delegation).

## Anti-patterns

- "Read these files and tell me what they do" — this is not a delegation, this is asking the specialist to do your reading for you. Read them yourself or spawn `explorer` for structured findings.
- "Do whatever you think is best" — the specialist's context is narrower than yours; this is an abdication, not a delegation.
- Delegations longer than ~50 lines — if you need that much context, the task is too big. Split it.

## Run directory

Every non-trivial task gets a canonical run directory at `.claude/clanka/run/<task-id>/`. The `Write` tool auto-creates parent directories — no `mkdir` is used anywhere.

### Task-id naming

- When a plan exists: `<task-id>` equals the planner's `<short-name>` (so `.claude/clanka/run/<short-name>/` aligns with `.claude/clanka/plans/<short-name>.md`).
- When no plan exists: `<task-id>` is `<YYYYMMDD-HHMMSS-slug>`.

### Handoff files (SEAM-SCOPED)

Per-unit handoff files land at `handoff/<NN>-<agent>.md` inside the run directory, where `<NN>` is a zero-padded unit index **assigned by the orchestrator** — not chosen by the worker.

**SEAM-SCOPED firing rule:** A write-worker writes its handoff file when it **completes a unit**. A successor unit reads the predecessor unit's exact handoff path. Within a single unit there is NO inter-step handoff — the one worker carries its own context for all sub-steps. Handoff files fire at SEAMS between units, not between sub-steps within a unit.

**EXPLICIT-PATH rule:** The orchestrator assigns each write-worker an exact handoff WRITE path (including the orchestrator-chosen `<NN>`) per unit via the delegation CONTEXT. A write-worker reads only the exact predecessor unit's handoff path(s) the orchestrator passes it — it does NOT scan or list the `handoff/` directory. Read-only advisory agents receive no handoff write path.

**JIT path-passing:** When a plan file or prior diff is relevant, the orchestrator passes its PATH in CONTEXT and the worker reads it just-in-time — the orchestrator does not inline the content.

### `progress.json` (orchestrator checkpoint)

The orchestrator writes `.claude/clanka/run/<task-id>/progress.json` as its structured checkpoint. Schema:

```json
{
  "task_id": "<task-id>",
  "plan_path": "<path or null>",
  "steps": [
    { "step": "<name>", "agent": "<agent>", "status": "<status>", "files_touched": [], "summary": "<summary>" }
  ],
  "open_risks": [],
  "blockers": [],
  "merged_answer_so_far": "<accumulated synthesis>",
  "updated_at": "<ISO 8601>"
}
```

**SINGLE-WRITER rule:** ONLY the orchestrator writes `progress.json`. Write-workers do NOT write `progress.json`.

### ALWAYS-SERIALIZE rule

Write-workers (`general`, `frontend`, `document-writer`) are ALWAYS serialized — the orchestrator NEVER runs two write-workers concurrently, regardless of whether their target files differ. Read-only advisory agents (`explorer`, `researcher`, `reasoner`, `critic`, `scope-analyst`, `viewer`) MAY run in parallel.

### Mid-unit overflow fallback

If a worker cannot complete its assigned unit within its context budget, it MUST return `STATUS: partial` — NOT `ok` — with a handoff recording what is done, what remains, and the exact continuation point. The orchestrator then re-delegates the remaining scope to a fresh worker of the same type, passing the predecessor handoff path, effectively splitting the over-large unit at runtime.

### Conditionality escape hatch

If the delegation CONTEXT includes no run-dir path, the worker skips the handoff ritual entirely.

## Return schema

Every write-worker (`general`, `frontend`, `document-writer`) MUST include the following eight fields in its return. This schema does NOT apply to `code-reviewer` or the read-only advisory roster (`explorer`, `researcher`, `reasoner`, `critic`, `scope-analyst`, `viewer`) — those agents use their own defined output formats.

```json
{
  "decisions_made": ["<decision 1>", "..."],
  "alternatives_rejected": ["<option considered but not taken, with reason>", "..."],
  "assumptions": ["<assumption 1>", "..."],
  "files_touched": ["<path>", "..."],
  "commands_run": ["<command>", "..."],
  "key_errors": ["<error encountered and resolution>", "..."],
  "unresolved_risks": ["<risk 1>", "..."],
  "evidence": ["<test output, grep result, or observable confirmation>", "..."]
}
```

Fields may be empty arrays when not applicable, but all eight keys must be present.
