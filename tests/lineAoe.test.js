/*
 * Unit tests for the line-AOE fix and ResetTokenTurnValues (5ebattlemaster.js)
 *
 * Two things are under test:
 *
 * 1. CALL-SITE CONTRACT: lineDirectionPromptCallback must invoke
 *    findAllTokensInLine(originLocation, direction, range) - the historical
 *    bug passed (x, y, direction, range), shifting every argument.
 *
 * 2. GEOMETRY: findAllTokensInLine returns exactly the encounter tokens
 *    inside the line for cardinal and diagonal directions.
 *
 * Plus: ResetTokenTurnValues writes 'bar1_value' (not the 'bar1_val' typo).
 *
 * Run with:  npm test   (or: node tests/lineAoe.test.js)
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
/* Shared stubs                                                       */
/* ------------------------------------------------------------------ */

var logs = [];
function log(m) { logs.push(String(m)); }

function location(x, y, z) { this.x = x; this.y = y; this.z = z; }

function distanceBetween(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y, dz = (a.z || 0) - (b.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// 5 ft per 70 px grid cell (Roll20 default page scale)
function distanceToPixels(feet) { return (feet / 5) * 70; }

// Encounter tokens: tokenWrapper-ish stubs (only left/top are consulted)
function mkTok(name, left, top) {
    return {
        name: name,
        get: function (k) {
            if (k === 'left') { return left; }
            if (k === 'top') { return top; }
        }
    };
}
function createLocFromToken(tok) {
    return new location(tok.get('left'), tok.get('top'), 0);
}

/* ------------------------------------------------------------------ */
/* 1) Call-site contract: lineDirectionPromptCallback                  */
/* ------------------------------------------------------------------ */

// Globals the callback reads
var direction = 'up';
var range = 30;
var currentTurnToken = { token: mkTok('Caster', 350, 350) };
var currentlyCastingSpellRoll = { dmgTypes: ['lightning'] };
var reticleTokenId = null;

// Globals the callback calls
var recordedArgs = null;
function findAllTokensInLine(origin, dir, rng) {
    recordedArgs = { origin: origin, direction: dir, range: rng };
    return [];
}
function spellEffects() {}
function spawnFxBetweenPoints() {}
function dmgTypeToFXName() { return 'electric'; }
function getObj() { return undefined; }
function Campaign() { return { get: function () { return 'page1'; } }; }

var lineDirectionPromptCallback;
/* eslint-disable no-eval */
eval('lineDirectionPromptCallback = function()' +
    extract('lineDirectionPromptCallback = function(){'));
/* eslint-enable no-eval */

lineDirectionPromptCallback();

expect('call site passes a location object as origin',
    recordedArgs !== null &&
    typeof recordedArgs.origin === 'object' &&
    typeof recordedArgs.origin.x === 'number' &&
    typeof recordedArgs.origin.y === 'number', true);
expect('call site passes the direction string, not a coordinate',
    recordedArgs.direction, 'up');
expect('call site passes the numeric range, not the direction',
    recordedArgs.range, 30);
// direction 'up' offsets the origin one half-cell (-35px) along y
expect('origin offset applied for "up" (y - 35)',
    { x: recordedArgs.origin.x, y: recordedArgs.origin.y },
    { x: 350, y: 315 });

/* ------------------------------------------------------------------ */
/* 2) Geometry: findAllTokensInLine                                    */
/* ------------------------------------------------------------------ */

var listTokensInEncounter = [];

var realFindAllTokensInLine;
/* eslint-disable no-eval */
eval('realFindAllTokensInLine = function(origin,direction,range)' +
    extract('findAllTokensInLine = function(origin,direction,range){'));
/* eslint-enable no-eval */

function namesIn(origin, dir, rng) {
    return realFindAllTokensInLine(origin, dir, rng)
        .map(function (t) { return t.name; });
}

var origin = new location(350, 350, 0);
// 30 ft = 420 px reach
listTokensInEncounter = [
    mkTok('N-near', 350, 210),      // 140px up: in an "up" line
    mkTok('N-far', 350, 910),       // 560px up... actually below; see S-far
    mkTok('S-near', 350, 490),      // 140px down
    mkTok('E-near', 490, 350),      // 140px right
    mkTok('W-near', 210, 350),      // 140px left
    mkTok('N-offaxis', 385, 210),   // 35px off the up-axis (>20 tolerance)
    mkTok('NE-diag', 490, 210),     // perfect 45° up-right, ~198px
    mkTok('N-out-of-range', 350, -140) // 490px up: beyond 420px reach
];

expect('up: hits only the near on-axis token',
    namesIn(origin, 'up', 30), ['N-near']);
expect('down: hits only the south token',
    namesIn(origin, 'down', 30), ['S-near']);
expect('right: hits only the east token',
    namesIn(origin, 'right', 30), ['E-near']);
expect('left: hits only the west token',
    namesIn(origin, 'left', 30), ['W-near']);
expect('upright diagonal: hits the 45-degree token',
    namesIn(origin, 'upright', 30), ['NE-diag']);
expect('off-axis token (35px) excluded by 20px tolerance',
    namesIn(origin, 'up', 30).indexOf('N-offaxis'), -1);
expect('token beyond range excluded',
    namesIn(origin, 'up', 60).indexOf('N-out-of-range') !== -1, true); // sanity: 60ft reaches it
expect('token beyond 30ft range excluded at 30ft',
    namesIn(origin, 'up', 30).indexOf('N-out-of-range'), -1);

/* ------------------------------------------------------------------ */
/* 3) ResetTokenTurnValues writes bar1_value                           */
/* ------------------------------------------------------------------ */

var iXStart, iYStart;
var setCalls = {};
var wrapper = {
    token: {
        get: function (k) {
            if (k === 'bar1_max') { return 30; }
            if (k === 'left') { return 100; }
            if (k === 'top') { return 200; }
        },
        set: function (k, v) { setCalls[k] = v; }
    }
};

var ResetTokenTurnValues;
/* eslint-disable no-eval */
eval('ResetTokenTurnValues = function(currentTurnTokenWrapper)' +
    extract('ResetTokenTurnValues = function(currentTurnTokenWrapper){'));
/* eslint-enable no-eval */

ResetTokenTurnValues(wrapper);

expect('writes bar1_value (not the bar1_val typo)',
    setCalls.bar1_value, 30);
expect('does not write the old bar1_val key',
    setCalls.bar1_val, undefined);
expect('records movement speed on the wrapper',
    wrapper.iMoveSpeedRemaining, 30);

/* ------------------------------------------------------------------ */

if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
}
console.log('\nAll tests passed.');
