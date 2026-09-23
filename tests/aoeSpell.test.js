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
var logs, chats, prompts, effects, affected, sphereCalls;
var currentPlayerDisplayName, currentlyCastingSpellRoll, bIsWaitingOnResponse, responseCallbackFunction, range;
var currentTurnToken = { token: { get: function(key) { return { left: 70, top: 140 }[key]; } } };
var sphereTargets = [{ id: 'first' }, { id: 'second' }];
function log(s) { logs.push(s); }
function sendChat(who, s) { chats.push([who, s]); }
function promptButtonArray() { prompts.push(Array.prototype.slice.call(arguments)); }
function coneDirectionPromptCallback() {}
function lineDirectionPromptCallback() {}
function dmgTypeToFXName(type) { return type === 'fire' ? 'fire' : 'unexpected'; }
function spawnFx() { effects.push(Array.prototype.slice.call(arguments)); }
function createLocFromToken(token) { return { x: token.get('left'), y: token.get('top'), z: 0 }; }
function findAllTokensInSphere(origin, radius) { sphereCalls.push([origin, radius]); return sphereTargets; }
function spellEffects(token) { affected.push(token); }
var reportMissingRoll, AOESpellRollCallback;
eval('reportMissingRoll = function(problem)' + extract('function reportMissingRoll(problem){'));
eval('AOESpellRollCallback = function(rollData)' + extract('AOESpellRollCallback = function(rollData){'));
function reset() {
    logs = []; chats = []; prompts = []; effects = []; affected = []; sphereCalls = [];
    currentPlayerDisplayName = 'Acting Player'; currentlyCastingSpellRoll = undefined;
    bIsWaitingOnResponse = false; responseCallbackFunction = undefined; range = undefined;
}
function invoke(rangeString) {
    var data = { rangeString: rangeString, dmgTypes: ['fire'] }, result, error;
    try { result = AOESpellRollCallback(data); } catch (e) { error = e.message; }
    expect(rangeString + ' does not throw', error, undefined);
    expect(rangeString + ' consumes expectation', result, true);
    expect(rangeString + ' retains spell data', currentlyCastingSpellRoll === data, true);
    expect(rangeString + ' logs parsed range', logs.indexOf('AOE spell range: ' + rangeString) >= 0, true);
}
function unsupported(rangeString, recipient) {
    invoke(rangeString);
    expect(rangeString + ' whispers once', chats.length, 1);
    expect(rangeString + ' uses BattleMaster sender', chats[0] && chats[0][0], 'BattleMaster');
    var message = chats[0] ? chats[0][1] : '';
    expect(rangeString + ' whispers recipient', message.indexOf('/w ' + recipient + ' ') === 0, true);
    expect(rangeString + ' names supported origin and shapes', /self-origin/.test(message) && /cone/.test(message) && /line/.test(message) && /sphere/.test(message), true);
    expect(rangeString + ' no direction prompt or effects', [prompts, effects, affected, bIsWaitingOnResponse, responseCallbackFunction], [[], [], [], false, undefined]);
    return message;
}
reset();
var rangedMessage = unsupported('150 feet', '"Acting Player"');
expect('LIVE CASE reports range actually read', rangedMessage.indexOf('"150 feet"') >= 0, true);
expect('LIVE CASE explains only self-origin supported', /only self-origin AOE spells/.test(rangedMessage), true);
expect('preserves original non-self log', logs.indexOf('Not self targeted!') >= 0, true);
reset();
var emptyMessage = unsupported('', '"Acting Player"');
expect('empty range has distinct wording', emptyMessage !== rangedMessage, true);
expect('empty range explains missing field', /missing or empty in the roll/.test(emptyMessage), true);
['cube', 'cylinder'].forEach(function(shape) {
    reset();
    var message = unsupported('self ' + shape + ' 20', '"Acting Player"');
    expect(shape + ' named as unimplemented', message.indexOf('"' + shape + '" is not implemented yet') >= 0, true);
});
reset();
var unknownShapeMessage = unsupported('self pyramid 20', '"Acting Player"');
expect('unrecognised shape reports full uninterpreted range', unknownShapeMessage.indexOf('The spell range "self pyramid 20" could not be interpreted') >= 0, true);
expect('unrecognised shape explains expected form', unknownShapeMessage.indexOf('expected "self <shape> <size>"') >= 0, true);
expect('unrecognised shape does not claim unimplemented', /not implemented/.test(unknownShapeMessage), false);
reset();
expect('missing shape explained', unsupported('self', '"Acting Player"').indexOf('The spell range "self" could not be interpreted') >= 0, true);
reset();
var sheet2014Message = unsupported('Self (15-foot cone)', '"Acting Player"');
expect('2014 sheet actual range format reports full uninterpreted range', sheet2014Message.indexOf('The spell range "Self (15-foot cone)" could not be interpreted') >= 0, true);
expect('2014 sheet actual range format explains expected form', sheet2014Message.indexOf('expected "self <shape> <size>"') >= 0, true);
expect('2014 sheet actual range format does not claim shape is unimplemented', /not implemented/.test(sheet2014Message), false);
['self cone 15', 'self line 30'].forEach(function(value, index) {
    reset(); invoke(value);
    expect(value + ' arms response', bIsWaitingOnResponse, true);
    expect(value + ' callback', responseCallbackFunction === (index ? lineDirectionPromptCallback : coneDirectionPromptCallback), true);
    expect(value + ' range', range, index ? '30' : '15');
    expect(value + ' direction prompt', prompts, [['Select a direction', ['North', 'South', 'East', 'West', 'Northeast', 'Northwest', 'Southeast', 'Southwest'], ['up', 'down', 'right', 'left', 'upright', 'upleft', 'downright', 'downleft'], 'Acting Player']]);
    expect(value + ' no unsupported whisper or immediate FX', [chats, effects], [[], []]);
});
reset(); invoke('self sphere 20');
expect('sphere FX unchanged', effects, [[70, 140, 'burst-fire']]);
expect('sphere origin and radius unchanged', sphereCalls, [[{ x: 70, y: 140, z: 0 }, '20']]);
expect('sphere applies effects to every found token', affected, sphereTargets);
expect('sphere resolves immediately without unsupported whisper', [prompts, chats, bIsWaitingOnResponse], [[], [], false]);
[undefined, ''].forEach(function(name) {
    ['150 feet', '', 'self cube 20', 'self cylinder 20', 'self pyramid 20'].forEach(function(value) {
        reset(); currentPlayerDisplayName = name; unsupported(value, 'GM');
    });
});
console.log('\n' + (failures ? failures + ' FAILED' : 'All AOE spell tests passed'));
process.exitCode = failures ? 1 : 0;
