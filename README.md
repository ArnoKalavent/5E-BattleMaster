# 5E BattleMaster

A Roll20 Mod (API) script that automates D&D 5th Edition combat: turn-by-turn
action prompts, automated attack resolution, damage application with
resistances, and geometric AOE targeting.

> **Fork status:** This is a maintained fork of
> [posadist-revolution/5E-BattleMaster](https://github.com/posadist-revolution/5E-BattleMaster)
> (original author: Sarah Hunicke-Smith), currently being modernized for
> today's Roll20 Mod (API) and the **D&D 5E by Roll20 (2014)** character sheet.
> See `TODO.md` for the roadmap and Known Issues below for the current state.

## Supported Configuration

| | Status |
|---|---|
| **D&D 5E by Roll20 (2014)** sheet (formerly "5th Edition OGL") | ✅ Supported target |
| 5e Shaped sheet | ⚠️ Legacy code paths exist but are **unsupported and slated for removal** (the sheet is abandoned and unavailable for new games) |
| **D&D 2024 by Roll20** (Beacon) sheet | ❌ Not supported. Beacon sheets use a different attribute system (async `getSheetItem`) and different roll output; support is a possible future track |
| DeathMarkersPlus integration | ❌ Being removed — the script no longer exists. Dead/bloodied indicators will use Roll20's built-in status markers |

**API server:** This script runs on the **Default** Mod (API) sandbox. The
*Experimental* server is only needed for Beacon-sheet functions, which this
script does not use. If 2024-sheet support is added later, that mode will
require the Experimental server and will be documented separately.

## Current Functionality

1. Turn-based action prompts driven by the Turn Tracker: on each combatant's
   turn, the controlling player is whispered buttons for **Weapon Attack**,
   **Direct Spell**, **AOE Spell**, and **Move**.
2. Attack rolls, saving throws, and damage application for:
   - Direct weapon attacks
   - Direct spell attacks (attack-roll and saving-throw spells)
   - Self-origin AOE spells (cones, lines, spheres)
3. Damage application honors NPC immunities/resistances/vulnerabilities,
   consumes temporary HP first, and updates token bars automatically.

---

# Setup & Requirements

BattleMaster makes a number of assumptions about how your game is configured.
If any of these aren't met, the script will fail silently or crash mid-combat,
so read this section before your first combat.

## Prerequisites

- A **Roll20 Pro** subscription (required for any Mod script).
- The **D&D 5E by Roll20 (2014)** character sheet, applied to every combatant.

## One-Time Script Configuration

1. Install `5ebattlemaster.js` in your game's Mod (API) sandbox (Default
   server).
2. In chat, run `!combat config` (as GM) and set **Character Sheet** to `OGL`.
   > ⚠️ The script currently **defaults to Shaped**. Until that default is
   > changed, skipping this step means every roll is misparsed.
3. **Do not touch the DeathMarkersPlus config option.** The DeathMarkersPlus
   script no longer exists, and due to a config bug, setting the toggle to
   *either* value enables the integration and will crash the script on the
   first damage application. The fresh-install default is the only safe state.
   (This integration is being removed entirely; see `TODO.md` Phase 2.)
4. **Replace the reticle image.** Targeted attacks spawn a reticle token using
   an image URL hard-coded in `promptTarget()`. Roll20's API only permits
   `createObj` images from *your own* library — as your own-library **thumb**
   URL including its query string. Upload any small reticle PNG to your Roll20
   library, copy its thumb URL, and replace the `imgsrc` value in
   `promptTarget()`.

Settings persist between sessions via the Roll20 `state` object.

## Token Setup (every combatant)

Each token in combat must:

1. **Represent a character.** Link the token to a character sheet
   ("Represents Character" in token settings). AC, resistances, and player
   control are all read from the linked sheet; unlinked tokens crash the turn
   handler.
2. **Use the following bar layout** (hard-coded):

   | Bar | Value | Max |
   |-----|-------|-----|
   | Bar 1 (green) | Remaining movement speed (ft) | Total movement speed (ft) |
   | Bar 2 (blue)  | Temporary HP | — |
   | Bar 3 (red)   | **Current HP** | Max HP |

   All damage is applied to **Bar 3**. Temporary HP in Bar 2 is consumed
   first. Bar 1 is reset to its max each turn, but nothing *decrements* it
   yet — movement tracking is unimplemented (see Move above).
3. **Have a name** — used in whispers and target-disambiguation prompts.
4. **Be in the Turn Tracker** before combat starts (see below).

## Character Sheet Setup

- **Attack and spell rolls must include their damage in the same chat
  message.** The script doesn't roll for players — it parses the roll template
  of the next roll the prompted player makes. Enable **Auto Roll Damage &
  Crit** in the sheet settings, or hits will apply no damage.
- The parser reads the sheet's standard roll templates (`atkdmg` / `dmg` for
  PCs, `npcatk` / `npcaction` for NPCs) via the fields `r1`, `r2`, `dmg1`,
  `dmg1type`, `crit1`, `savedc`, `saveattr`, `savedesc`, and `range`. Stock
  sheet rolls emit these automatically; custom macros must too.
- **Save-for-half spells:** the spell's save description (`savedesc`) must
  contain the phrase "half damage" (case and spacing ignored). Any other
  wording is treated as save-negates.
- **NPC damage immunities / resistances / vulnerabilities** are read from
  `npc_immunities`, `npc_resistances`, and `npc_vulnerabilities` —
  compendium-dragged NPCs populate these. Matching is a case-insensitive
  substring match, so list plain damage types (e.g. `fire, poison`).
  *PC-side resistances are not currently supported* — the 2014 sheet has no
  structured PC resistance attribute (see `TODO.md`, open questions).
