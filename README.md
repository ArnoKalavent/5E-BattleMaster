# Setup & Requirements

5E BattleMaster makes a number of assumptions about how your game is configured. If any of these
aren't met, the script will fail silently or crash mid-combat, so read this section before your
first `!combat start`.

## Prerequisites

- A **Roll20 Pro** subscription (required for any API script).
- One of the two supported character sheets, applied to every combatant:
  - **5th Edition OGL by Roll20**
  - **5e Shaped**
- *(Optional)* [DeathMarkersPlus](https://github.com/search?q=DeathMarkersPlus), for automatic
  dead/bloodied token markers. Do **not** enable its compatibility toggle unless the script is
  actually installed (see Known Issues).

## One-Time Script Configuration

1. Install `5ebattlemaster.js` in your game's API sandbox.
2. In chat, run `!combat config` (as GM) and set **Character Sheet** to `OGL` or `Shaped`.
   > ⚠️ The script **defaults to Shaped**. If your game uses the OGL sheet and you skip this
   > step, every attack and spell roll will be misparsed.
3. Only if DeathMarkersPlus is installed: set **DeathMarkersPlus** to `On`.
4. **Replace the reticle image.** Targeted attacks spawn a reticle token using an image URL
   hard-coded in `promptTarget()`. Roll20's API can only create tokens from images in *your own*
   library, so on a fresh install the reticle silently fails and targeting dead-ends. Upload a
   reticle image (any small PNG) to your Roll20 library, grab its **thumb** URL, and replace the
   `imgsrc` URL in `promptTarget()`.

Settings persist between sessions via the Roll20 `state` object.

## Token Setup (every combatant)

Each token in combat must:

1. **Represent a character.** Link the token to a character sheet ("Represents Character" in
   token settings). AC, resistances, and player control are all read from the linked sheet;
   unlinked tokens crash the turn handler.
2. **Use the following bar layout** (this is hard-coded):

   | Bar | Value | Max |
   |-----|-------|-----|
   | Bar 1 (green) | Remaining movement speed (ft) | Total movement speed (ft) |
   | Bar 2 (blue)  | Temporary HP | — |
   | Bar 3 (red)   | **Current HP** | Max HP |

   All damage is applied to **Bar 3**. Temporary HP in Bar 2 is consumed first (OGL sheets only).
3. **Have a name** — it's used in whispers and target-disambiguation prompts.
4. **Be in the Turn Tracker** before combat starts (see below).

## Character Sheet Setup

- **AC** is read from the `npcd_ac` attribute, falling back to `ac`. The standard sheets
  populate these automatically.
- **Damage immunities / resistances / vulnerabilities** are read from:
  - OGL: `npc_immunities`, `npc_resistances`, `npc_vulnerabilities` — note these are **NPC
    attributes**; PC resistances are currently ignored on the OGL sheet.
  - Shaped: `damage_immunities`, `damage_resistances`, `damage_vulnerabilities`.
  - Matching is a case-insensitive substring match, so list plain damage types, e.g.
    `fire, poison, bludgeoning`.
- **Attack and spell rolls must include their damage in the same chat message.** The script
  parses the roll template of the next roll a player makes; it does not roll for them.
  - OGL: enable **Auto Roll Damage & Crit** in sheet settings. Expected template fields:
    `r1`, `r2`, `dmg1`, `dmg1type`, `crit1`, `savedc`, `saveattr`, `savedesc`, `range`.
  - Shaped: expected fields include `attack1`, `attack_damage`, `attack_damage_type`,
    `saving_throw_damage`, `saving_throw_vs_ability`, `saving_throw_dc`, and `roll1` for
    plain saving throws.
- **Save-for-half spells:** the save description (`savedesc`) must contain the exact phrase
  "half damage" (case and spaces ignored). Any other wording is treated as save-negates.

## Map & Page Setup

- Combat must take place on the page with the **player ribbon** — the reticle, spell FX, and
  all distance math use `playerpageid`.
- Distance math assumes Roll20's default **70 px grid** and uses the page's *Scale* setting to
  convert to feet. Non-default cell sizes or gridless maps will miscalculate cones and spheres.

## Turn Tracker

- Add **all** combatants (PCs and NPCs) to the Turn Tracker and roll initiative *before*
  running `!combat start`. The script:
  - fires player prompts whenever the turn order advances,
  - only considers tokens **in the turn order** as valid attack targets,
  - reads the current combatant from the **top slot**, so keep custom counters (round
    trackers, spell durations) out of the first position.
- Each character's **Can Be Edited & Controlled By** field determines who gets whispered
  prompts and saving-throw requests. Characters with no controller fall back to the GM.

## AOE Spells

Set the spell's **range** field to: `[Self] [Cone|Line|Sphere] [size in feet]`
e.g. Burning Hands → `Self Cone 15`.

Current limitations:

- Only **self-origin** AOEs work; spells cast at a distant point (e.g. Fireball) are not yet
  handled.
- `Cube` and `Cylinder` are recognized but not implemented.
- Cone/line direction is chosen from 8 compass-point buttons.
- Save DCs and damage come from the caster's roll; each affected token's controller is
  whispered a saving-throw request, and the script consumes their **next** roll as the save.

## Known Issues / Gotchas

- **Don't touch the DeathMarkersPlus config toggle unless the script is installed.** The
  toggle stores the string `"false"`, which JavaScript treats as truthy — so "Off" doesn't
  actually turn it off, and every damage application will crash without DeathMarkersPlus
  present. The fresh-install default is the only truly "off" state.
- Movement-speed reset writes to `bar1_val` instead of `bar1_value` (typo), so remaining
  movement is never actually restored between turns.
- Because the script consumes the *next* inline roll from a prompted player, avoid making
  unrelated rolls (checks, initiative) while a BattleMaster prompt is pending.
- Advantage/disadvantage is not resolved — only the first d20 result is used.
