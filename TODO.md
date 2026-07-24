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
> attack, cone AOE, line AOE). README Known Issues updated to match reality
> as part of Phase 1 close-out.

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
      - `!combat reticleconfig` captures the image from the GM's selected
        token (or a URL arg), normalizes med/original/max -> thumb preserving
        the query string, stores in `state.BattleMaster.reticleImgSrc`
      - `promptTarget` hard-guarded: unconfigured -> instructive GM whisper;
        createObj rejection -> GM whisper explaining own-library requirement;
        never dereferences a failed createObj; returns success boolean
      - attack cases + retry paths only arm their callbacks when the reticle
        actually spawned
      - `state.BattleMaster` namespace initialized on ready (Phase 2 partial)
      - Tested (20 cases, `tests/reticle.test.js`, incl. the exact crash)

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
