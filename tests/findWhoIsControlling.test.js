/*
 * Unit tests for findWhoIsControlling (5ebattlemaster.js)
 *
 * The script targets Roll20's Mod (API) sandbox, which provides globals like
 * playerIsGM, getObj, findObjs, log, and the Underscore namespace (_). This
 * harness stubs those globals, extracts the function under test from the
 * actual source file (so we always test what ships), and runs it against a
 * small in-memory player pool.
 *
 * Run with:  npm install && npm test
 *
 * Extraction note: the function is located by its exact declaration string
 * and captured via brace matching. If the declaration line is renamed or
 * reformatted, update FN_DECL below.
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

// Player pool: id -> { id, online, gm, name }
var pool = {};
function addPlayer(id, online, gm, name) {
    pool[id] = { id: id, online: online, gm: gm, name: name };
}

function playerIsGM(id) {
    return pool[id] ? pool[id].gm : false;
}

function asRoll20Obj(rec) {
    return {
        id: rec.id,
        get: function (key) {
            if (key === '_online') { return rec.online; }
            if (key === 'displayname') { return rec.name; }
            return undefined;
        }
    };
}

function getObj(type, id) {
    if (type !== 'player') { return undefined; }
    return pool[id] ? asRoll20Obj(pool[id]) : undefined;
}

function findObjs(query) {
    return Object.values(pool)
        .filter(function (rec) {
            if (query._online !== undefined && rec.online !== query._online) {
                return false;
            }
            return true;
        })
        .map(asRoll20Obj);
}

function mkCharacter(controlledby) {
    return {
        get: function (key) {
            if (key === 'controlledby') { return controlledby; }
            return undefined;
        }
    };
}

/* ------------------------------------------------------------------ */
/* Extract the function under test from the shipping source            */
/* ------------------------------------------------------------------ */

var FN_DECL = 'findWhoIsControlling = function(character){';
var srcPath = path.join(__dirname, '..', '5ebattlemaster.js');
var src = fs.readFileSync(srcPath, 'utf8');

var declIdx = src.indexOf(FN_DECL);
if (declIdx === -1) {
    console.error('FATAL: could not locate "' + FN_DECL + '" in ' + srcPath);
    process.exit(2);
}
var open = src.indexOf('{', declIdx);
var depth = 0;
var end = open;
for (; end < src.length; end++) {
    if (src[end] === '{') { depth++; }
    else if (src[end] === '}') { depth--; if (depth === 0) { break; } }
}

var findWhoIsControlling;
/* eslint-disable no-eval -- deliberate: binds the extracted function to the
   stubbed globals in this module's scope. */
eval('findWhoIsControlling = function(character)' + src.slice(open, end + 1));
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
        '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)
    );
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

var GM_ID = 'gm123';        // online GM (game owner)
var PLAYER_A = 'plyA';      // online player
var PLAYER_B = 'plyB';      // offline player
var OFFLINE_GM = 'gmOff';   // offline co-GM
var STALE = 'ghost99';      // ID with no player object (left the game)

addPlayer(GM_ID, true, true, 'TheGM');
addPlayer(PLAYER_A, true, false, 'Alice');
addPlayer(PLAYER_B, false, false, 'Bob');
addPlayer(OFFLINE_GM, false, true, 'CoGM');

/* ------------------------------------------------------------------ */
/* Cases                                                              */
/* ------------------------------------------------------------------ */

// Co-listed GM scenarios (GM + player on the same character)
expect('GM + online player -> player',
    findWhoIsControlling(mkCharacter(GM_ID + ',' + PLAYER_A)), PLAYER_A);
expect('GM + offline player -> online GM takes over',
    findWhoIsControlling(mkCharacter(GM_ID + ',' + PLAYER_B)), GM_ID);
expect('offline GM + offline player -> offline player (archive whisper)',
    findWhoIsControlling(mkCharacter(OFFLINE_GM + ',' + PLAYER_B)), PLAYER_B);
expect('list order does not matter (offline player listed first)',
    findWhoIsControlling(mkCharacter(PLAYER_B + ',' + GM_ID)), GM_ID);

// Single-controller and NPC scenarios
expect('single online player',
    findWhoIsControlling(mkCharacter(PLAYER_A)), PLAYER_A);
expect('single offline player still chosen (no GM listed)',
    findWhoIsControlling(mkCharacter(PLAYER_B)), PLAYER_B);
expect('empty controlledby (typical NPC) -> online GM',
    findWhoIsControlling(mkCharacter('')), GM_ID);
expect('"all" is not a player ID -> online GM',
    findWhoIsControlling(mkCharacter('all')), GM_ID);

// Robustness
expect('stale controller ID filtered out -> online GM',
    findWhoIsControlling(mkCharacter(STALE)), GM_ID);
expect('stale ID alongside valid player -> player',
    findWhoIsControlling(mkCharacter(STALE + ',' + PLAYER_A)), PLAYER_A);
expect('undefined character -> online GM',
    findWhoIsControlling(undefined), GM_ID);

// No GM online at all: any GM is acceptable
pool[GM_ID].online = false;
var noOnlineGMResult = findWhoIsControlling(mkCharacter(''));
expect('no online GM -> some GM (online or not)',
    playerIsGM(noOnlineGMResult), true);
pool[GM_ID].online = true;

// Contract: return type is always a string player ID
expect('returns a string player ID, never an object',
    typeof findWhoIsControlling(mkCharacter('')), 'string');

/* ------------------------------------------------------------------ */

if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
}
console.log('\nAll tests passed.');
