'use strict';
var fs = require('fs');
var path = require('path');
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
function invoke(name, fn) {
    var result, error;
    try { result = fn(); } catch (e) { error = e.message; }
    expect(name + ' does not throw', error, undefined);
    return result;
}
var logs, chats, page, player, controller, target, attrReads;
var listPlayerIDsWaitingOnRollFrom, listRollCallbackFunctions, listTokensWaitingOnSavingThrowsFrom;
var currentlyCastingSpellRoll, currentPlayerDisplayName = 'Caster';
var state = { sCharacterSheetType: 'OGL' };
function log(s) { logs.push(s); }
function sendChat(who, s) { chats.push(s); }
function getObj(type) { return type === 'page' ? page : player; }
function Campaign() { return { get: function() { return 'page-id'; } }; }
function findWhoIsControlling(character) { return character && controller; }
function getAttrByName(id, key) { attrReads.push([id, key]); return ''; }
function universalizeString(s) { return s.toLowerCase().replace(/ /g, ''); }
var distanceToPixels, DirectSpellRollCallback, spellEffects, applyDamage;
var SavingThrowAgainstDamageRollCallback, safeRollTotal, reportMissingRoll;
eval('distanceToPixels = function(dist)' + extract('distanceToPixels = function(dist) {'));
eval('DirectSpellRollCallback = function(rollData)' + extract('DirectSpellRollCallback = function(rollData){'));
eval('spellEffects = function(token)' + extract('spellEffects = function(token){'));
eval('applyDamage = function(dmgAmt, dmgType, targetToken, targetCharacter)' + extract('applyDamage = function(dmgAmt, dmgType, targetToken, targetCharacter){'));
eval('SavingThrowAgainstDamageRollCallback = function(rollData)' + extract('SavingThrowAgainstDamageRollCallback = function(rollData){'));
eval('safeRollTotal = function(entry)' + extract('function safeRollTotal(entry){'));
eval('reportMissingRoll = function(problem)' + extract('function reportMissingRoll(problem){'));
function roll(n) { return { results: { total: n } }; }
function graphic(tempHP) {
    return {
        values: { name: 'Goblin', bar2_value: tempHP, bar3_value: 20 }, writes: [],
        get: function(key) { return this.values[key]; },
        set: function(key, value) { this.writes.push([key, value]); this.values[key] = value; }
    };
}
function reset() {
    logs = []; chats = []; attrReads = [];
    page = undefined; player = undefined; controller = undefined;
    listPlayerIDsWaitingOnRollFrom = []; listRollCallbackFunctions = []; listTokensWaitingOnSavingThrowsFrom = [];
    state.sCharacterSheetType = 'OGL';
    target = { name: 'Goblin', associatedCharacter: { id: 'character' }, token: graphic(0), get: function() { return 'Goblin'; } };
    currentlyCastingSpellRoll = { bRequiresSavingThrow: true, dmgRolls: [roll(8)], dmgTypes: ['fire'], dc: roll(14), saveType: 'dexterity', saveEffects: 'half damage' };
}
[undefined, 0, -1, '', 'bad', Infinity, NaN, 1e-320].forEach(function(scale, i) {
    reset();
    if (i) { page = { get: function() { return scale; } }; }
    var result = invoke('invalid page/scale ' + i, function() { return distanceToPixels(5); });
    expect('fallback is finite ' + i, Number.isFinite(result), true);
    expect('fallback uses five units ' + i, result, 70);
    expect('fallback is logged ' + i, logs.some(function(s) { return /scale_number/.test(s); }), true);
});
[5, '5', 10].forEach(function(scale) {
    reset(); page = { get: function() { return scale; } };
    expect('normal scale ' + scale, distanceToPixels(5), 70 * (5 / scale));
    expect('normal scale has no warning', logs, []);
});
[DirectSpellRollCallback, spellEffects].forEach(function(fn, i) {
    [false, true].forEach(function(resolvable) {
        reset();
        if (resolvable) { controller = 'defender'; player = { get: function() { return 'Defender'; } }; }
        invoke('saving throw whisper site ' + i + ' player=' + resolvable, function() {
            return fn(i ? target : currentlyCastingSpellRoll);
        });
        expect('whisper recipient and prompt ' + i, chats, ['/w ' + (resolvable ? '"Defender"' : 'GM') + ' Please roll a dexterity saving throw for Goblin']);
        expect('missing controller reported ' + i, logs.some(function(s) { return /No controlling player/.test(s); }), !resolvable);
        expect('target still queued ' + i, listTokensWaitingOnSavingThrowsFrom[0] === target, true);
        expect('callback still queued ' + i, listRollCallbackFunctions[0] === SavingThrowAgainstDamageRollCallback, true);
        expect('controller queue unchanged ' + i, listPlayerIDsWaitingOnRollFrom, [controller]);
    });
});
['OGL', 'Shaped'].forEach(function(sheet) {
    [0, 3, 10, -1].forEach(function(tempHP) {
        reset(); state.sCharacterSheetType = sheet;
        var token = graphic(tempHP);
        var result = invoke(sheet + ' unlinked target temp HP ' + tempHP, function() { return applyDamage(8, 'fire', token, undefined); });
        expect('damage return unchanged', result, undefined);
        var writes = tempHP < 0 ? [['bar3_value', 12]] : tempHP >= 8 ? [['bar2_value', 2]] : [['bar2_value', 0], ['bar3_value', 12 + tempHP]];
        expect('actual damage bar writes', token.writes, writes);
        expect('HP was updated on object', token.get('bar3_value'), tempHP >= 8 ? 20 : tempHP < 0 ? 12 : 12 + tempHP);
        expect('no missing sheet reads', attrReads, []);
        expect('missing character logged', logs.some(function(s) { return /No linked character/.test(s); }), true);
    });
});
expect('applyDamage retains seven returns', (extract('applyDamage = function(dmgAmt, dmgType, targetToken, targetCharacter){').match(/\breturn\b/g) || []).length, 7);
[false, true].forEach(function(hasTarget) {
    reset(); controller = 'defender';
    listTokensWaitingOnSavingThrowsFrom = hasTarget ? [undefined, target] : [undefined];
    var result = invoke('undefined queue entry with target=' + hasTarget, function() {
        return SavingThrowAgainstDamageRollCallback({ playerid: 'defender', d20Rolls: [roll(5)] });
    });
    expect('valid save consumed as before', result, true);
    expect('empty queue entry logged', logs.some(function(s) { return /Empty saving-throw queue entry/.test(s); }), true);
    expect('queue retains only empty entry', listTokensWaitingOnSavingThrowsFrom, [undefined]);
    expect('later valid target receives damage', target.token.writes, hasTarget ? [['bar2_value', 0], ['bar3_value', 12]] : []);
});
console.log('\n' + (failures ? failures + ' FAILED' : 'All unguarded lookup tests passed.'));
process.exitCode = failures ? 1 : 0;
