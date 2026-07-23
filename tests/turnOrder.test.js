/*
 * Unit tests for findCurrentTurnToken (5ebattlemaster.js)
 *
 * Verifies turn-order handling against the current Roll20 API contract:
 * custom turn-order items carry id "-1" as a STRING; the tracker arrives as
 * a JSON string (or may be passed pre-parsed); entries can reference tokens
 * that have since been deleted from the page.
 *
 * Run with:  npm test   (or: node tests/turnOrder.test.js)
 */
'use strict';

var fs = require('fs');
var path = require('path');
var _ = require('underscore');

/* ------------------------------------------------------------------ */
/* Roll20 sandbox stubs                                               */
/* ------------------------------------------------------------------ */

var logs = [];
function log(msg) { logs.push(String(msg)); }

// Graphics pool: id -> minimal token object
var graphics = {};
function addToken(id, name) {
    graphics[id] = {
        id: id,
        get: function (key) { if (key === 'name') { return name; } }
    };
}

function getObj(type, id) {
    if (type !== 'graphic') { return undefined; }
    return graphics[id];
}

// Campaign() is only consulted when the function is called with no argument.
var campaignTurnorder = '';
function Campaign() {
    return { get: function (key) {
        if (key === 'turnorder') { return campaignTurnorder; }
    } };
}

/* ------------------------------------------------------------------ */
/* Extract the function under test from the shipping source            */
/* ------------------------------------------------------------------ */

var FN_DECL = 'findCurrentTurnToken = function(turnorder) {';
var srcPath = path.join(__dirname, '..', '5ebattlemaster.js');
var src = fs.readFileSync(srcPath, 'utf8');

var declIdx = src.indexOf(FN_DECL);
if (declIdx === -1) {
    console.error('FATAL: could not locate "' + FN_DECL + '" in ' + srcPath);
    process.exit(2);
}
var open = src.indexOf('{', declIdx + FN_DECL.length - 1);
var depth = 0;
var end = open;
for (; end < src.length; end++) {
    if (src[end] === '{') { depth++; }
    else if (src[end] === '}') { depth--; if (depth === 0) { break; } }
}

var findCurrentTurnToken;
/* eslint-disable no-eval -- deliberate: binds the extracted function to the
   stubbed globals in this module's scope. */
eval('findCurrentTurnToken = function(turnorder)' + src.slice(open, end + 1));
/* eslint-enable no-eval */

/* ------------------------------------------------------------------ */
/* Tiny assertion helper                                              */
/* ------------------------------------------------------------------ */

var failures = 0;
function expect(name, got, want) {
    var pass = got === want;
    if (!pass) { failures++; }
    console.log(
        (pass ? 'PASS' : 'FAIL') + '  ' + name +
        '  got=' + JSON.stringify(got && got.id ? got.id : got) +
        ' want=' + JSON.stringify(want && want.id ? want.id : want)
    );
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

addToken('tokA', 'Aragorn');
addToken('tokB', 'Boromir');

function entry(id, pr) { return { id: id, pr: pr === undefined ? 0 : pr }; }

/* ------------------------------------------------------------------ */
/* Cases                                                              */
/* ------------------------------------------------------------------ */

// Happy path: token on top, JSON-string input (as Campaign() delivers it)
expect('token on top (string input) -> that token',
    findCurrentTurnToken(JSON.stringify([entry('tokA', 15), entry('tokB', 9)])),
    graphics.tokA);

// Happy path: pre-parsed array input
expect('token on top (parsed array input) -> that token',
    findCurrentTurnToken([entry('tokB', 20), entry('tokA', 3)]),
    graphics.tokB);

// The headline bug: custom entries have id "-1" as a STRING per current docs
expect('custom entry (string "-1") on top -> undefined, no crash',
    findCurrentTurnToken(JSON.stringify([entry('-1', 100), entry('tokA', 15)])),
    undefined);

// Defensive: legacy numeric -1
expect('custom entry (numeric -1) on top -> undefined, no crash',
    findCurrentTurnToken([entry(-1, 100), entry('tokA', 15)]),
    undefined);

// Deleted token: entry references a graphic that no longer exists
expect('deleted token on top -> undefined, no crash',
    findCurrentTurnToken(JSON.stringify([entry('gone99', 12)])),
    undefined);

// Empty / absent trackers
expect('empty array -> undefined',
    findCurrentTurnToken([]), undefined);
expect('empty JSON array string -> undefined',
    findCurrentTurnToken('[]'), undefined);

campaignTurnorder = '';
expect('no argument + empty Campaign turnorder -> undefined',
    findCurrentTurnToken(undefined), undefined);

campaignTurnorder = JSON.stringify([entry('tokA', 15)]);
expect('no argument -> falls back to Campaign turnorder',
    findCurrentTurnToken(undefined), graphics.tokA);

// Custom entry deeper in the tracker must NOT affect the top-slot answer
expect('token on top with custom entry below -> token',
    findCurrentTurnToken(JSON.stringify([entry('tokA', 15), entry('-1', 100)])),
    graphics.tokA);

/* ------------------------------------------------------------------ */

if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
}
console.log('\nAll tests passed.');
