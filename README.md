# 5E BattleMaster

A Roll20 Mod (API) script that automates part of D&D 5th Edition combat: turn
prompts from the Turn Tracker, target selection with an on-map reticle, attack
resolution, and damage application with resistances and temporary HP.

> **Project status: paused, 2026-09-25.** This fork is not abandoned code — it
> is in a deliberately clean, documented state, and everything below is
> accurate as of the final commit. It stopped for a reason worth reading
> before you fork it yourself; see [Why this stopped](#why-this-stopped).

This is a fork of
[posadist-revolution/5E-BattleMaster](https://github.com/posadist-revolution/5E-BattleMaster)
(original author: Sarah Hunicke-Smith), modernized for the current Roll20 Mod
API and the **D&D 5e OGL by Roll20** character sheet.

---

## Why this stopped

The original goal was full combat automation. That goal is not reachable, and
the reason is structural rather than a matter of remaining effort.

**5e's reaction economy is fundamentally interruptive, and this script — like
any script driven by one player's roll at a time — resolves a turn linearly.**

- **Shield** changes a target's AC *after* they see the attack roll.
- **Cutting Words** reduces an attack roll *after* it is made, by a third
  party who is not the active player.
- Any number of abilities in any number of books do something similar, and
  the list only grows.

The script resolves an attack in a single pass: the roll arrives, hit or miss
is computed, damage is applied. There is no point at which another player can
intervene. Adding one requires splitting attack resolution into stages — which
is tractable, and was planned — but the deeper problem is that the set of
interrupts is unbounded and cannot be enumerated in advance.

**The sharper version of the argument:** a script that is *usually* right is
more dangerous than no script, because people stop checking it. If a Shield is
ignored and 30 damage lands on a wizard who should have taken none, and nobody
notices because the script said so, that is worse than doing the arithmetic by
hand.

### What we would have built instead

The design that dissolves this is not to model every interrupt. It is to make
the script **correctable**: an `!combat undo` that reverses the last damage
application. One bounded feature absorbs an unbounded problem space — Shield,
Cutting Words, a misread AC, a forgotten Bless, and every ability nobody has
thought of yet. The script already records exactly what it wrote to which bar.

If you fork this, build that first. It is recorded in `TODO.md`.

### What is worth salvaging

If your goal is narrower — *"stop me doing HP and resistance arithmetic for
eight monsters while six players talk at me"* — that is achievable, and it is
most of what works here today.

---

## What it actually does

Honest scope. Everything in this list was verified by unit tests, and most of
it by live play.

1. **Turn prompts.** When the Turn Tracker rotates, the controlling player is
   whispered a two-button menu: **Weapon Attack** and **Direct Spell**.
2. **Targeting.** An on-map reticle token is spawned; the player drags it over
   a target and confirms. Ambiguous overlaps prompt a token list.
3. **Attack resolution.** The script waits for the player's next roll from
   their character sheet, parses the roll template, and compares the attack
   roll to the target's AC.
4. **Damage application**, which is the part that works best:
   - primary damage, secondary damage, **rider damage** (Sneak Attack, Divine
     Smite, Dueling Style) and **higher-level spell damage**
   - NPC immunities, resistances and vulnerabilities, correctly rounded
     *down* per 5e
   - temporary HP consumed before HP
   - refuses to write to a token whose HP bar is missing or non-numeric,
     and tells the GM instead
5. **Saving throws.** Single-target save spells whisper the defender, wait for
   their save, and adjudicate it.
6. **Escape hatch.** `!combat cancel` clears a prompt you cannot satisfy.

### What it does not do

| | |
|---|---|
| **Reactions and interrupts** | Shield, Cutting Words, etc. See above. This is why the project stopped. |
| **Multiple attacks per turn** | The menu is offered once per turn. Extra Attack, Action Surge and haste are not handled. Workaround: `!combat cancel` re-offers the menu. |
| **AOE spells** | Removed 2026-09-24. Cones and lines never adjudicated a save, cube was an empty function, cylinder was a miscopied sphere. |
| **Movement** | Removed 2026-09-24. Never implemented upstream — the button existed and did nothing. |
| **Critical hits** | Parsed from the roll and deliberately discarded. |
| **Advantage / disadvantage** | Both dice are parsed; only the first is read. |
| **Status markers** | Nothing marks dead, unconscious or bloodied. |
| **PC resistances** | Only NPC resistance attributes are read. |
| **NPC attacks** | **Unverified.** The parser never checks which roll template it received — it greps for `dmg1`, `r1` and similar field names. Whether NPC action templates use those names was never confirmed. If they do not, monster attacks have never worked. |

---

## Requirements

- **Roll20 Pro** (required for any Mod script).
- **D&D 5e OGL by Roll20** character sheet on every combatant.
  This is *not* the same sheet as "D&D 5E by Roll20", which emits
  `weapondamage` rather than `dmg1`/`globaldamage` and is **not supported**.
  D&D 2024 / Beacon is not supported either.
- The **Default** Mod sandbox. The Experimental server is not needed.
- Deploy `dist/5ebattlemaster.js`, not the source file — see
  [Building](#building).

---

## Setup

### 1. Install and check the banner

Paste `dist/5ebattlemaster.js` into your game's Mod sandbox. On startup the
API console must print:

```
-=> BattleMaster v0.3.0-dev (<rev>) <=- [timestamp]
```

If the rev is not the build you just pasted, you are running a stale copy.
If the console shows `SyntaxError: Unexpected end of input`, your paste was
**truncated** — the file is ~1000 lines and must end with `});`.

> **Multi-tab hazard.** The script opens with
> `var BattleMaster = BattleMaster || (function(){`. If an older copy exists in
> a script tab that loads first, the `||` short-circuits and the new script is
> silently skipped, while the startup handler still registers the *old*
> version's behaviour. The banner is the only way to tell. If it reports a rev
> you do not recognise, delete the other tab rather than re-pasting.

### 2. Configure the reticle

Targeting spawns a reticle token, and Roll20 only permits `createObj` images
from **your own library**.

1. Upload any small image to your Roll20 library and drag it onto the page.
2. Select that token and run `!combat set reticle` (GM only).
3. The token can then be deleted.

Alternatively `!combat set reticle <url>` with a library **thumb** URL,
including its query string.

### 3. Token setup

Every combatant token must:

- **Represent a character.** AC, resistances and player control are read from
  the linked sheet.
- **Use this bar layout** (hard-coded):

  | Bar | Value |
  |---|---|
  | Bar 1 | *unused* — movement was removed |
  | Bar 2 (blue) | Temporary HP |
  | Bar 3 (red) | **Current HP** |

  Damage applies to **Bar 3**; temporary HP in Bar 2 is consumed first. A
  blank Bar 2 means "no temporary HP" and is fine. A blank or non-numeric
  **Bar 3** causes the script to refuse the damage and whisper the GM.
- **Have a name**, used in whispers and disambiguation prompts.
- **Be in the Turn Tracker** before `!combat begin`.

### 4. Character sheet setup

- **Enable "Auto Roll Damage & Crit"** in the sheet settings. The script does
  not roll — it parses the next roll the prompted player makes, and needs the
  damage in the same message.
- **Save-for-half spells:** the save description must contain the phrase
  "half damage" (case and spacing ignored). Other wording is treated as
  save-negates.
- **NPC resistances** come from `npc_immunities`, `npc_resistances` and
  `npc_vulnerabilities`. Compendium NPCs populate these. Matching is
  case-insensitive substring, so list plain damage types (`fire, poison`).

### 5. Map and page

Run combat on the page holding the **player ribbon**. The reticle and all
distance maths resolve the page as `playerpageid`.

---

## Commands

| Command | Who | What |
|---|---|---|
| `!combat roll initiative` | GM | Staging phase — tracker changes are ignored while initiative is gathered |
| `!combat begin round 1` | GM | Go live; refuses if the tracker is empty |
| `!combat end` | GM | Full teardown, including pending roll queues |
| `!combat cancel` | anyone | Clear your own pending prompt and re-offer the action menu |
| `!combat cancel all` | GM | Clear everyone's |
| `!combat set reticle [url]` | GM | Configure the reticle image |

`!combat start` / `!combat stop` remain as legacy aliases, as does
`!combat reticleconfig`. Anything unrecognised answers with a usage whisper
rather than failing silently.

---

## Known bugs

Verified against the final commit. Full detail, with line numbers and
reproduction, is in `TODO.md`.

**Wrong result, no error:**

1. **Disambiguation targeting always misses.** When two tokens overlap under
   the reticle, choosing from the prompt assigns a raw Graphic where a wrapper
   is expected, so `target.ac` is `undefined`, `undefined <= roll` is false,
   and the attack is a guaranteed miss. The action also fires *before* the
   choice is made, against the previous target.
2. **NPC AC is read from the wrong attribute.** The script queries `npcd_ac`,
   removed from the sheet around 2017, then falls back to the PC-side `ac`
   field. The value is also never validated as a number: `""` coerces to 0 and
   always hits, `"15 (natural armor)"` gives `NaN` and never hits.
3. **Multiple attacks per turn are ignored** (see table above).
4. **Roll dispatch finds the oldest expectation for a player**, so a player
   owing two rolls can have one adjudicated as the other.
5. **Targeting is limited to tokens in the Turn Tracker.** Anything else
   cannot be targeted; the script now says so rather than failing silently.

**Unresolved:**

6. **Roll interception does not fire for a GM proxying an offline player.**
   Reproduced live, cause unknown. `findWhoIsControlling` was ruled out by
   direct execution.

**Unverified:**

7. **NPC attack templates** (see table above). One captured `msg.content` from
   a monster attack would settle it.
8. **`hldmg`** (higher-level spell damage) is implemented from the sheet's
   documented field list and confirmed by no live capture.

---

## Building

```
npm install      # dev dependencies only; the script itself has none
npm test         # 1137 assertions
npm run build    # writes dist/5ebattlemaster.js with the git rev stamped in
```

The source keeps `buildRev = 'dev (unstamped)'`; only `npm run build` fills it
from `git describe`. **Always deploy `dist/`.** A build stamped `dev
(unstamped)` means somebody pasted the source file, which is how a stale build
goes unnoticed.

---

## For anyone picking this up

The genuinely reusable work here is not the combat automation. It is the
tooling built to make an old, untested script safe to change.

- **`TODO.md` is the real documentation.** It contains a six-subsystem code
  audit, the full roll-template field mapping with two captured real messages,
  every design decision with its reasoning, and every open bug with a
  reproduction. Read it before the source.
- **`tests/support/roll20.js`** is a fake Roll20 environment that loads the
  real script through `vm.runInNewContext` and hands back inspectable token and
  character objects. Before it existed, the suite stubbed `applyDamage`,
  `TurnChange` and `getAttrByName` — and *every* sandbox-killing crash found
  during this work lived in exactly that blind spot.
- **`tests/compiles.test.js`** parses both the source and `dist/`. The file is
  one IIFE whose members are a comma-separated expression list, so a stray
  comma is a syntax error, and in the Roll20 sandbox a syntax error means the
  script never loads and the table's Mods are dead. That check runs first.
- **Defect pinning.** Tests that record known-wrong behaviour are named
  `DEFECT ...` with the correct value in a comment. Fixing the bug then flips a
  labelled assertion instead of appearing to break the suite. Six unlabelled
  pins were found during the audit and were actively misleading.
- **`tools/review-status.js`** compares a digest of the git *index* against
  what a reviewer was actually shown, because on one occasion review findings
  were hand-fixed and committed without re-review, and nothing caught it.

### Lessons that cost the most to learn

- **Waiting for one captured message beat guessing.** Rider damage looked like
  it belonged in `dmg2`. It does not — it arrives in `globaldamage`, and
  `dmg2` is present as a literal `0`. Uncommenting the "obvious" two lines
  would have changed nothing visible and shipped as a fix.
- **`globaldamagetype` is free text.** It has been observed as a real damage
  type, as a label (`Sneak`), and as blank. Sneak Attack damage is the
  weapon's type, so typing it `sneak` would let it bypass piercing resistance —
  a wrong number in the opposite direction from the bug being fixed.
- **Deletion was the highest-value change available.** The script went from
  1509 lines to ~1000. Everything removed was broken, unreachable, or a button
  that did nothing.

---

## Changelog

### Fork — v0.3.0-dev

**Scope decisions:** AOE spells and Movement removed entirely; Shaped sheet
support and the whole sheet-type concept removed, leaving the script
unconditionally OGL; other sheets are a fork, not a branch; crits, advantage
and status markers deferred.

**Correctness:** rider and higher-level damage now applied; resistance rounds
down per 5e; empty damage types no longer match every immunity; blank and
non-numeric token bars no longer corrupt silently; nine unguarded callback
paths that could disable the sandbox for the whole table were closed;
DeathMarkersPlus removed, including a config bug that armed it permanently.

**Reliability:** whole-file compile check, real Roll20 test harness, build-rev
stamping, review-freshness gate. Assertions grew from zero to 1137.

**Fixed upstream defects:** initiative prompt spam, turn-order handling for
custom and deleted entries, controller resolution, roll-expectation
desynchronisation, targeting failures that silently reused the previous
target, and a damage-parsing path that crashed the sandbox.

### V0.2 / V0.1 (upstream)

See the original repository.

---

## Licence

Inherited from the upstream project.
