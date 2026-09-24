# 5E BattleMaster Fork — Project TODO

Working roadmap for modernizing the 5E-BattleMaster Roll20 Mod script.
Target: current Roll20 Mod (API) + **D&D 5E by Roll20 (2014) sheet**.
Shaped sheet support is dropped; D&D 2024/Beacon is a separate future track.

Status key: `[ ]` open · `[x]` done · `[~]` in progress

---

## Scope decision, 2026-09-24 — AOE and Movement cut from V1

Matt's call, and it is settled: **AOE spells and Movement come out of the
script entirely.** They are not deferred-in-place behind a flag; the code is
deleted. They return as new features once baseline functionality is proven.

The reason is not only that they are broken. It is that a turn menu offering
four buttons, of which two do nothing and one is inert, makes the script
impossible to reason about at the table - including for the person who wrote
the fixes. A smaller surface that is entirely true is worth more than a large
one that has to be remembered.

After removal the turn menu is exactly two actions: **Weapon Attack** and
**Direct Spell**. Both work today, modulo the open items in Phase 1.

### What gets deleted

- `AOESpellAttack`, `AOESpellRollCallback`, `spellEffects`
- `coneDirectionPromptCallback`, `lineDirectionPromptCallback`
- `findAllTokensInCone` / `InSphere` / `InLine` / `InCube` / `InCylinder`,
  and `distanceBetween`
- `location`, `createLocFromToken`
- `Move`, `BuildMovementWalls`, `iXStart`, `iYStart`, `iMoveSpeed*`, and the
  `bar1_value` write in `ResetTokenTurnValues`
- the eight direction arms, `responseCallbackFunction` and
  `bIsWaitingOnResponse` - the whole direction-prompt mechanism exists only to
  aim cones and lines
- `dmgTypeToFXName` and `spawnFxBetweenPoints` (all call sites are AOE; the
  weapon-attack FX at the `glow-blood` site is hard-coded and stays)
- the `'AOE Spell'` and `'Move'` entries in `generateTurnOptions` and their
  parallel commands

Roughly 450 of 1509 lines, about 30% of the file.

### What explicitly stays

- `distanceToPixels` - the reticle uses it, not just geometry
- the **saving-throw queue** (`SavingThrowAgainstDamageRollCallback`,
  `listTokensWaitingOnSavingThrowsFrom`) - `DirectSpellRollCallback` enqueues
  saves for single-target save spells, so this is not AOE-only
- `spawnFx` - the weapon-attack blood effect
- the reticle prompt at the "Move the target to where you would like to
  attack" site, which is targeting, not the Move action

### Knowledge to carry forward — do not lose this with the code

When AOE is rebuilt, these audit findings are the starting point. They are
recorded here because the evidence disappears with the deleted code:

- **Cone and line AOEs never adjudicate a save.** `spellEffects` queues saving
  throw expectations without setting `bIsWaitingOnRoll`, which is recomputed
  only inside the interception branch, so every defender's save hits the
  early-return guard. Sphere escapes only because it resolves inside the
  callback. Any rebuild must set the waiting flag at the queue site.
- **Cone `downleft` has zero area** - `bLine2XNeg` should be false. Measured 14
  lattice points against 830 for `upright`.
- **Line `upleft` and `downleft` use each other's axis** - measured, they
  return each other's tokens.
- **Sphere AOEs include the caster**, who is then asked to save against their
  own spell.
- **Cube is an empty body; cylinder is a verbatim copy of sphere** that ignores
  its `height` parameter.
- **Range parsing only accepts self-origin shapes.** `self cone 15ft` and any
  leading whitespace yield `NaN` silently. Ranged-origin AOEs (Fireball) were
  never supported at all.
- **The eight-way geometry switches carry 72 hand-chosen signs and literals**
  with no structural cross-check. Both geometry bugs live there. A rebuild
  should derive the half-plane tests from the direction vector rather than
  hand-writing each arm - that is the actual fix, not correcting two signs.
- Movement was never implemented in any form: `Move` calls an empty
  `BuildMovementWalls` and returns. There is nothing to preserve.

### Exit criterion

`npm test` green, the turn menu shows exactly two buttons, `!combat aoespell`
/ `!combat move` / the direction commands all answer with the unknown-command
whisper rather than failing silently, and the whole file parses - see the
new whole-file compile test, which the suite did not previously have.

---

## Code audit, 2026-09-23 — six-subsystem parallel sweep

Six agents read the file in full, one subsystem each, against one rubric:
works / broken / never implemented, plus unguarded lookups, dead code,
replicated patterns and test coverage. Every claim was cited to a line, and the
load-bearing ones were re-verified independently, several by executing the
extracted functions. This section is the map; individual repairs get their own
TODO items.

### What actually works

Of the five actions the turn menu offers, **one works end to end**: the weapon
attack (with AC coerced from a string, see below). Sphere AOEs work but include
the caster. Everything else is broken, unreachable, or was never written.

### Table-killers — an uncaught exception disables the Mod sandbox for everyone

