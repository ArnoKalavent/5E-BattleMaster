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

> **Exit criterion:** all four fixes landed + live smoke test in an actual
> Roll20 game (PC turn, NPC turn, custom tracker entry present, weapon
> attack, cone AOE, line AOE).
> README fully synced with landed fixes as of 2026-07-24 (commands, reticle
> setup, controller behavior, tracker guards, Known Issues, changelog) —
> only the live smoke test remains to close Phase 1.
>
> README follow-up (batched to phase close, 2026-09-19): README:217 documents
> `!combat reticleconfig`. That still works as a legacy alias, so the README is
> not wrong, but `!combat set reticle` should be documented as the primary form.
>
> **Live smoke test — reticle setup (2026-09-19 changes).** As GM:
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

### Live smoke-test findings, 2026-09-21 (all open)

Found running the script in a real game. Line numbers are against the working
tree as of the build-rev change. The first three are crash- or
unusable-class and should land before Phase 1 closes.

- [ ] **Default sheet type is `"Shaped"`** (line 40). A fork that supports only
      the 2014 ("OGL") sheet defaults to the sheet being removed in Phase 4, so
      a fresh install parses every roll with the wrong branch. Confirmed live:
      the first weapon attack threw
      `TypeError: Cannot read properties of undefined (reading 'results')` and
      took the whole sandbox down. Fix: default to OGL. Near one line, but it
      needs a migration thought for campaigns already holding `"Shaped"` in
      persistent `state`.
- [ ] **`parseInt` failure defeats every `!= -1` guard** (lines 99-103).
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
- [ ] **`splice(-1, 1)` corrupts the pending-roll list** (lines 432-433). When a
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
- [ ] **`spawnFx` / `spawnFxBetweenPoints`** — script passes a page *object* as
      the 4th arg; docs want a page ID string, and it's optional with the right
      default. Drop the 4th argument everywhere.
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
