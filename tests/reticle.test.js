/*
 * Unit tests for ConfigureReticle and the guarded promptTarget
 * (5ebattlemaster.js)
 *
 * The live-test bug: the reticle imgsrc was hard-coded to another account's
 * library, createObj rejected it and returned undefined, and promptTarget
 * dereferenced .id on it - crashing the entire API sandbox. These tests pin
 * the guards: promptTarget must NEVER throw, must return false with an
 * instructive whisper on any failure, and must only report success when a
 * reticle actually exists.
 *
 * Run with:  npm test   (or: node tests/reticle.test.js)
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
/* Stubs                                                              */
/* ------------------------------------------------------------------ */

var logs = [];
function log(m) { logs.push(String(m)); }
var chats = [];
function sendChat(who, what) { chats.push(what); }

var state = {};
var reticleTokenId;
var pings = [];
function sendPing(l, t, page, player, moveAll) {
    pings.push({ left: l, top: t, page: page, player: player, moveAll: moveAll });
}
var prompts = [];
function promptButtonArray(title) { prompts.push(title); }
function distanceToPixels(feet) { return (feet / 5) * 70; }
function Campaign() {
    return { get: function (k) { if (k === 'playerpageid') { return 'page1'; } } };
}
var currentPlayerDisplayName = 'Alice';
var currentTurnPlayer = { id: 'plyA' };
var currentTurnToken = {
    token: { get: function (k) { return k === 'left' ? 350 : 350; } }
};

// createObj double: behavior switched per test
var createObjBehavior = 'succeed';
var lastCreateArgs = null;
function createObj(type, args) {
    lastCreateArgs = args;
    if (createObjBehavior === 'reject') { return undefined; } // Roll20's bad-imgsrc behavior
    return { id: 'reticle1' };
}

// getObj double for the selected-token path
var pageTokens = {};
function getObj(type, id) {
    if (type !== 'graphic') { return undefined; }
    return pageTokens[id];
}

/* ------------------------------------------------------------------ */
/* Extract units under test                                            */
/* ------------------------------------------------------------------ */

var promptTarget, ConfigureReticle;
/* eslint-disable no-eval */
eval('promptTarget = function()' + extract('promptTarget = function(){'));
eval('ConfigureReticle = function(msg, urlArg)' + extract('ConfigureReticle = function(msg, urlArg){'));
/* eslint-enable no-eval */

/* ------------------------------------------------------------------ */
/* promptTarget guards                                                 */
/* ------------------------------------------------------------------ */

// Unconfigured: no crash, false, instructive whispers, no createObj attempt
state = {};
chats = [];
lastCreateArgs = null;
var result;
var threw = false;
try { result = promptTarget(); } catch (e) { threw = true; }
expect('unconfigured: does not throw', threw, false);
expect('unconfigured: returns false', result, false);
expect('unconfigured: never calls createObj', lastCreateArgs, null);
expect('unconfigured: tells the GM how to fix it',
    chats.some(function (c) { return c.indexOf('/w GM') === 0 && /reticleconfig/.test(c); }), true);

// Configured but Roll20 rejects the image: THE sandbox-crash scenario
state = { BattleMaster: { reticleImgSrc: 'https://files.d20.io/images/1/x/thumb.png?123' } };
createObjBehavior = 'reject';
chats = [];
threw = false;
try { result = promptTarget(); } catch (e) { threw = true; }
expect('rejected imgsrc: does not throw (the original crash)', threw, false);
expect('rejected imgsrc: returns false', result, false);
expect('rejected imgsrc: GM told the image was rejected',
    chats.some(function (c) { return c.indexOf('/w GM') === 0 && /rejected/i.test(c); }), true);

// Success path
createObjBehavior = 'succeed';
chats = [];
prompts = [];
pings = [];
result = promptTarget();
expect('success: returns true', result, true);
expect('success: reticle id recorded', reticleTokenId, 'reticle1');
expect('success: uses the CONFIGURED imgsrc',
    lastCreateArgs.imgsrc, 'https://files.d20.io/images/1/x/thumb.png?123');
expect('success: player gets the move-the-target prompt',
    prompts.length, 1);
expect('success: ping carries page id and moveAll (current API signature)',
    pings[0].page === 'page1' && pings[0].moveAll === true && pings[0].player === null, true);

/* ------------------------------------------------------------------ */
/* ConfigureReticle                                                    */
/* ------------------------------------------------------------------ */

// Selected-token path with size normalization
pageTokens.tokX = {
    get: function (k) {
        if (k === 'imgsrc') { return 'https://files.d20.io/images/9/abc/med.png?555'; }
    }
};
state = {};
chats = [];
ConfigureReticle({ selected: [{ _id: 'tokX' }] }, undefined);
expect('selected token: saved and normalized med -> thumb',
    state.BattleMaster.reticleImgSrc, 'https://files.d20.io/images/9/abc/thumb.png?555');
expect('selected token: GM confirmation without warning',
    chats.some(function (c) { return /saved!/.test(c); }), true);

// URL argument path
state = {};
ConfigureReticle({ selected: undefined }, 'https://files.d20.io/images/7/z/original.jpg?42');
expect('url arg: saved and normalized original -> thumb',
    state.BattleMaster.reticleImgSrc, 'https://files.d20.io/images/7/z/thumb.jpg?42');

// Suspicious URL still saves, but warns
state = {};
chats = [];
ConfigureReticle({ selected: undefined }, 'https://example.com/notathumb.svg');
expect('odd url: saved anyway (GM may know better)',
    state.BattleMaster.reticleImgSrc, 'https://example.com/notathumb.svg');
expect('odd url: warning issued',
    chats.some(function (c) { return /WARNING/.test(c); }), true);

// Nothing provided: instructions, nothing saved
state = {};
chats = [];
ConfigureReticle({ selected: [] }, undefined);
expect('nothing provided: instructions whispered',
    chats.some(function (c) { return /upload an image/i.test(c); }), true);
expect('nothing provided: nothing saved',
    state.BattleMaster === undefined || state.BattleMaster.reticleImgSrc === undefined, true);

// Selected token that no longer exists falls through to instructions
state = {};
chats = [];
ConfigureReticle({ selected: [{ _id: 'gone' }] }, undefined);
expect('stale selection: instructions whispered, nothing saved',
    chats.some(function (c) { return /upload an image/i.test(c); }) &&
    (state.BattleMaster === undefined || state.BattleMaster.reticleImgSrc === undefined), true);

/* ------------------------------------------------------------------ */

if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
}
console.log('\nAll tests passed.');