- **NPC armor class** lives in `npc_ac`. ⚠️ *Known issue:* the script
  currently queries the long-removed `npcd_ac` attribute and falls back to
  `ac`, which for NPCs yields a wrong, Dex-derived value. Fix scheduled in
  Phase 4; until it lands, NPC AC comparisons are unreliable.

## Map & Page Setup

- Run combat on the page with the **player ribbon** — the reticle, spell FX,
  and all distance math use `playerpageid`.
- Distance math assumes Roll20's default **70 px grid cell** and converts to
  feet using the page's *Scale* setting. Non-default cell sizes or gridless
  maps will miscalculate cones and spheres.

## Turn Tracker

- Add **all** combatants (PCs and NPCs) to the Turn Tracker during the
  `!combat roll initiative` staging phase, then run `!combat begin`. The
  script:
  - prompts the top combatant when the tracker **rotates** (adding entries
    mid-combat — summons, reinforcements — never fires a premature prompt;
    the newcomer is prompted when their slot reaches the top),
  - only considers tokens **in the turn order** as valid attack targets,
  - safely ignores custom (non-token) entries like round counters, wherever
    they sit. If a custom entry is in the top slot, it's nobody's turn until
    the GM advances past it.
  - Tokens deleted mid-combat are skipped gracefully.
- Each character's **Can Be Edited & Controlled By** field determines who is
  whispered prompts and saving-throw requests, preferring whoever can act:
  an **online** listed player first, then an **online** listed GM (so a GM
  co-listed on a PC automatically takes over when the player is absent),
  then an offline listed player (the whisper lands in their archive), then
  the GM. Characters with no controller at all (typical NPCs) route to the
  GM. Unlinked tokens are skipped with a GM whisper explaining the fix.

## AOE Spells

Set the spell's **range** field to: `[Self] [Cone|Line|Sphere] [size in feet]`
— e.g. Burning Hands → `Self Cone 15`.

Current limitations:

- Only **self-origin** AOEs work; point-targeted spells (e.g. Fireball) are
  not yet handled. `Cube` and `Cylinder` are recognized but not implemented.
  Cones, lines, and spheres all work.
- Cone/line direction is chosen from 8 compass-point buttons.
- Save DCs and damage come from the caster's roll; each affected token's
  controller is whispered a saving-throw request, and the script consumes
  their **next** roll as the save.

## Known Issues / Gotchas

Tracked in detail in `TODO.md`. Summary of what bites hardest today:

- **Move does nothing** — the action button is an unimplemented stub.
- **Stacked tokens break targeting**: when the reticle covers multiple
  tokens, the "which token?" disambiguation prompt dead-ends — clicking a
  name records the choice but never resumes the attack. Avoid overlapping
  targets for now; re-click the action button if you hit it.
- **Targeting candidates accumulate**: an internal list is never cleared
  between attacks, so repeated targeting in one session can surface phantom
  disambiguation prompts.
- NPC AC is read from a removed attribute (`npcd_ac`); comparisons
  unreliable for NPCs (Phase 4).
- The DeathMarkersPlus config toggle must not be touched (Phase 2 removes it).
- The script consumes the *next* inline roll from a prompted player — avoid
  unrelated rolls (checks, initiative) while a BattleMaster prompt is
  pending.
- Advantage/disadvantage is not resolved — only the first d20 result is used.
- `spawnFx` calls pass a page object where the current API wants a page ID
  string (Phase 3).

## Planned Functionality

See `TODO.md` for the full phased roadmap. Highlights:

1. Native dead/bloodied status markers (replacing DeathMarkersPlus), with a
   V2 extension path for custom markers.
2. Weapon/spell range enforcement and movement limits from Bar 1.
3. Point-targeted AOEs (Fireball et al.), Cube and Cylinder shapes.
4. Proper advantage/disadvantage handling using `r1`/`r2`.
5. Class-specific combat actions.
6. (Future track) D&D 2024 / Beacon sheet support via `getSheetItem` on the
   Experimental API server.

# Changelog

## Fork — unreleased

- Documentation overhaul: setup requirements, supported-sheet policy
  (2014-only), known-issues list, phased roadmap (`TODO.md`)
- Repo restructure: flattened versioned folders; added test infrastructure
  (`npm test`, 83 unit cases across 5 suites)
- Fixed: controller resolution rewritten (online-aware preference order,
  GM takeover for absent players, GM fallback for NPCs, stale-ID filtering)
- Fixed: turn-order handling — custom entries (round counters), deleted
  tokens, and unlinked tokens are handled gracefully at all three consumer
  sites instead of crashing
- Fixed: line-shaped AOEs (argument-order bug meant they never worked)
- Fixed: remaining movement reset (`bar1_value` typo)
- New: three-phase combat flow (`!combat roll initiative` / `begin round N` /
  `end`) — initiative rolls no longer trigger spurious turn prompts; turn
  listener guards against additions and re-sorts; `end` clears pending roll
  interception
- New: `!combat reticleconfig` — targeting reticle image is configured from
  a selected token (or URL) and stored in namespaced state; reticle failures
  whisper instructions instead of crashing the API sandbox
- Fixed: `sendPing` call updated to the current API signature

## V0.2 (upstream)

- Added a bunch of objects to clarify code
- Added compatibility with DeathMarkersPlus to check for dead or bloodied
  tokens
- Removed deadname
- Added compatibility with 5e Shaped Sheet
- Added Temporary HP as token bar 2

## V0.1 (upstream)

- Initial release: attack rolls, saving throws, and damage for direct weapon
  attacks, direct spell attacks, and AOE spell attacks
