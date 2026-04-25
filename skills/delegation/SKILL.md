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
