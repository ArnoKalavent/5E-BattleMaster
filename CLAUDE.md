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
- AOE spells and Movement are cut from V1 entirely - the code is deleted, not
  flagged off. The V1 turn menu is exactly two actions: Weapon Attack and Direct
  Spell. Both return as new features after baseline functionality is proven; the
  findings needed to rebuild them are recorded in `TODO.md` under the 2026-09-24
  scope decision. Do not reintroduce a button for an action that does not work.

## Conventions

- Chat commands read like what is happening at the table: `!combat roll initiative`, `!combat begin round 2`, `!combat end`. New commands follow that grammar.
- Every behaviour change ships with unit tests, and `npm test` must pass before anything is called done.
- README changes are batched to the close of a phase. During a phase, collect them in the phase's notes instead of editing the README.
- The script always prints its build rev on startup: a `-=> BattleMaster <rev> <=-` banner logged in the `on('ready')` handler before anything else runs. The rev lives in the `buildRev` literal near the top of `5ebattlemaster.js`, left as `'dev (unstamped)'` in source and filled in only by `npm run build`, which writes `dist/5ebattlemaster.js`. Deploy by pasting `dist/`, never the source file. Any change that touches the banner, the literal or `tools/build.js` keeps that guarantee intact - an unstamped or wrongly-stamped paste is how a stale build goes unnoticed.

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
5. Stage everything first (`git add -A`), then send the change to `gemini-reviewer`. The reviewer and the freshness check both read the INDEX, because that is what `git commit` records; the seat script refuses to run with unstaged or untracked files present. For every finding, either send a fix spec to the coder or rebut it in one sentence. Never drop a finding silently. UNVERIFIED findings about Roll20 behaviour get checked against the Roll20 docs.
6. Second failure of the same task at step 4 or 5: stop delegating, consult the advisor, then hand the full history to `fable-escalation`.
7. When tests pass and review is clean or rebutted, show Matt a summary - what changed, test result, findings and how each was resolved - and wait for his go-ahead before committing.
8. Before every commit, run `npm run review:status`. Commit only on FRESH with an approving verdict. STALE, NO REVIEW RECORDED, or a recorded `CHANGES REQUESTED` all mean go back to step 5 - a fresh review that demanded changes is not approval either.
   **The only exception:** a commit whose changed files are ALL documentation (`TODO.md`, `README.md`, `CLAUDE.md`) may skip this gate. A commit touching any other file does not qualify, no matter how small the code change or how large the docs change beside it. Note the skip in the commit message. The load-bearing word is *all* - without it the exception becomes "there were docs in this commit", which is how a code change rides in beside a checklist edit.

**The review must cover the exact tree you are about to commit** - the index, not the working tree. Hashing the working tree was itself a bug: a staged change hidden behind a reverted worktree produced a digest identical to the reviewed state while `git commit` recorded something else. Any edit after a review invalidates it, including your own few-line edits under the seats exception. This has already gone wrong once: a review returned findings, the fixes were hand-edited and committed without re-running the reviewer, and code no reviewer had seen went into `0829f8a`. Nothing caught it. `npm run review:status` exists because discipline alone did not hold - it compares a digest of what the reviewer was actually shown against the current tree.

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
