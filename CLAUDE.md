# 5E BattleMaster

A Roll20 Mod (API) script that automates D&D 5E combat. This repo is Matt's fork of `posadist-revolution/5E-BattleMaster`, being modernized in phases.

`TODO.md` is the source of truth for the roadmap, phase status and each phase's exit criteria. Read it at the start of a session; do not rely on status written anywhere else, including this file.

## Platform constraints

- The shipped script runs in Roll20's Mod sandbox, not Node: one script file, Roll20 globals only (`on`, `sendChat`, `getObj`, `findObjs`, `createObj`, `Campaign`, `state`, `log`), no `require`, filesystem or network.
- It cannot be run locally. Local verification is the unit suite (`npm test`, which chains several test files). Live smoke tests in a Roll20 game are done by Matt; when a phase's exit criterion needs one, write the checklist for him instead of claiming the phase is done.
- An uncaught exception stops the sandbox for the whole table. Guard every lookup.
- Check Roll20 API behaviour against the current Roll20 Mod documentation, not memory. The original script is about nine years old and several signatures have changed.

## Scope decisions for V1 (settled - do not reopen without asking)

- Target character sheet: D&D 5E by Roll20 (2014).
- Shaped sheet support is being removed. Beacon / 2024 sheet support is deferred to V2.
- DeathMarkersPlus no longer exists. V1 uses Roll20's native status markers; custom markers are a V2 extension.

## Conventions

- Chat commands read like what is happening at the table: `!combat roll initiative`, `!combat begin round 2`, `!combat end`. New commands follow that grammar.
- Every behaviour change ships with unit tests, and `npm test` must pass before anything is called done.
- README changes are batched to the close of a phase. During a phase, collect them in the phase's notes instead of editing the README.

## Seats - who does what

You are the orchestrator. You plan, write task specs, run tests, integrate and report. You do not write implementation code. Exceptions: edits of a few lines needed to land a delegated change, plus docs, `TODO.md` and task specs.

| Seat | How | Notes |
|---|---|---|
| Coder | `codex-coder` subagent (Codex CLI, sandboxed) | Starts with no context: the spec is all it knows |
| Reviewer | `gemini-reviewer` subagent (Gemini CLI, read-only) | Reads `.claude/review-focus.md` automatically |
| Advice | the advisor tool | Consult it before work that touches turn-order handling, persistent `state`, or Roll20 API signatures, and whenever an error recurs |
| Escalation | `fable-escalation` subagent | Only after the coder seat has failed the same task twice, or when a root cause is unknown |

## Loop for each change

1. Pick the next item from `TODO.md` and restate its exit criterion.
2. Make sure the tree is clean (`git status`). Commit or ask first, so every delegated step can be reverted.
3. Write a task spec (template below) and give it to `codex-coder`.
4. When it returns, read the diff yourself and run `npm test`. A failing suite goes back to the coder with the failure output, once.
5. Send the change to `gemini-reviewer`. For every finding, either send a fix spec to the coder or rebut it in one sentence. Never drop a finding silently. UNVERIFIED findings about Roll20 behaviour get checked against the Roll20 docs.
6. Second failure of the same task at step 4 or 5: stop delegating, consult the advisor, then hand the full history to `fable-escalation`.
7. When tests pass and review is clean or rebutted, show Matt a summary - what changed, test result, findings and how each was resolved - and wait for his go-ahead before committing.

If a seat reports SEAT-ERROR, tell Matt which seat is down and what the error said. Do not quietly do that seat's job yourself.

## Task spec template

```
# Task: <one line>
## Goal and done-condition
<what must be true afterwards, including which tests must pass or be added>
## Context
<files, functions and line ranges involved; the TODO.md item; relevant Roll20 API facts, quoted from the docs>
## Change
<what to implement, as precisely as you can state it>
## Do not
<files and behaviours that must not change; no new dependencies; do not edit tests to make them pass unless the task says so; do not commit>
## Verify
Run `npm test` and report the result.
```

## Repo map

<!-- Not filled in yet. First session: read the repo and replace this comment with a short map - the main script, the test files and what each suite covers, and where phase notes live. -->
