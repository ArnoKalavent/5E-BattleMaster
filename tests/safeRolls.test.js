'use strict';
var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var src = fs.readFileSync(path.join(__dirname, '..', '5ebattlemaster.js'), 'utf8');
function extract(decl) {
    var start = src.indexOf(decl);
    if (start < 0) { throw new Error('Missing declaration: ' + decl); }
    var open = src.indexOf('{', start + decl.length - 1), depth = 0;
    for (var end = open; end < src.length; end++) {
        if (src[end] === '{') { depth++; }
        if (src[end] === '}' && --depth === 0) { return src.slice(open, end + 1); }
    }
    throw new Error('Unclosed function: ' + decl);
}
var failures = 0;
function expect(name, got, want) {
    var pass = JSON.stringify(got) === JSON.stringify(want);
    if (!pass) { failures++; }
    console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
}
var logs, chats, damage, bIsWaitingOnRoll, bIsWaitingOnResponse = false;
var currentPlayerDisplayName, listPlayerIDsWaitingOnRollFrom, listRollCallbackFunctions;
var listTokensWaitingOnSavingThrowsFrom, currentlyCastingSpellRoll;
var state = { sCharacterSheetType: 'OGL' };
var graphic = { get: function(k) { return k === 'name' ? 'Goblin' : 'character'; } };
var target = { ac: 12, name: 'Goblin', token: graphic, associatedCharacter: {}, get: graphic.get };
function log(s) { logs.push(s); }
function sendChat(who, s) { chats.push(s); }
function applyDamage() { damage.push(Array.prototype.slice.call(arguments)); }
function spawnFx() {}
function getObj() { return { get: function() { return 'Defender'; } }; }
function getAttrByName() { return 12; }
function Campaign() { return graphic; }
function findWhoIsControlling() { return 'defender'; }
function universalizeString(s) { return s.toLowerCase().replace(/ /g, ''); }
// Isolate interception from the deliberately unchanged parser.
function rollData(msg) { Object.assign(this, msg.parsed); }
var safeRollTotal, reportMissingRoll, WeaponAttackRollCallback, DirectSpellRollCallback;
var SavingThrowAgainstDamageRollCallback, HandleInput;
eval('safeRollTotal = function(entry)' + extract('function safeRollTotal(entry){'));
eval('reportMissingRoll = function(problem)' + extract('function reportMissingRoll(problem){'));
eval('WeaponAttackRollCallback = function(rollData)' + extract('WeaponAttackRollCallback = function(rollData){'));
eval('DirectSpellRollCallback = function(rollData)' + extract('DirectSpellRollCallback = function(rollData){'));
eval('SavingThrowAgainstDamageRollCallback = function(rollData)' + extract('SavingThrowAgainstDamageRollCallback = function(rollData){'));
eval('HandleInput = function(msg_orig)' + extract('HandleInput = function(msg_orig){'));
function roll(n) { return { results: { total: n } }; }
function valid() { return { d20Rolls: [roll(18)], dmgRolls: [roll(8)], dmgTypes: ['fire'], dc: roll(14), saveEffects: 'half damage', saveType: 'dexterity', playerid: 'defender' }; }
function reset(callback) {
    logs = []; chats = []; damage = [];
    bIsWaitingOnRoll = true; currentPlayerDisplayName = 'Caster';
    listPlayerIDsWaitingOnRollFrom = ['defender']; listRollCallbackFunctions = [callback];
    listTokensWaitingOnSavingThrowsFrom = [target]; currentlyCastingSpellRoll = valid();
    state.sCharacterSheetType = 'OGL';
}
function invoke(name, fn, data) {
    var error, result;
    try { result = fn(data); } catch (e) { error = e.message; }
    expect(name + ' does not throw', error, undefined);
    return result;
}
function missing(name, fn, data, text) {
    var pendingTargets = listTokensWaitingOnSavingThrowsFrom.slice();
    expect(name + ' rejects roll', invoke(name, fn, data), false);
    expect(name + ' preserves targets', listTokensWaitingOnSavingThrowsFrom, pendingTargets);
    expect(name + ' no damage', damage.length, 0);
    expect(name + ' logs specific problem', logs.some(function(s) { return s.indexOf(text) >= 0; }), true);
    expect(name + ' whispers problem', chats.some(function(s) { return s.indexOf('/w "Caster" ') === 0 && s.indexOf(text) >= 0; }), true);
    expect(name + ' preserves wait', bIsWaitingOnRoll, true);
}
// Caster-fault rejections: the recipient cannot fix these by rolling again, so
// the expectation is CONSUMED (returns true) rather than held open. Holding it
// would intercept and reject every subsequent roll that player makes.
function casterFault(name, fn, data, text) {
    var pendingTargets = listTokensWaitingOnSavingThrowsFrom.slice();
    expect(name + ' consumes roll', invoke(name, fn, data), true);
    // The target is consumed along with the expectation - a stale entry would make
    // this player's NEXT valid save resolve against the wrong token.
    expect(name + ' consumes target', listTokensWaitingOnSavingThrowsFrom.length, Math.max(0, pendingTargets.length - 1));
    expect(name + ' no damage', damage.length, 0);
    expect(name + ' logs specific problem', logs.some(function(s) { return s.indexOf(text) >= 0; }), true);
    expect(name + ' whispers problem', chats.some(function(s) { return s.indexOf('/w "Caster" ') === 0 && s.indexOf(text) >= 0; }), true);
    expect(name + ' directs recipient to the caster', chats.some(function(s) { return /caster/i.test(s); }), true);
}
[undefined, null, {}, { results: {} }, roll('8'), roll(NaN), roll(Infinity)].forEach(function(entry, i) {
    expect('malformed entry ' + i, safeRollTotal(entry), undefined);
});
expect('zero total is valid', safeRollTotal(roll(0)), 0);
[WeaponAttackRollCallback, DirectSpellRollCallback].forEach(function(fn, index) {
    var prefix = index ? 'spell' : 'weapon';
    [[undefined], [], [{}], [roll(8), undefined]].forEach(function(rolls, i) {
        reset(fn); var data = valid(); data.dmgRolls = rolls;
        missing(prefix + ' missing damage ' + i, fn, data, 'damage roll was not present');
        expect(prefix + ' reports hit first', chats[0].indexOf('Hit!') >= 0, true);
        expect(prefix + ' actionable setting', chats[1].indexOf('Auto Roll Damage & Crit') >= 0, true);
    });
    [[], [undefined], [{ results: {} }]].forEach(function(rolls, i) {
        reset(fn); var data = valid(); data.d20Rolls = rolls;
        missing(prefix + ' missing to-hit ' + i, fn, data, 'to-hit roll was not present');
        expect(prefix + ' no hit reported', chats.some(function(s) { return s.indexOf('Hit!') >= 0; }), false);
    });
    reset(fn); invoke(prefix + ' valid hit', fn, valid());
    expect(prefix + ' unchanged damage', damage[0], [8, 'fire', index ? target : graphic, index ? getObj() : target.associatedCharacter]);
    reset(fn); var two = valid(); two.dmgRolls.push(roll(3)); two.dmgTypes.push('cold'); fn(two);
    expect(prefix + ' two damage components', damage.map(function(d) { return d.slice(0, 2); }), [[8, 'fire'], [3, 'cold']]);
    reset(fn); two.dmgRolls[1] = roll(0); fn(two); expect(prefix + ' zero secondary skipped', damage.length, 1);
    reset(fn); var miss = valid(); miss.d20Rolls = [roll(2)]; miss.dmgRolls = []; fn(miss);
    expect(prefix + ' miss no damage', damage.length, 0);
    if (!index) { expect('weapon reports miss', chats[0].indexOf('Miss!') >= 0, true); }
});
[[], [undefined], [{}]].forEach(function(rolls, i) {
    reset(); var data = valid(); data.d20Rolls = rolls;
    missing('saving throw missing d20 ' + i, SavingThrowAgainstDamageRollCallback, data, 'saving throw roll was not present');
    expect('failed save callback preserves target', listTokensWaitingOnSavingThrowsFrom, [target]);
    reset(); currentlyCastingSpellRoll.dmgRolls = rolls;
    casterFault('saving throw missing damage ' + i, SavingThrowAgainstDamageRollCallback, valid(), 'damage roll was not present');
    expect('missing spell damage asks caster to recast', chats[0].indexOf('ask the caster to recast the spell with damage included') >= 0, true);
    reset(); data = valid(); data.bRequiresSavingThrow = true; data.dmgRolls = rolls;
    missing('direct save spell missing damage ' + i, DirectSpellRollCallback, data, 'damage roll was not present');
});
[undefined, {}, { results: {} }].forEach(function(dc, i) {
    reset(); currentlyCastingSpellRoll.dc = dc;
    casterFault('OGL missing DC ' + i, SavingThrowAgainstDamageRollCallback, valid(), 'save DC was not present');
    reset(); var data = valid(); data.bRequiresSavingThrow = true; data.dc = dc;
    missing('direct save spell missing DC ' + i, DirectSpellRollCallback, data, 'save DC was not present');
});
reset(); state.sCharacterSheetType = 'Shaped'; currentlyCastingSpellRoll.dc = undefined;
casterFault('Shaped missing DC', SavingThrowAgainstDamageRollCallback, valid(), 'save DC was not present');
['OGL', 'Shaped'].forEach(function(sheet) {
    [5, 18].forEach(function(total) {
        reset(); state.sCharacterSheetType = sheet;
        if (sheet === 'Shaped') { currentlyCastingSpellRoll.dc = 14; }
        var data = valid(); data.d20Rolls = [roll(total)];
        invoke(sheet + ' valid save', SavingThrowAgainstDamageRollCallback, data);
        expect(sheet + ' save damage ' + total, damage[0][0], total === 5 ? 8 : 4);
    });
});
reset(); currentlyCastingSpellRoll = undefined;
casterFault('missing spell context', SavingThrowAgainstDamageRollCallback, valid(), 'spell data was not present');
reset(); listTokensWaitingOnSavingThrowsFrom = [];
casterFault('missing save target', SavingThrowAgainstDamageRollCallback, valid(), 'No target was waiting');
reset(); state.sCharacterSheetType = 'Shaped'; var shapedSpell = valid();
shapedSpell.bRequiresSavingThrow = true; shapedSpell.dc = undefined;
missing('direct Shaped missing DC', DirectSpellRollCallback, shapedSpell, 'save DC was not present');
reset(WeaponAttackRollCallback);
listPlayerIDsWaitingOnRollFrom.push('other'); listRollCallbackFunctions.push(WeaponAttackRollCallback);
var badAttack = valid(); badAttack.dmgRolls = [];
invoke('bad attack with another pending roll', HandleInput, { type: 'general', playerid: 'defender', inlinerolls: [], parsed: badAttack });
expect('other expectation survives bad attack', listPlayerIDsWaitingOnRollFrom, ['defender', 'other']);
expect('other expectation keeps waiting', bIsWaitingOnRoll, true);
reset(); currentPlayerDisplayName = undefined; var absent = valid(); absent.dmgRolls = [];
WeaponAttackRollCallback(absent);
expect('missing display name whispers GM', chats[1].indexOf('/w GM '), 0);
reset(WeaponAttackRollCallback);
var otherCallback = function() { throw new Error('Unexpected dispatch'); };
listPlayerIDsWaitingOnRollFrom.push('other'); listRollCallbackFunctions.push(otherCallback);
var beforeCallbacks = listRollCallbackFunctions.slice();
invoke('unexpected player', HandleInput, { type: 'general', playerid: 'stranger', inlinerolls: [], parsed: valid() });
expect('unexpected player preserves pending IDs', listPlayerIDsWaitingOnRollFrom, ['defender', 'other']);
expect('unexpected player preserves callback count', listRollCallbackFunctions.length, 2);
expect('unexpected player preserves callbacks', listRollCallbackFunctions.every(function(fn, i) { return fn === beforeCallbacks[i]; }), true);
expect('unexpected player still waiting', bIsWaitingOnRoll, true);
reset(WeaponAttackRollCallback); absent = valid(); absent.dmgRolls = [undefined];
invoke('dispatch missing damage', HandleInput, { type: 'general', playerid: 'defender', inlinerolls: [], parsed: absent });
expect('dispatch preserves expected ID', listPlayerIDsWaitingOnRollFrom, ['defender']);
expect('dispatch preserves callback', listRollCallbackFunctions[0] === WeaponAttackRollCallback, true);
expect('dispatch preserves callback count', listRollCallbackFunctions.length, 1);
expect('dispatch keeps waiting', bIsWaitingOnRoll, true);
invoke('dispatch valid attack retry', HandleInput, { type: 'general', playerid: 'defender', inlinerolls: [], parsed: valid() });
expect('attack retry applies damage', damage, [[8, 'fire', graphic, target.associatedCharacter]]);
expect('attack retry consumes ID', listPlayerIDsWaitingOnRollFrom, []);
expect('attack retry consumes callback', listRollCallbackFunctions, []);
expect('attack retry clears wait', bIsWaitingOnRoll, false);
reset(SavingThrowAgainstDamageRollCallback);
var badSave = valid(); badSave.d20Rolls = [undefined];
invoke('dispatch rejected save', HandleInput, { type: 'general', playerid: 'defender', inlinerolls: [], parsed: badSave });
expect('rejected save does no damage', damage, []);
expect('rejected save retains target', listTokensWaitingOnSavingThrowsFrom, [target]);
expect('rejected save retains ID', listPlayerIDsWaitingOnRollFrom, ['defender']);
expect('rejected save retains callback', listRollCallbackFunctions[0] === SavingThrowAgainstDamageRollCallback, true);
expect('rejected save keeps waiting', bIsWaitingOnRoll, true);
invoke('dispatch valid save retry', HandleInput, { type: 'general', playerid: 'defender', inlinerolls: [], parsed: valid() });
expect('save retry damages correct target', damage, [[4, 'fire', graphic, target.associatedCharacter]]);
expect('save retry target identity', damage[0][2] === target.token, true);
expect('save retry character identity', damage[0][3] === target.associatedCharacter, true);
expect('save retry consumes target', listTokensWaitingOnSavingThrowsFrom, []);
expect('save retry consumes ID', listPlayerIDsWaitingOnRollFrom, []);
expect('save retry consumes callback', listRollCallbackFunctions, []);
expect('save retry clears wait', bIsWaitingOnRoll, false);
reset(DirectSpellRollCallback); var spell = valid(); spell.bRequiresSavingThrow = true;
invoke('dispatch save spell', HandleInput, { type: 'general', playerid: 'defender', inlinerolls: [], parsed: spell });
expect('new save expectation retained', listPlayerIDsWaitingOnRollFrom, ['defender']);
expect('only new save callback remains', listRollCallbackFunctions.length, 1);
expect('new save callback retained', listRollCallbackFunctions[0] === SavingThrowAgainstDamageRollCallback, true);
expect('new save keeps waiting', bIsWaitingOnRoll, true);
console.log('\nSafe rolls: ' + failures + ' failure(s)');
process.exitCode = failures ? 1 : 0;