- **Direct spell damage.** `DirectSpellRollCallback` passes `target` (a
  `tokenWrapper`) where `applyDamage` needs a Graphic. The wrapper proxies
  `get` but has no `set`, so the first `targetToken.set('bar2_value', ...)`
  throws. Any successful direct spell attack that deals damage kills the table.
  `WeaponAttack` passes `target.token` correctly - two conventions for one call.
- **Nine unguarded callback invocations.** The eight direction arms and
  `selectedTarget` call `responseCallbackFunction()` /
  `selectedTokenCallbackFunction()` with no existence check and no `bInCombat`
  gate. `!combat up` typed cold, or a click on a stale chat button, throws.
  `!combat cancel` nulls the callback while the "Target selected" button remains
  in the log, so cancel makes this trivially reachable.
- **`currentTurnPlayer.id` / `currentTurnToken.token` dereferenced unguarded**
  in `promptTarget`, `WeaponAttack`, `DirectSpellAttack`, `AOESpellAttack`.
  Reachable before combat starts, after `!combat end`, and after any
  `TurnChange` early return.
- **`dmgTypeToFXName(undefined)`** reaches `universalizeString(undefined)` →
  `.toLowerCase()` on undefined. Fires on any AOE with no damage roll (Fog
  Cloud, or Auto Roll Damage off). Three call sites, none guarded.
- **`targetCharacter.id` in `applyDamage`** - undefined for an unlinked token,
  and `TurnChange` puts every tracker token into the encounter list regardless
  of linkage.
- **`distanceToPixels`** dereferences `getObj('page', ...)` unguarded, once per
  token per cast.
- **DeathMarkersPlus.** `DMPConfig` stores `args[2]` as a STRING, so `"false"`
  is truthy and BOTH buttons enable it. `Deathmarkers` does not exist, so the
  next damage application throws `ReferenceError`. It persists in `state`, so it
  re-arms on every sandbox restart, and there is no way to disable it from chat.

### Silently wrong — no crash, wrong outcome, no message

- **Cone and line AOEs are inert.** `spellEffects` queues saving-throw
  expectations without setting `bIsWaitingOnRoll`, which is recomputed only
  inside the interception branch. Every defender's save hits the early-return
  guard and is ignored. No save against a cone or line AOE has ever been
  adjudicated. Sphere escapes only because it resolves inside the callback.
- **Save-for-half applies zero damage.** The code does exact equality on
  `universalizeString(savedesc) === "halfdamage"`; the README says the field must
  *contain* "half damage". A real "Half damage on a successful save"
  universalises to "halfdamageonasuccessfulsave" and falls to `default: break;`.
- **Cone `downleft` has zero area.** One wrong sign flag (`bLine2XNeg` should be
  false). Measured: 14 lattice points versus 830 for `upright`. A Southwest cone
  hits nothing.
- **Line `upleft` and `downleft` use each other's axis.** Measured: `upleft`
  returns down-left tokens and `downleft` returns up-left tokens.
- **AC is an unvalidated string.** `""` coerces to 0 → the token ALWAYS gets
  hit; `undefined` → NEVER hit; `"15 (natural armor)"` → NaN → never hit. Also
  `npcd_ac` was removed from the sheet around 2017, so the primary lookup always
  misses and falls back to the PC-side `ac` field.
- **Empty damage type matches every immunity.** `"".indexOf("")` is 0, so a
  template with no `dmg1type` makes every creature immune and the hit vanishes.
- **Resistance rounds the wrong way.** `Math.round(dmgAmt/2)` rounds .5 up; 5e
  rounds down. Every odd resisted total is 1 too high.
- **Blank bars corrupt silently.** `"" >= 0` is true, so a token with no temp-HP
  bar takes the temp-HP path and gets 0 written into it. `"" - N` sends HP
  straight negative. Non-numeric bar text writes `NaN` to the bar, persistently.
- **Sphere AOEs include the caster**, who is whispered to save against their own
  spell.
- **Crits are parsed and discarded.** `crit1Index` is extracted and never read;
  `critRolls`/`critTypes` are initialised and never populated. The sheet setting
  the README requires is what fills the field the script throws away.
- **Advantage is parsed and discarded.** `r2` is pushed into `d20Rolls[1]`;
  every consumer reads `[0]` only.
- **AOE size is never validated.** `self cone 15ft` or a missing size yields
  `NaN`, so nothing is hit and nothing is said. Leading whitespace in the range
  also rejects an otherwise-correct string.
- **`SheetConfig` accepts anything** with no validation and no confirmation. Any
  value other than "OGL"/"Shaped" makes `rollData` parse nothing and
  `applyDamage` skip all resistance handling - silently, and persisted.
- **`tokenfromlist` does nothing.** Choosing from the disambiguation prompt
  assigns a raw Graphic (not a wrapper) and never re-invokes the action. The
  wrong type then makes every weapon attack a guaranteed miss.
- **Multi-candidate targeting fires the action anyway.** `findTokenAtTarget`
  prompts and deliberately leaves `target` stale; `selectedTarget` then runs the
  attack immediately against the previous target. This is the most likely
  mechanism behind the live "reticle on a PC, monster gets attacked" bug - the
  discriminator is whether a "Which token are you targeting?" prompt appeared.
