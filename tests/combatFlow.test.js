/*
 * Unit tests for the three-phase combat flow (5ebattlemaster.js)
 *
 * Commands under test:
 *   !combat roll initiative  -> StageInitiative (tracker changes ignored)
 *   !combat begin round 1    -> BeginCombat (turn processing goes live)
 *   !combat end              -> EndCombat (full teardown)
 *
 * Plus the two guards on the change:campaign:turnorder listener:
 *   - growth guard: tracker gaining entries is never a turn advance
 *   - top-unchanged guard: re-sorts below the top don't re-prompt
 *
 * The final scenario reproduces the live-test bug: initiative rolls landing
 * one by one in an empty tracker after combat is staged must produce ZERO
 * turn prompts until the GM runs begin.
 *
 * Run with:  npm test   (or: node tests/combatFlow.test.js)
 */
'use strict';

var fs = require('fs');
var path = require('path');
var _ = require('underscore');

var srcPath = path.join(__dirname, '..', '5ebattlemaster.js');
var src = fs.readFileSync(srcPath, 'utf8');

function extract(decl) {
    var declIdx = src.indexOf(decl);
    if (declIdx === -1) {
        console.error('FATAL: could not locate "' + decl + '" in ' + srcPath);
        process.exit(2);
    }
    var open = src.indexOf('{', declIdx + decl.length - 1);
    var depth = 0;
    var end = open;
    for (; end < src.length; end++) {
        if (src[end] === '{') { depth++; }
        else if (src[end] === '}') { depth--; if (depth === 0) { break; } }
    }
    return src.slice(open, end + 1);
}

var failures = 0;
function expect(name, got, want) {
    var pass = JSON.stringify(got) === JSON.stringify(want);
    if (!pass) { failures++; }
    console.log(
        (pass ? 'PASS' : 'FAIL') + '  ' + name +
        '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)
    );
}

/* ------------------------------------------------------------------ */
/* Stubs and module-state doubles                                     */
/* ------------------------------------------------------------------ */

var logs = [];
function log(m) { logs.push(String(m)); }

var chats = [];
function sendChat(who, what) { chats.push(what); }

// Module state the extracted functions read/write
var bInCombat, bStagingInitiative, bIsWaitingOnRoll, bIsWaitingOnResponse;
var sLastPromptedTurnID, iLastTurnorderLength = 0;
var listPlayerIDsWaitingOnRollFrom = [];
var listRollCallbackFunctions = [];
var listTokensWaitingOnSavingThrowsFrom = [];
var listTokensInEncounter = [];

// Tracker + graphics doubles
var trackerJSON = '';
function Campaign() {
    return { get: function (k) { if (k === 'turnorder') { return trackerJSON; } } };
}
var graphics = {};
function getObj(type, id) {
    if (type !== 'graphic') { return undefined; }
    return graphics[id];
}
graphics.tokA = { id: 'tokA' };
graphics.tokB = { id: 'tokB' };
graphics.tokC = { id: 'tokC' };

// TurnChange double: counts prompts and mimics the real function's guard
// bookkeeping (records the top entry it processed).
var turnChangeCount = 0;
function TurnChange() {
    turnChangeCount++;
    var parsed = trackerJSON ? JSON.parse(trackerJSON) : [];
    sLastPromptedTurnID = parsed.length > 0 ? parsed[0].id : undefined;
}

function setTracker(entries) {
    trackerJSON = JSON.stringify(entries.map(function (e) {
        return { id: e, pr: 0 };
    }));
}

/* ------------------------------------------------------------------ */
/* Extract the units under test                                        */
/* ------------------------------------------------------------------ */

var StageInitiative, BeginCombat, EndCombat, turnListener;
/* eslint-disable no-eval */
eval('StageInitiative = function()' + extract('StageInitiative = function(){'));
eval('BeginCombat = function(announceLabel)' + extract('BeginCombat = function(announceLabel){'));
eval('EndCombat = function()' + extract('EndCombat = function(){'));
eval('turnListener = function()' + extract("on('change:campaign:turnorder', function(){"));
/* eslint-enable no-eval */

/* ------------------------------------------------------------------ */
/* Phase transitions                                                   */
/* ------------------------------------------------------------------ */

