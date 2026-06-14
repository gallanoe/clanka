---
name: verification
description: Use when implementing code changes that need to be verified correct. Provides the SPEC → RED → GREEN → REFACTOR workflow with evidence requirements at each step.
---

# Verification

Code is correct when there's evidence it's correct. "I think it works" is not evidence.

## The four phases

### SPEC

Before writing code, define what "done" looks like. Pass/fail conditions, observable.

```
SUCCESS CRITERIA:
- <observable outcome 1>
- <observable outcome 2>
```

If you can't write the spec, you don't understand the task — go back to the orchestrator.

### RED

Write a test that *fails* for the right reason — the absence of the feature you're about to build.

```
$ <test command>
FAIL: <test name> — expected <X>, got <Y>
```

Confirm:
- The test fails (not skipped, not errored on setup).
- It fails because the feature is missing, not because of a typo or bad import.

If the test passes already, the feature already exists or your test is wrong.

### GREEN

Write the *minimum* code to make the test pass. No extras. No "while I'm here" cleanups.

```
$ <test command>
PASS: <test name>
```

Confirm:
- The previously-failing test now passes.
- Other tests still pass (no regression).

### REFACTOR

Now improve the code without breaking the tests.

```
$ <test command>
PASS: all tests
```

Refactoring without a green test suite is just rewriting. Don't.

## Evidence to return to the orchestrator

When reporting done, include:
- Spec (what you were verifying against)
- Failing-test output (proves the test was meaningful)
- Passing-test output (proves the implementation works)
- Any non-test verification (manual command runs, log inspection)

## When to skip phases

- **No test framework available.** Skip RED/GREEN; substitute manual verification commands. Document them explicitly.
- **Trivial change** (typo, rename, comment). Skip RED; just verify the change compiled / loaded.
- **Pure refactor** (no behavior change). The existing tests are your spec. Run them before and after.

Skipping phases is a deliberate choice that should be stated in the report. Never skip silently.

## Anti-patterns

- "I added a test." — Did it pass? Was it failing first? Show output.
- "Tests should be added later." — No. Tests demonstrate the change is correct *now*.
- "It compiled, ship it." — Compilation is not correctness.
- Editing the test until it passes. The test is the spec; if you change it, you've redefined "done".