- **Saving-throw rejections are whispered to the caster**, not the defender who
  must reroll, so the defender is held in an expectation they never learn about.
- **Dispatch is by player id alone**, always finding the OLDEST expectation, so
  a player owing two rolls has either one adjudicated as the other.

### Never implemented, but shipped as features

- **Move** - `case 'move':` is an empty `break;`, `Move` is never called,
  `BuildMovementWalls` is an empty body, `iXStart`/`iYStart`/`iMoveSpeed*` are
  written and never read. A live "Move" button appears in every turn prompt and
  does nothing, silently.
- **Cube and cylinder AOEs** - `findAllTokensInCube` is an empty body;
  `findAllTokensInCylinder` is a verbatim copy of the sphere that ignores its
  `height` parameter.
- **`ResetCharacterTurnValues`** - empty body, called every turn as though it
  reset per-character state.
- **Action economy** - `bHasTakenAction` / `bHasTakenBonusAction` /
  `bHasTakenReaction` are initialised and never read or written.
- **`bIsMook` / `bIsPlayer`** - bare expression statements, not assignments. The
  properties never exist.
- **`IsWithinRange`** - never called, and returns false unconditionally: three
  independent bugs in eight lines, including `if(rangeString = "")`.
- **Native status markers** - no `statusmarkers` reference anywhere. Nothing
  marks dead, unconscious or bloodied.

### Systemic patterns — the repair-versus-rewrite evidence

Each of these is one mistake replicated, so each is a design problem rather than
N bugs.

1. **Ambient mutable globals as the parameter-passing mechanism.** `target`,
   `currentTurnToken`, `currentTurnPlayer`, `currentlyCastingSpellRoll`,
   `direction`, `range`, `selectedTokenCallbackFunction`. Written in one chat
   message, read in another an arbitrary time later, with no correlation to who
   clicked or which prompt it answers. Root cause of the stale target, the
   wrong-recipient whispers, the cross-turn identity bleed and the
   prompt-ownership confusion.
2. **`target` has three incompatible consumer contracts** - wrapper, raw
   Graphic, and the saving-throw queue's expectations. No path satisfies all
   three, and `tokenWrapper`'s `get` proxy makes the two types look
   interchangeable right up to the first `.set`.
3. **Five hand-rolled tracker fetch-and-parse sites**, each re-deciding the
   falsy check and whether to try/catch. `TurnChange` alone reads it four times
   and parses three.
4. **Phase teardown written three times with three different field sets**
   (`StageInitiative`, `EndCombat`, `CancelPendingRolls`), which is exactly why
   the orphaned reticle and the stale roll queues each appear in only one.
5. **Seventy-two hand-chosen signs and literals** across the two eight-way
   geometry switches, with no structural cross-check. Both geometry bugs live
   there.
6. **Whisper strings built by concatenation at ~14 sites**, three different
   quoting conventions, only one that escapes.
7. **Parallel arrays kept in sync by hand** at five push sites with two
   different orderings, plus `generateTurnOptions`/`generateTurnOptionCommands`.
8. **`state.sCharacterSheetType` re-interpreted at four independent sites** with
   four different failure modes, because `rollData` exports a sheet-dependent
   shape instead of normalising at the boundary.

### Test-suite integrity — read this before repairing anything

The suite is large and green, and it is measuring stubs where the real logic
lives.

**Stubbed out, so their defects are structurally invisible:** `applyDamage`
(every crash, all resistance logic, all bar arithmetic), `TurnChange` (replaced
by a counter double), `tokenWrapper`, `promptButtonArray`, `makeButton`,
`dmgTypeToFXName`, `spellEffects`, `distanceToPixels`, `getAttrByName` (stubbed
to `return 12`, so it cannot express `""` or `undefined`), and `rollData` itself
in the callback tests.

**Tests that assert the buggy behaviour as correct** - these will FAIL when the
bugs are fixed, by design:
- `safeRolls.test.js` asserts the save rejection whispers "Caster" - the
  mis-addressed message that strands the defender.
- `safeRolls.test.js` asserts `applyDamage` receives the wrapper that would
  crash it, with `applyDamage` stubbed.
- `aoeSpell.test.js` asserts the real sheet's `Self (15-foot cone)` is REJECTED.
- `targeting.test.js` asserts the stale-`target` state during multi-candidate
  disambiguation.
- `lineAoe.test.js` pins the hard-coded 35px offset and the 20px tolerance as
  intended.
- `rollParser.test.js` asserts an invalid sheet type is preserved, locking in
  `SheetConfig`'s lack of validation, and pins `critRolls === []` under the name
  "existing critical array behavior".

The pattern: the parser has a genuinely adversarial test suite; every consumer
of the parser is tested against a stub that can only emit well-formed values.
All three sandbox-killing crashes live in exactly that gap.

### Recommendation

Repair the boundaries, rewrite the action layer.

**Keep:** the parser and its extractors (well designed, well tested), the
`safeRollTotal` / `reportMissingRoll` guards, the build-rev stamping, the
review-freshness tooling, `findCurrentTurnToken`, `ConfigureReticle`.

