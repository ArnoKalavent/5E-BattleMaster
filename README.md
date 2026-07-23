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
so read this section before your first `!combat start`.

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

   All damage is applied to **Bar 3**. Temporary HP in Bar 2 is consumed first.
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

- Add **all** combatants (PCs and NPCs) to the Turn Tracker and roll
  initiative *before* running `!combat start`. The script:
  - fires player prompts whenever the turn order advances,
  - only considers tokens **in the turn order** as valid attack targets,
  - reads the current combatant from the **top slot**. ⚠️ *Known issue:*
    custom (non-token) tracker entries such as round counters currently crash
    the script due to a type-mismatch bug — keep them out of the tracker
    entirely until the Phase 1 fix lands.
- Each character's **Can Be Edited & Controlled By** field determines who is
  whispered prompts and saving-throw requests. ⚠️ *Known issue:* the intended
  GM fallback for uncontrolled characters is broken — a character with an
  empty control list (i.e. a typical NPC) currently crashes the turn handler.
  Until the Phase 1 fix lands, **explicitly assign a controller (e.g. the GM)
  to every NPC in combat.**

## AOE Spells

Set the spell's **range** field to: `[Self] [Cone|Line|Sphere] [size in feet]`
— e.g. Burning Hands → `Self Cone 15`.

Current limitations:

- Only **self-origin** AOEs work; point-targeted spells (e.g. Fireball) are
  not yet handled. `Cube` and `Cylinder` are recognized but not implemented.
- ⚠️ *Known issue:* Line AOEs are currently broken (argument-order bug; Phase
  1 fix). Cones and spheres work.
- Cone/line direction is chosen from 8 compass-point buttons.
- Save DCs and damage come from the caster's roll; each affected token's
  controller is whispered a saving-throw request, and the script consumes
  their **next** roll as the save.

## Known Issues / Gotchas

Tracked in detail in `TODO.md`. Summary of what bites hardest today:

- NPC turns crash if the character has no assigned controller (Phase 1).
- Custom Turn Tracker entries crash the current-turn lookup (Phase 1).
- Line-shaped AOEs never resolve (Phase 1).
- Remaining movement (Bar 1) is never reset between turns — `bar1_val` typo
  (Phase 1).
- NPC AC is read from a removed attribute; comparisons unreliable (Phase 4).
- The DeathMarkersPlus config toggle must not be touched (Phase 2 removes it).
- The script consumes the *next* inline roll from a prompted player — avoid
  unrelated rolls (checks, initiative) while a BattleMaster prompt is pending.
- Advantage/disadvantage is not resolved — only the first d20 result is used.
- `sendPing`/`spawnFx` calls use outdated argument forms (Phase 3).

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
