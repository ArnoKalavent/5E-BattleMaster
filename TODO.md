# 5E BattleMaster Fork — Project TODO

Working roadmap for modernizing the 5E-BattleMaster Roll20 Mod script.
Target: current Roll20 Mod (API) + **D&D 5E by Roll20 (2014) sheet**.
Shaped sheet support is dropped; D&D 2024/Beacon is a separate future track.

Status key: `[ ]` open · `[x]` done · `[~]` in progress

---

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
- [ ] Planned features from original README: range enforcement, movement limits
      from bar1, ranged-origin AOEs (Fireball), Cube/Cylinder shapes,
      class-specific actions

---

*Cross-references: `README.md` (Phase 0 deliverable), audit findings in chat
2026-07-23.*