**Rewrite rather than patch:** the action layer - targeting, the roll
expectation queue, and the attack/spell callbacks. Its defects are not
independent; they all descend from passing state through module globals and from
`target` having no single type. Patching them one at a time is what the last
several days have been, and each fix has been correct without reducing the rate
of new findings.

**Fix immediately regardless of that decision**, because they are cheap and they
take the table down:
1. the nine unguarded callback invocations, plus a `bInCombat` gate on the
   action arms
2. the `applyDamage` wrapper-versus-Graphic argument at the direct-spell site
3. the DeathMarkersPlus removal - the `"false"` string bug makes it a live time
   bomb
4. `dmgTypeToFXName` / `universalizeString` undefined guards

**Do not trust a green suite on this file** until the stubs above are replaced
with real objects.

## Phase 0 — Documentation ✅ COMPLETE

- [x] Audit code for undocumented setup assumptions
- [x] Draft README "Setup & Requirements" section (`README-setup-section.md`)
- [x] Merge setup section into fork's README.md (delivered as complete
      `README.md` — supersedes `README-setup-section.md`)
- [x] Update README: supported sheet = 2014 only; Shaped marked unsupported /
      slated for removal; 2024/Beacon marked not supported
- [x] Document Experimental-vs-Default API server status (V1 runs on Default;
      Experimental only needed for future Beacon track)
- [x] Fold verified findings into README (npc_ac known issue, NPC-controller
      crash workaround, custom tracker entries warning, line-AOE known issue)

## Phase 1 — Critical crash fixes (script unusable in real games without these)

- [x] **Fix initiative-roll prompt spam** (found in live smoke test):
      `!combat start` treated every tracker change as a turn change, so
      initiative rolls landing in an empty tracker whispered spurious turn
      prompts and armed roll interception. Replaced with a three-phase flow:
      `!combat roll initiative` (staging - tracker changes ignored) ->
      `!combat begin round 1` (goes live, refuses if tracker has no tokens,
      echoes the label) -> `!combat end` (full teardown incl. pending roll
      queues). `start`/`stop` kept as legacy aliases. Turn listener gained a
      growth guard (adds are never advances) and a top-unchanged guard (no
      duplicate prompts on re-sorts). Tested (25 cases,
      `tests/combatFlow.test.js`, incl. full bug-scenario simulation).

> **Exit criterion:** all four fixes landed + the live smoke test plan below
> passing in an actual Roll20 game. Gate 2 is the original criterion (PC turn,
> NPC turn, custom tracker entry present, weapon attack, cone AOE, line AOE);
> gates 3 and 4 were added once the roll-handling and parser fixes landed, and
> gate 0 gates all of them.
> README fully synced with landed fixes as of 2026-07-24 (commands, reticle
> setup, controller behavior, tracker guards, Known Issues, changelog) —
> only the live smoke test remains to close Phase 1.
>
> README follow-up (batched to phase close, 2026-09-19): README:217 documents
> `!combat reticleconfig`. That still works as a legacy alias, so the README is
> not wrong, but `!combat set reticle` should be documented as the primary form.
>
> **Live smoke test plan (revised 2026-09-22).** Run the gates in order; gate 0
> gates everything after it. Expectations below come from the source, not memory.
>
> **Gate 0 — build identity and environment.**
> Run `npm run build` and paste `dist/5ebattlemaster.js`, NOT the source file.
> The console must print `-=> BattleMaster v0.3.0-dev (<rev>) <=-` with the rev
> you just built. `dev (unstamped)` means the source was pasted; a different
> hash means a stale build. A stale paste already cost one debugging session.
> Use a clean game: ONE character sheet, and BattleMaster as the only Mod. The
> 2026-09-21 run also had GroupInitiative, GroupCheck and kScaffold loaded, and
> GroupInitiative writes to the turn order this script watches.
>
> **Gate 1 — reticle setup.** As GM:
> 1. Select a token whose image is from your own Roll20 library, run
>    `!combat set reticle` — expect the "saved" whisper.
> 2. Run `!combat set reticle <library-thumb-url>` with nothing selected —
>    expect the URL to be saved. This is the `args[3]` path; if the reticle
>    stops working here, the argument shift is wrong.
> 3. Run `!combat reticleconfig <library-thumb-url>` — the legacy alias must
>    still save. This is the `args[2]` path.
> 4. Run `!combat set` with no second word — expect the usage whisper, no crash.
> 5. As a NON-GM player, run `!combat set reticle <url>` — expect a refusal
>    whisper and no change to the configured image.
>
> **Gate 2 — Phase 1 exit criterion.** PC turn, NPC turn, custom tracker entry
> present (nobody is prompted - silence is correct, it waits for the GM to
> advance), weapon attack, cone AOE, line AOE.
>
> **Gate 3 — roll handling (0829f8a).** This exercises the crash that took the
> sandbox down on 2026-09-21.
> 1. With the sheet's **Auto Roll Damage & Crit ON**: attack, hit, damage
>    applies. The happy path.
> 2. Turn that setting **OFF** and attack again. Before the fix this killed the
>    sandbox for the whole table. Expect `Hit! Target: <name>` followed by a
>    whisper naming the setting, and the sandbox still ALIVE - confirm by
>    running any `!combat` command afterwards.
> 3. Turn it back **ON** and re-roll the same attack. It must resolve normally.
>    This is the retain-the-expectation contract: a rejected roll leaves the
>    script still listening, so "retry the attack" is real advice rather than a
>    lie.
> 4. While the script is waiting on one player's attack roll, have a DIFFERENT
>    player roll anything in chat. The pending attack must still resolve. This
>    is the `splice(-1, 1)` fix - that bug silently destroyed the expectation
>    and left the turn dead with no message.
>
> **Gate 4 — resistances (2276a51).** These never applied on the 2014 sheet
> before, because the wrong default sheet type made `applyDamage` read
> `damage_*` attributes instead of `npc_*`. Attack a creature with
> `npc_resistances` set to the damage type: damage halved (`Math.round(dmgAmt/2)`)
> and the log reads `<name> has resistance to <type> damage!`. `npc_immunities`
> → no damage at all. `npc_vulnerabilities` → doubled (`Math.round(2*dmgAmt)`).
> Numbers on resistant creatures WILL differ from previous sessions; that is the
> fix working.
>
> **Gate 5 — confirm the two open targeting bugs.** Not fixes - probes, so a
> result either way is informative.
> 1. Try to target a token that is NOT in the turn tracker. Expect silent
>    failure. That confirms both open findings at once: targeting is scoped to
>    the turn order, and `findTokenAtTarget`'s empty `else` reports nothing.
> 2. The unresolved interception symptom: GM proxying an offline player's
>    character. The crash fix is a plausible but unproven explanation. If it
>    recurs on a verified build in a clean game, it is a different bug - capture
>    the `This character is controlled by player <name>` log line.
>
> **Gate 6 — fresh install default (needs a SECOND, brand-new game).** Paste,
> do NOT run `!combat config`, and attack. It must parse correctly immediately.
> The main test campaign has `"OGL"` persisted from the manual fix, so it cannot
> test the default - only a new game can.

