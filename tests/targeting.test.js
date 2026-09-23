/* Regression tests for reticle resolution. Run with npm test. */
'use strict';

var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var srcPath = path.join(__dirname, '..', '5ebattlemaster.js');
var src = fs.readFileSync(srcPath, 'utf8');
var decl = 'findTokenAtTarget = function(){';
var start = src.indexOf(decl);
if (start === -1) {
    console.error('FATAL: could not locate "' + decl + '" in ' + srcPath);
    process.exit(2);
}
var open = src.indexOf('{', start + decl.length - 1);
var depth = 0;
var end = open;
for (; end < src.length; end++) {
    if (src[end] === '{') { depth++; }
    else if (src[end] === '}') { depth--; if (depth === 0) { break; } }
}

var failures = 0;
function expect(name, got, want) {
    var pass = got === want;
    if (!pass) { failures++; }
    console.log((pass ? 'PASS' : 'FAIL') + '  ' + name +
        '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
}

var graphics, turnorder, target, listSelectableGraphics, chats, logs, prompts;
var reticleTokenId = 'reticle';
var currentPlayerDisplayName;
function getObj(type, id) { return type === 'graphic' ? graphics[id] : undefined; }
function Campaign() { return { get: function () {
    return Array.isArray(turnorder) ? JSON.stringify(turnorder) : turnorder;
} }; }
function sendChat(who, message) { chats.push(message); }
function log(message) { logs.push(String(message)); }
function promptButtonArray(title, names, commands, player) {
    prompts.push({ title: title, names: names, commands: commands, player: player });
}
function tokenWrapper(token) { this.token = token; }
function addToken(id, left, top) {
    var removed = false;
    var values = { name: id, left: left, top: top, width: 70, height: 70 };
    graphics[id] = {
        id: id,
        get: function (key) {
            if (removed) { throw new Error('Read after removal'); }
            return values[key];
        },
        remove: function () { removed = true; delete graphics[id]; }
    };
    return graphics[id];
}
function reset() {
    graphics = {};
    turnorder = [{ id: 'A' }, { id: 'B' }];
    target = undefined;
    listSelectableGraphics = [];
    chats = []; logs = []; prompts = [];
    currentPlayerDisplayName = 'Alice Example';
    addToken('A', 100, 100);
    addToken('B', 300, 300);
}
function resolve(name) {
    var threw = false;
    try { findTokenAtTarget(); } catch (e) { threw = true; console.error(e); }
    expect(name + ': does not throw', threw, false);
}
var findTokenAtTarget;
// Deliberately bind the shipping function to the Roll20 stubs above.
eval('findTokenAtTarget = function()' + src.slice(open, end + 1));

reset();
addToken('reticle', 100, 100);
resolve('one match');
expect('one match wraps token A', target.token === graphics.A, true);
expect('one match does not prompt', prompts.length, 0);
addToken('reticle', 900, 800);
resolve('empty after previous success');
expect('REPORTED BUG: empty resolution clears previous target', target, undefined);
expect('empty resolution clears previous candidates', listSelectableGraphics.length, 0);
expect('empty whispers acting player and explains turn tracker constraint',
    chats.some(function (c) {
        return c.indexOf('/w "Alice Example" ') === 0 &&
            /Nothing was found under the reticle/.test(c) && /Only combatants in the turn tracker/.test(c);
    }), true);
expect('empty logs tested count and final coordinates', logs.some(function (l) {
    return /tested 2 turn-tracker entries/.test(l) && /reticle coordinates: \(900, 800\)/.test(l);
}), true);

[
    { name: 'cleared tracker', raw: '' },
    { name: 'opened empty tracker', raw: '[]' },
    { name: 'missing tracker', raw: undefined },
    { name: 'unparseable tracker', raw: '{invalid' }
].forEach(function (fixture) {
    reset();
    turnorder = fixture.raw;
    target = new tokenWrapper(graphics.A);
    listSelectableGraphics = [graphics.A];
    addToken('reticle', 100, 100);
    resolve(fixture.name);
    expect(fixture.name + ': clears stale target', target, undefined);
    expect(fixture.name + ': clears candidates', listSelectableGraphics.length, 0);
    expect(fixture.name + ': whispers player', chats[0],
        '/w "Alice Example" Nothing was found under the reticle. Only combatants in the turn tracker can be targeted.');
    expect(fixture.name + ': logs zero tested entries', logs.indexOf(
        'BattleMaster: No target found; tested 0 turn-tracker entries; reticle coordinates: (100, 100).') !== -1, true);
});

reset();
target = new tokenWrapper(graphics.A);
listSelectableGraphics = [graphics.A];
resolve('missing reticle');
expect('missing reticle clears stale target', target, undefined);
expect('missing reticle clears candidates', listSelectableGraphics.length, 0);
expect('missing reticle whispers player with retry instruction', chats.some(function (c) {
    return c.indexOf('/w "Alice Example" ') === 0 && /reticle was lost/.test(c) && /try the action again/.test(c);
}), true);
expect('missing reticle has no empty-resolution diagnostic', logs.length, 0);

reset();
addToken('B', 100, 100);
addToken('reticle', 100, 100);
var previousTarget = target = new tokenWrapper(graphics.A);
resolve('two matches');
expect('two matches preserve target while choosing', target === previousTarget, true);
expect('two matches prompt once', prompts.length, 1);
expect('two matches retain prompt title', prompts[0].title, 'Which token are you targeting?');
expect('two matches offer both tokens', prompts[0].names.join(','), 'A,B');
expect('two matches retain selection commands', prompts[0].commands.join(','), 'tokenfromlist 0,tokenfromlist 1');
expect('two matches do not whisper failure', chats.length, 0);

reset();
addToken('reticle', 100, 100);
resolve('first resolution A');
expect('first resolution selects A', target.token === graphics.A, true);
addToken('reticle', 300, 300);
resolve('second resolution B');
expect('second resolution has only one candidate', listSelectableGraphics.length, 1);
expect('second resolution candidate is B', listSelectableGraphics[0] === graphics.B, true);
expect('second resolution selects B', target.token === graphics.B, true);
expect('successive single matches never prompt', prompts.length, 0);
expect('successful resolutions have no empty diagnostic', logs.some(function (l) {
    return /No target found; tested/.test(l);
}), false);

reset();
turnorder = [{ id: 'deleted' }, { id: '-1' }, { id: 'A' }];
addToken('-1', 100, 100); // Custom entry must be skipped even if lookup could succeed.
addToken('reticle', 100, 100);
resolve('deleted token and custom entry');
expect('skipped entries leave only real token', listSelectableGraphics.length, 1);
expect('real token still selected', target.token === graphics.A, true);
addToken('reticle', 900, 800);
resolve('empty with skipped entries');
expect('diagnostic counts only entries actually tested', logs.some(function (l) {
    return /tested 1 turn-tracker entries/.test(l);
}), true);

[false, true].forEach(function (hasReticle) {
    reset();
    currentPlayerDisplayName = undefined;
    target = new tokenWrapper(graphics.A);
    if (hasReticle) { addToken('reticle', 900, 800); }
    resolve('GM fallback, reticle present=' + hasReticle);
    expect('failure whispers GM without display name', chats[0].indexOf('/w GM '), 0);
    expect('GM fallback also clears target', target, undefined);
});

if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
}
console.log('\nAll targeting tests passed.');
