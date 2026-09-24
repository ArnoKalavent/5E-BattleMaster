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
    var pass = got === want;
    if (!pass) { failures++; }
    console.log((pass ? 'PASS' : 'FAIL') + '  ' + name);
}
var HandleInput, reportRefusedCommand, invokePendingCallback;
var bInCombat, bIsWaitingOnRoll, currentTurnPlayer, currentTurnToken;
var selectedTokenCallbackFunction, target, listSelectableGraphics;
var chats, calls, state = {}, callerName;
function log() {}
function sendChat(who, message) { chats.push(message); }
function getObj() { return callerName ? { get: function() { return callerName; } } : undefined; }
function promptTarget() { calls.push('promptTarget'); return true; }
function WeaponAttack() {}
function DirectSpellAttack() {}
function findTokenAtTarget() { calls.push('findTokenAtTarget'); }
function StageInitiative() { calls.push('stage'); }
function BeginCombat(label) { calls.push('begin ' + label); }
function EndCombat() { calls.push('end'); }
function CancelPendingRolls(msg, all) { calls.push('cancel ' + all); }
function ConfigureReticle() { calls.push('reticle'); }
function promptButtonArray() { calls.push('config'); }
eval('HandleInput = function(msg_orig)' + extract('HandleInput = function(msg_orig){'));
eval('reportRefusedCommand = function(msg, problem)' + extract('function reportRefusedCommand(msg, problem){'));
eval('invokePendingCallback = function(msg, callback, beforeInvoke)' + extract('function invokePendingCallback(msg, callback, beforeInvoke){'));
function reset() {
    bInCombat = true; bIsWaitingOnRoll = false;
    currentTurnPlayer = { id: 'turn-player' }; currentTurnToken = { token: {} };
    selectedTokenCallbackFunction = undefined;
    target = 'unchanged'; listSelectableGraphics = ['chosen'];
    chats = []; calls = []; callerName = 'Alice';
}
function command(action, who) {
    var error;
    try { HandleInput({ type: 'api', content: '!combat ' + action, playerid: 'caller', who: who }); }
    catch (e) { error = e.stack; }
    expect(action + ' does not throw: ' + (error || ''), error, undefined);
}
function refused(action, reason) {
    command(action);
    expect(action + ' whispers caller and reason', chats[0], '/w "Alice" ' + reason);
    expect(action + ' performs no work', calls.length, 0);
    expect(action + ' preserves target', target, 'unchanged');
}
var nothing = 'There is nothing pending for that command.';
var noCombat = 'Combat is not running with a current turn.';
var directions = ['up', 'down', 'left', 'right', 'upright', 'downleft', 'upleft', 'downright'];
var unknown = 'Unknown command. Available: !combat begin, !combat end, !combat cancel, !combat set reticle, !combat config.';
['aoespell', 'move'].concat(directions).forEach(function(action) {
    [true, false].forEach(function(inCombat) {
        reset(); bInCombat = inCombat;
        command(action);
        expect(action + ' sends exactly one whisper', chats.length, 1);
        expect(action + ' whispers Unknown command to caller', chats[0], '/w "Alice" ' + unknown);
    });
});
[undefined, null, 42].forEach(function(callback) {
    reset(); selectedTokenCallbackFunction = callback; refused('selectedTarget', nothing);
});
var actions = ['weaponattack', 'directspell', 'selectedTarget', 'tokenfromlist 0'];
actions.forEach(function(action) {
    ['outside combat', 'missing player', 'missing wrapper', 'missing token'].forEach(function(mode) {
        reset();
        selectedTokenCallbackFunction = function() { calls.push('callback'); };
        if(mode === 'outside combat') { bInCombat = false; currentTurnPlayer = currentTurnToken = undefined; }
        if(mode === 'missing player') { currentTurnPlayer = undefined; }
        if(mode === 'missing wrapper') { currentTurnToken = undefined; }
        if(mode === 'missing token') { currentTurnToken = {}; }
        refused(action, noCombat);
    });
    reset(); bInCombat = false; refused(action, noCombat);
});
reset(); selectedTokenCallbackFunction = function() { calls.push('selected'); };
command('selectedTarget'); expect('selection looks up target then invokes callback', calls.join(','), 'findTokenAtTarget,selected');
['weaponattack', 'directspell'].forEach(function(action) {
    reset(); command(action);
    expect(action + ' reaches promptTarget', calls.join(','), 'promptTarget');
    expect(action + ' arms callback', selectedTokenCallbackFunction, action === 'weaponattack' ? WeaponAttack : DirectSpellAttack);
});
reset(); command('tokenfromlist 0'); expect('live list selection', target, 'chosen');
reset(); callerName = undefined; command('selectedTarget'); expect('missing name whispers GM', chats[0], '/w GM ' + nothing);
reset(); callerName = undefined; command('selectedTarget', 'Bob'); expect('message name fallback', chats[0], '/w "Bob" ' + nothing);
reset(); callerName = 'Alice "Brave"'; command('selectedTarget'); expect('quotes sanitized', chats[0], '/w "Alice Brave" ' + nothing);
[
    ['roll', 'stage'], ['start', 'stage'], ['begin round 1', 'begin round 1'],
    ['end', 'end'], ['stop', 'end'], ['cancel', 'cancel false'], ['cancel all', 'cancel true'],
    ['set reticle URL', 'reticle'], ['reticleconfig URL', 'reticle'],
    ['config', 'config'], ['DMPConfig', ''], ['SheetConfig', 'config']
].forEach(function(pair) {
    reset(); bInCombat = false; currentTurnPlayer = currentTurnToken = undefined;
    command(pair[0], 'Alice');
    expect(pair[0] + ' dispatches outside combat', calls.join(','), pair[1]);
    if (pair[0] === 'DMPConfig') {
        expect('unknown DMPConfig whispers caller', chats[0], '/w "Alice" ' + unknown);
    } else {
        expect(pair[0] + ' not refused', chats.length, 0);
    }
});
if (failures) { process.exit(1); }