- [x] **Fix `findWhoIsControlling` GM fallback** — rewritten with
      online-aware preference order: online non-GM controller > online GM
      controller (co-listed GM covers absent players) > offline non-GM
      controller (archive whisper) > any listed controller > online GM > any
      GM. Filters ""/"all"/stale IDs from `controlledby`; always returns a
      valid player *ID* (string); guarded against undefined character.
      Unit-tested (13 cases) + syntax-checked.
- [x] **Fix turn-order handling** (all three consumer sites, not just one):
      `findCurrentTurnToken` treats custom entries (string `"-1"`, legacy
      numeric `-1`), empty trackers, and deleted tokens as "no token turn";
      `TurnChange` gained a guard chain (no-token turn -> silent skip;
      unlinked token -> GM whisper + skip; unresolvable player -> log + skip)
      and filters custom/deleted entries from the encounter list;
      `findTokenAtTarget` filters the same from targeting. `tokenWrapper` AC
      lookup guarded for unlinked tokens. Custom entry on TOP = nobody's turn
      (waits for GM to advance) by design. Unit-tested (10 cases,
      `tests/turnOrder.test.js`) + syntax-checked.
- [x] **Fix `findAllTokensInLine` call site** — now passes
      `(new location(x,y,0), direction, range)`, mirroring the cone call;
      added missing z to the FX endLoc. Tested: call-site contract (4 cases)
      + line geometry for all cardinals, a diagonal, off-axis tolerance, and
      range cutoff (8 cases) in `tests/lineAoe.test.js`.
- [x] **Fix `bar1_val` typo** in `ResetTokenTurnValues` (`bar1_value`);
      also switched a stray global reference to the function's own parameter.
      Tested (3 cases, same file).

### Live smoke-test findings, 2026-09-21

Found running the script in a real game. The three crash-class items are FIXED
(commits 0829f8a and the parser replacement); two targeting items and the
original interception symptom remain open. Line numbers below are from when
each was found and have since shifted.

- [x] **Default sheet type is `"Shaped"`** (line 40). FIXED - now defaults to
      `"OGL"`. A fork that supports only
      the 2014 ("OGL") sheet defaults to the sheet being removed in Phase 4, so
      a fresh install parses every roll with the wrong branch. Confirmed live:
      the first weapon attack threw
      `TypeError: Cannot read properties of undefined (reading 'results')` and
      took the whole sandbox down. Fix: default to OGL. Near one line, but it
      needs a migration thought for campaigns already holding `"Shaped"` in
      persistent `state`.