StageInitiative();
expect('staging: bInCombat is false', bInCombat, false);
expect('staging: bStagingInitiative is true', bStagingInitiative, true);
expect('staging: announces initiative to the table',
    chats.some(function (c) { return /initiative/i.test(c) && c.indexOf('/w') !== 0; }), true);

// begin refused while tracker is empty
chats = [];
setTracker([]);
BeginCombat('round 1');
expect('begin with empty tracker: refused with GM whisper',
    chats.some(function (c) { return c.indexOf('/w GM') === 0 && /no combatant/i.test(c); }), true);
expect('begin with empty tracker: combat NOT live', bInCombat, false);
expect('begin with empty tracker: no turn prompt', turnChangeCount, 0);

// begin refused when tracker holds only a custom entry
setTracker(['-1']);
BeginCombat('round 1');
expect('begin with only a custom entry: combat NOT live', bInCombat, false);

// begin succeeds with a real token
chats = [];
setTracker(['tokA', 'tokB']);
BeginCombat('round 1');
expect('begin: combat live', bInCombat, true);
expect('begin: staging cleared', bStagingInitiative, false);
expect('begin: announcement echoes the label',
    chats.some(function (c) { return c.indexOf('Combat begins - round 1!') !== -1; }), true);
expect('begin: exactly one turn prompt fired', turnChangeCount, 1);
expect('begin: guard recorded the top entry', sLastPromptedTurnID, 'tokA');

/* ------------------------------------------------------------------ */
/* Listener guards (combat live)                                       */
/* ------------------------------------------------------------------ */

// growth: a summon added mid-fight must not prompt
turnChangeCount = 0;
setTracker(['tokA', 'tokB', 'tokC']);
turnListener();
expect('growth guard: adding an entry mid-combat fires nothing', turnChangeCount, 0);

// same top after a re-sort below: suppressed
setTracker(['tokA', 'tokC', 'tokB']);
turnListener();
expect('top-unchanged guard: re-sort below the top fires nothing', turnChangeCount, 0);

// genuine rotation: new top, same length -> prompt
setTracker(['tokC', 'tokB', 'tokA']);
turnListener();
expect('rotation: new top fires exactly one prompt', turnChangeCount, 1);
expect('rotation: guard tracks the new top', sLastPromptedTurnID, 'tokC');

// removal that changes the top (current combatant deleted) -> prompt
turnChangeCount = 0;
setTracker(['tokB', 'tokA']);
turnListener();
expect('removal exposing a new top fires a prompt', turnChangeCount, 1);

/* ------------------------------------------------------------------ */
/* Teardown                                                            */
/* ------------------------------------------------------------------ */

listPlayerIDsWaitingOnRollFrom = ['p1'];
listRollCallbackFunctions = [function () {}];
listTokensWaitingOnSavingThrowsFrom = [{}];
bIsWaitingOnRoll = true;
EndCombat();
expect('end: combat off', bInCombat, false);
expect('end: roll interception disarmed', bIsWaitingOnRoll, false);
expect('end: pending roll queue cleared', listPlayerIDsWaitingOnRollFrom.length, 0);
expect('end: pending save queue cleared', listTokensWaitingOnSavingThrowsFrom.length, 0);

/* ------------------------------------------------------------------ */
/* Full scenario: the live-test bug                                    */
/* ------------------------------------------------------------------ */

turnChangeCount = 0;
chats = [];
setTracker([]);
StageInitiative();
// initiative rolls land one at a time, re-sorting as they arrive
setTracker(['tokA']); turnListener();
setTracker(['tokB', 'tokA']); turnListener();
setTracker(['tokB', 'tokC', 'tokA']); turnListener();
setTracker(['tokC', 'tokB', 'tokA']); turnListener(); // GM sorts the tracker
expect('SCENARIO: zero prompts while initiative fills the tracker', turnChangeCount, 0);
BeginCombat('round 1');
expect('SCENARIO: begin fires exactly one prompt', turnChangeCount, 1);
expect('SCENARIO: prompt is for the sorted top', sLastPromptedTurnID, 'tokC');
setTracker(['tokB', 'tokA', 'tokC']); turnListener(); // GM advances
expect('SCENARIO: advancing prompts the next combatant', turnChangeCount, 2);

/* ------------------------------------------------------------------ */

if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
}
console.log('\nAll tests passed.');
