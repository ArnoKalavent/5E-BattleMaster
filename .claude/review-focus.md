This is a Roll20 Mod (API) script that automates D&D 5E combat. It runs inside Roll20's Mod sandbox, not in Node: one script file, Roll20 globals only (on, sendChat, getObj, findObjs, createObj, Campaign, state, log), no require, filesystem or network. A thrown exception takes the whole sandbox down for the table, so treat any unguarded access as at least MAJOR.

Look hard at:
- Turn order: Campaign().get('turnorder') is a JSON string and may be empty. Entries can be custom items whose id is the string "-1", and can point at tokens that have since been deleted.
- Tokens and characters: getObj can return undefined; a token may not represent a character; bar values may be empty strings rather than numbers.
- Players: who controls a character (controlledby can be empty, "all", or a list), whether that player is online, and the GM being co-listed as controller on player characters.
- Persistent `state`: it survives sandbox restarts, so check keys are namespaced to this script and that old saved shapes are handled.
- Target sheet is "D&D 5E by Roll20" (2014). Flag any new dependency on the Shaped sheet, the 2024/Beacon sheet, or DeathMarkersPlus.
- Chat commands should read like table actions (`!combat roll initiative`, `!combat begin round 2`, `!combat end`). Flag new commands that break that grammar.
- Any changed behaviour needs a matching change in the unit tests run by `npm test`.