- [x] **`parseInt` failure defeats every `!= -1` guard** (lines 99-103). FIXED -
      the parser now uses regex extractors and an "absent means undefined"
      convention; the `-1` sentinel is gone.
      **CONFIRMED live 2026-09-21 with a stack trace**, on a build verified as
      `baa6ca1`: the attack roll parsed and hit correctly, then
      `WeaponAttackRollCallback` threw
      `TypeError: Cannot read properties of undefined (reading 'results')` at
      `applyDamage(rollData.dmgRolls[0].results.total, ...)` - i.e. `d20Rolls`
      was fine and `dmgRolls[0]` was `undefined`. Cause: the message carried no
      `{{dmg1=$[[` field (the 2014 sheet only folds damage into the attack
      template when Auto Roll Damage & Crit is enabled), so
      `indexOf` returned -1, `-1 + 10` sliced from character 9, `parseInt` of
      that garbage returned `NaN`, `NaN != -1` passed the guard, and
      `inlineData[NaN]` - `undefined` - was pushed. Enabling the sheet setting
      is a workaround, not a fix. Original description follows. When a
      template field is absent, `parseInt` returns `NaN`, and `NaN != -1` is
      true, so `inlineData[NaN]` — `undefined` — is pushed into `d20Rolls` /
      `dmgRolls`. Callbacks then dereference `[0].results` and crash. This is
      the mechanism behind the finding above, and it fires independently
      whenever a roll template is missing an expected field (e.g. the sheet's
      Auto Roll Damage & Crit setting is off, so there is no `dmg1`). Fix:
      validate the parsed index is a real number AND resolves in `inlineData`
      before pushing; guard the callback dereferences too.
- [x] **`splice(-1, 1)` corrupts the pending-roll list** (lines 432-433). FIXED
      in 0829f8a; pinned by a test that fails if the fix is reverted. When a
      roll arrives from a player who is not the expected roller,
      `playerIDLocation` is `-1`, the callback is correctly skipped — but the
      splices still run, and `splice(-1, 1)` removes the LAST element rather
      than nothing. So one stray inline roll silently discards the expectation
      the script was legitimately waiting on, and the turn is dead with no
      message. Fix: only splice when the index is >= 0. Related to, but
      distinct from, the Phase 5 roll-interception guard item.
- [ ] **`findTokenAtTarget` fails silently** (lines 407-409). The `else` branch
      taken when the reticle token cannot be resolved is completely empty — no
      whisper, no log — so a failed target resolution is indistinguishable from
      nothing happening. Fix: log and whisper the player.
- [ ] **Targeting is scoped to the turn order** (line 371). `findTokenAtTarget`
      only considers tokens present in `Campaign().get('turnorder')`, so
      anything not in the tracker cannot be targeted and the failure is silent
      (see above). Decide whether this is intended (encounter participants
      only) and document it, or widen it to tokens on the page.
- [ ] **UNRESOLVED: roll interception does not fire for a GM proxying an
      offline player.** Live symptom: `We have recieved a roll result!` logs,
      but nothing happens. `findWhoIsControlling` was ruled out by direct
      inspection — with the player offline and the GM co-listed and online,
      step 2 of the picker (`isOnline`, any) returns the GM, which is correct.
      A `!whocontrols` diagnostic confirmed both IDs resolve, the player is
      `online=false isGM=false`, and the GM is `online=true isGM=true`. So the
      fault is downstream of the picker. Prime suspect is the `splice(-1, 1)`
      bug above, triggered by an unrelated inline roll (the test game also ran
      GroupInitiative and GroupCheck). Next step: re-test in a clean game with
      only BattleMaster loaded and capture the
      `This character is controlled by player <name>` log line.

- [ ] **Sequential attack flow: roll to hit, adjudicate, THEN roll damage**
      (design decided 2026-09-21). The script currently assumes the attack and
      damage arrive in ONE message, which the 2014 sheet only does when its
      "Auto Roll Damage & Crit" setting is enabled. Intended behaviour is to
      emulate the table instead: the player rolls to hit, the script reports
      hit or miss, and only on a hit does it ask for the damage roll and
      intercept that as a second roll.
      Implications:
      - Auto Roll Damage & Crit should ideally be OFF, the opposite of the
        current workaround. Revisit the README's setup requirements.
      - Needs a second pending-roll expectation per attack. Land the
        `splice(-1, 1)` fix and the safe-roll guards FIRST - this doubles the
        traffic through exactly the code that currently corrupts on a stray
        roll.
      - Applies to weapon attacks and direct spells; AOE/save-based spells
        already resolve differently.
      - Decide what happens if the damage roll never arrives (turn timeout,
        GM override, or leave the expectation pending).

- [x] **Damage resistances never applied on the 2014 sheet.** Found while
      scoping the default-sheet fix. `state.sCharacterSheetType` drives TWO
      switches: the parser, and `applyDamage`'s choice of which attributes to
      read for immunities / resistances / vulnerabilities (`npc_*` for OGL vs
      `damage_*` for Shaped). With the wrong `"Shaped"` default, a 2014-sheet
      game read attributes that do not exist, so resistances silently never
      applied - no crash, just wrong numbers. FIXED as a side effect of
      correcting the default. NOTE for testing: damage on resistant or immune
      creatures will now differ from before, and that is the fix working.

> Test-environment note: the game used for the 2026-09-21 session also ran
> GroupInitiative v0.9.42, GroupCheck v1.15, kScaffold and the Kingmaker module,
> and Roll20 warned that multiple character sheets were in use. GroupInitiative
> writes to the turn order, which is exactly what BattleMaster's turn listener
> watches. Re-confirm any finding from that session in a single-sheet game with
> only BattleMaster loaded before writing a fix against it.

## Phase 1.5 — Repo restructure & test infrastructure

- [x] Flatten repo: single `5ebattlemaster.js` at root; `0.1/`/`0.2/`
      folders deleted (git history preserves them)
- [ ] Use git **tags** for releases (v0.3.0 when Phase 1 lands); release
      branches only if old lines ever need maintenance
- [x] Check-in test infrastructure: `package.json` (underscore devDependency,
      `npm test`) + `tests/findWhoIsControlling.test.js` (13 cases, extracts
      the function from shipping source via stubs)
- [x] Harness pattern extended to all Phase 1 fixes: `npm test` chains
      `findWhoIsControlling` (13) + `turnOrder` (10) + `lineAoe` (15) = 38
      cases, all green
- [x] **Build-rev stamping** (2026-09-21): `5ebattlemaster.js` carries a
      `buildRev` literal (left as `'dev (unstamped)'` in source) exposed on the
      module and logged as a `-=> BattleMaster <rev> <=-` banner in the
      `on('ready')` handler, before `RegisterEventHandlers()` so it still prints
      if registration throws. `npm run build` (`tools/build.js`) writes a stamped
      copy to `dist/5ebattlemaster.js` (gitignored) using
      `git describe --always --dirty --abbrev=7` plus the package version.
      **Paste from `dist/`, not from the source file.** Added because a stale
      paste cost a debugging session - stack-trace line numbers did not match
      the repo and nobody noticed. Tested (`tests/build.test.js`), including
      that the built file is byte-identical to source apart from the stamped
      line and that the build never modifies the source.

## Phase 2 — State, config & DeathMarkersPlus removal (V1 scope)

- [ ] **Namespace all state** under `state.BattleMaster = {...}` per current API
      best practice (root-level keys risk cross-script collisions).
- [ ] **Fix config truthiness bug** — DMP toggle stored string `"false"` (truthy).
      Becomes moot once DMP is removed, but apply the lesson: store booleans as
      booleans in all config handling.
- [ ] **Remove DeathMarkersPlus entirely** (script no longer exists):
      - [ ] Delete `Deathmarkers.UpdateDeathMarkers()` calls, the
            `bDeathMarkersPlusInstalled` state key, and the `DMPConfig` config path
      - [ ] Replace with native Roll20 status markers via
            `token.set('status_<marker>', ...)`:
            - Dead (HP ≤ 0): `dead` marker (the classic red X)
            - Bloodied (HP ≤ half max): pick default marker — candidates:
              `half-heart`, `broken-heart`, `skull` (decide before implementing)
      - [ ] Clear/downgrade markers when healing crosses thresholds (bloodied ↔
            healthy, dead → alive)
- [ ] Make marker updates a single helper called from `applyDamage` so V2 can
      swap implementations cleanly.

## Phase 3 — API signature & asset fixes

- [x] **`sendPing`** — fixed at its only call site (in `promptTarget`):
      now `(x, y, playerpageid, null, true)` per current signature. Covered
      by a reticle test asserting the argument layout.
- [x] **`spawnFx` / `spawnFxBetweenPoints`** — script passed a page *object* as
      the 4th arg; docs want a page ID string, and it's optional with the right
      default. DONE (c714987): the 4th argument is dropped at all four call
      sites, which is behaviour-preserving because the documented default is
      exactly the `playerpageid` each site was already computing - and it
      removes an unguarded `getObj` from the FX path. A stale commented-out
      two-argument call was deleted. The line call site is pinned by an
      `arguments.length === 3` assertion in `tests/lineAoe.test.js`; the other
      three change identically but nothing in the repo reaches them. Written
      before the roll-handling work, then rebased onto current master and
      re-reviewed, because `0829f8a` had since rewritten two of the callbacks
      containing these call sites.
- [x] **Reticle image** (pulled forward - blocked live testing; the original
      author's library URL is now access-denied, `createObj` returned
      undefined, and `.id` on it crashed the whole sandbox):
      - `!combat set reticle` captures the image from the GM's selected
        token (or a URL arg), normalizes med/original/max -> thumb preserving
        the query string, stores in `state.BattleMaster.reticleImgSrc`.
        `!combat reticleconfig` kept as a legacy alias (2026-09-19 rename;
        note the URL is `args[3]` on the new form, `args[2]` on the alias)
      - GM-gated (2026-09-19): `ConfigureReticle` refuses any caller for whom
        `playerIsGM(msg.playerid)` is not true, whispering and returning before
        `state` is touched. Deliberately NOT a `msg.who` "(GM)" substring check -
        a player can rename themselves to include it, and a GM speaking as a
        character has no suffix at all
      - `promptTarget` hard-guarded: unconfigured -> instructive GM whisper;
        createObj rejection -> GM whisper explaining own-library requirement;
        never dereferences a failed createObj; returns success boolean
      - attack cases + retry paths only arm their callbacks when the reticle
        actually spawned
      - `state.BattleMaster` namespace initialized on ready (Phase 2 partial)
      - Tested (25 cases, `tests/reticle.test.js`, incl. the exact crash,
        the non-GM refusal and the missing-display-name fallback)

## Phase 4 — Sheet verification & parser cleanup (2014 sheet)

- [x] **Verify 2014 sheet attributes & templates** (official sheet is
      closed-source; verified via official Roll20 docs + community wiki refs,
      2026-07-23):
      - [x] NPC armor class = **`npc_ac`**. `npcd_*` attributes were removed in
            sheet v2.0 (~2017) — the script's `npcd_ac` check has been dead for
            years. → Fix: try `npc_ac`, fall back to `ac` (PCs); drop `npcd_ac`.
      - [x] Roll templates still current per official docs
            (help.roll20.net "D&D 5e OGL Roll Templates"): `atkdmg`/`atk`/`dmg`/
            `simple` for PCs, `npcatk`/`npcaction` for NPCs, with fields `r1`,
            `r2`, `dmg1`, `dmg1type`, `crit1`, `crit2`, `savedc`, `saveattr`,
            `savedesc`, `range`, `charname` intact. Parser field names are valid
            for the 2014 sheet. Combined attack+damage messages still require
            the sheet's Auto Roll Damage & Crit setting.
      - [~] Resistances: `npc_immunities`/`npc_resistances`/`npc_vulnerabilities`
            confirmed as NPC attributes. **Open question:** the 2014 sheet has
            no structured PC-side damage-resistance attribute — decide how (or
            whether) to support PC resistances (custom attribute? config? skip
            and document?).
- [ ] **Remove Shaped sheet mode** — delete Shaped branches from `rollData`,
      `applyDamage`, save-DC handling, and the SheetConfig options.
- [ ] Fix latent `IsWithinRange` bug (`=` vs `===` on empty-string check) before
      wiring up range enforcement (planned feature).
- [ ] Replace fragile `indexOf`/`substring` template parsing with a small
      regex-based field extractor (single place to maintain field names).

## Phase 5 — Modernization & hardening (post-V1 polish)

- [ ] Replace `var`-chain IIFE style incrementally (`const`/`let`, strict mode
      throughout) — low priority, do opportunistically with each touched function
- [ ] Guard roll interception: tag/validate expected roll templates so unrelated
      inline rolls from a prompted player aren't swallowed
- [ ] Advantage/disadvantage: use `r1`/`r2` correctly instead of first-roll-only
- [ ] `sendChat` prompts with `{noarchive: true}` to stop clogging chat history
- [ ] **Damage-only riders (Divine Smite and similar).** Found live 2026-09-23.
      Divine Smite is not a spell attack: it has no to-hit roll and no saving
      throw, it is extra radiant damage on a melee hit already made. Its roll
      message carries `dmg1` and no `r1`. The Direct Spell path requires a
      to-hit roll, so it correctly rejects the roll - but the script has no
      concept of "extra damage applied to an existing hit" at all. Supporting it
      means a new action type, not a tweak. Deferred deliberately to avoid scope
      creep. NOTE: before the guards in 0829f8a this case read
      `rollData.d20Rolls[0].results.total` on an empty array and would have
      taken the sandbox down - a second table-killer nobody had anticipated.
- [ ] **Script-wide assumption: combat happens on the player ribbon page.**
      Raised by review of the `spawnFx` fix (2026-09-19). Every page-dependent
      call resolves the page as `Campaign().get('playerpageid')` — the reticle's
      `_pageid` (line 232), `sendPing` (line 247), the geometry page lookup
      (line 878) — and the FX calls now rely on the same value via the documented
      default. So if the GM runs an encounter on one map while the player ribbon
      sits on another, the reticle, the ping and the FX all land on the ribbon
      page together. Consistent, but wrong for split-party or GM-side testing.
      Fixing it means deriving the page from the acting token's `_pageid` in ALL
      of those places at once; changing FX alone would make effects diverge from
      the reticle they are meant to accompany.

## V2 — Future track

- [ ] **Custom status-marker extension path** — config API letting users map
      dead/bloodied states to their own token markers (use `token_markers` JSON
      to validate custom marker tags; fall back to defaults)
- [ ] D&D 2024 / Beacon support: `getSheetItem`/`setSheetItem` (async),
      HTML roll parsing (`data-result` attributes), Experimental API server
      requirement documented
- [ ] **AOE spells, rebuilt** — removed from V1 on 2026-09-24; see the scope
      decision at the top of this file for the findings to start from. Scope
      the rebuild to derive geometry from a direction vector rather than eight
      hand-written switch arms, and to support ranged-origin shapes (Fireball)
      and Cube/Cylinder, which never worked
- [ ] **Movement, built for the first time** — removed from V1 on 2026-09-24.
      It was never implemented upstream, so this is new work, not a repair:
      movement limits from bar1, range enforcement, movement walls
- [ ] Planned features from original README: class-specific actions

---

*Cross-references: `README.md` (Phase 0 deliverable), audit findings in chat
2026-07-23.*
