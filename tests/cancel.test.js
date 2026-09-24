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
var HandleInput, CancelPendingRolls, findCurrentTurnToken, DirectSpellRollCallback, safeRollTotal, reportMissingRoll;
var bIsWaitingOnRoll, selectedTokenCallbackFunction;
var listPlayerIDsWaitingOnRollFrom, listRollCallbackFunctions, listTokensWaitingOnSavingThrowsFrom;
var reticleTokenId, target, currentTurnToken, currentTurnPlayer, currentPlayerDisplayName;
var chats, prompts, graphics, players, turnorder, parsedRolls, callbackCalls, removed;
function log() {}
function sendChat(who, message) { chats.push(message); }
function getObj(type, id) { return (type === 'graphic' ? graphics : players)[id]; }
function playerIsGM(id) { return id === 'gm'; }
function Campaign() { return { get: function() { return turnorder; } }; }
function findWhoIsControlling(character) { return character && character.owner; }
function generateTurnOptions() { return ['Weapon Attack']; }
function generateTurnOptionCommands() { return ['weaponattack']; }
function promptButtonArray(title, options, commands, recipient) { prompts.push([title, options, commands, recipient]); }
// Exercise real dispatch and rejection; parsing itself has its own regression suite.
function rollData(msg) { parsedRolls++; Object.assign(this, msg.parsed); }
eval('HandleInput = function(msg_orig)' + extract('HandleInput = function(msg_orig){'));
eval('CancelPendingRolls = function(msg, cancelAll)' + extract('CancelPendingRolls = function(msg, cancelAll){'));
eval('findCurrentTurnToken = function(turnorder)' + extract('findCurrentTurnToken = function(turnorder) {'));
eval('DirectSpellRollCallback = function(rollData)' + extract('DirectSpellRollCallback = function(rollData){'));
eval('safeRollTotal = function(entry)' + extract('function safeRollTotal(entry){'));
eval('reportMissingRoll = function(problem)' + extract('function reportMissingRoll(problem){'));
function callbackA() { callbackCalls.push('A'); return false; }
function callbackB() { callbackCalls.push('B'); return false; }
function reset() {
    chats = []; prompts = []; callbackCalls = []; parsedRolls = 0; removed = 0;
    players = { A: { id: 'A', get: function() { return 'Alice'; } }, gm: { id: 'gm', get: function() { return 'Game Master'; } } };
    currentTurnPlayer = players.A;
    graphics = { turn: { id: 'turn' } };
    turnorder = JSON.stringify([{ id: 'turn' }]);
    currentTurnToken = { token: graphics.turn }; currentPlayerDisplayName = 'Alice';
    target = { name: 'Keep this creature' };
    listPlayerIDsWaitingOnRollFrom = []; listRollCallbackFunctions = []; listTokensWaitingOnSavingThrowsFrom = [];
    bIsWaitingOnRoll = false;
    selectedTokenCallbackFunction = undefined; reticleTokenId = undefined;
}
function pending() {
    listPlayerIDsWaitingOnRollFrom = ['A', 'B']; listRollCallbackFunctions = [callbackA, callbackB];
    listTokensWaitingOnSavingThrowsFrom = [{ associatedCharacter: { owner: 'A' } }, { associatedCharacter: { owner: 'B' } }];
    bIsWaitingOnRoll = true;
    selectedTokenCallbackFunction = callbackB;
    reticleTokenId = 'reticle'; graphics.reticle = { remove: function() { removed++; delete graphics.reticle; } };
}
function cancel(id, all, who) {
    var error;
    try { HandleInput({ type: 'api', content: '!combat cancel' + (all ? ' all' : ''), playerid: id || 'A', who: who || 'Alice' }); }
    catch (e) { error = e.stack; }
    expect('cancel does not throw: ' + (error || ''), error, undefined);
}
function roll(id) {
    HandleInput({ type: 'general', content: 'Divine Smite', playerid: id, inlinerolls: [],
        parsed: { d20Rolls: [], dmgRolls: [{ results: { total: 8 } }] } });
}
reset();
listPlayerIDsWaitingOnRollFrom = ['A']; listRollCallbackFunctions = [DirectSpellRollCallback]; bIsWaitingOnRoll = true;
roll('A');
expect('live damage-only spell retains expectation', listPlayerIDsWaitingOnRollFrom[0], 'A');
expect('live rejection asks for impossible to-hit', chats[0].includes('to-hit roll was not present'), true);
cancel();
expect('last expectation removed', listPlayerIDsWaitingOnRollFrom.length, 0);
expect('last callback removed', listRollCallbackFunctions.length, 0);
expect('last expectation clears roll wait', bIsWaitingOnRoll, false);
roll('A');
expect('subsequent roll is not intercepted or parsed', parsedRolls, 1);
expect('successful cancellation re-prompts menu', JSON.stringify(prompts), JSON.stringify([['Select an action', ['Weapon Attack'], ['weaponattack'], 'Alice']]));
expect('confirmation whispers caller', chats[1].startsWith('/w "Alice" Cancelled your'), true);

reset(); pending();
players.A = { get: function() { return 'Alice "The Brave"'; } };
cancel();
expect('quoted display name produces well-formed confirmation', chats[0],
    '/w "Alice The Brave" Cancelled your pending rolls (1) and saving-throw targets (1), and cleared the outstanding prompts.');

reset(); pending(); var savedTarget = target, otherSave = listTokensWaitingOnSavingThrowsFrom[1];
cancel();
expect('other player survives', listPlayerIDsWaitingOnRollFrom.join(','), 'B');
expect('other callback survives at matching index', listRollCallbackFunctions[0], callbackB);
expect('only one callback remains', listRollCallbackFunctions.length, 1);
expect('other saving target survives', listTokensWaitingOnSavingThrowsFrom[0], otherSave);
expect('caller saving target removed', listTokensWaitingOnSavingThrowsFrom.length, 1);
expect('other expectation keeps waiting enabled', bIsWaitingOnRoll, true);
roll('A'); roll('B');
expect('only remaining callback fires for its owner', callbackCalls.join(','), 'B');
expect('reticle removed', removed, 1);
expect('reticle ID cleared', reticleTokenId, undefined);
expect('selection callback cleared', selectedTokenCallbackFunction, undefined);
expect('target preserved', target, savedTarget);
expect('turn player cancelling with another expectation pending re-prompts menu', JSON.stringify(prompts),
    JSON.stringify([['Select an action', ['Weapon Attack'], ['weaponattack'], 'Alice']]));

// A is casting while B and C have pending saves; B cancels only their own save.
reset(); pending();
players.B = { id: 'B', get: function() { return 'Bob'; } };
listPlayerIDsWaitingOnRollFrom = ['B', 'C'];
listTokensWaitingOnSavingThrowsFrom = [{ associatedCharacter: { owner: 'B' } }, { associatedCharacter: { owner: 'C' } }];
otherSave = listTokensWaitingOnSavingThrowsFrom[1];
cancel('B', false, 'Bob');
expect('saving player cancellation removes own expectation and preserves C', listPlayerIDsWaitingOnRollFrom.join(','), 'C');
expect('saving player cancellation preserves C callback', listRollCallbackFunctions[0], callbackB);
expect('saving player cancellation removes own callback', listRollCallbackFunctions.length, 1);
expect('saving player cancellation preserves C save', listTokensWaitingOnSavingThrowsFrom[0], otherSave);
expect('saving player cancellation removes own save', listTokensWaitingOnSavingThrowsFrom.length, 1);
expect('saving player cancellation keeps waiting on C', bIsWaitingOnRoll, true);
expect('saving player receives own confirmation', chats[0],
    '/w "Bob" Cancelled your pending rolls (1) and saving-throw targets (1).');
expect('saving player cancellation does not re-prompt casting player', prompts.length, 0);

reset(); pending(); cancel('B');
expect('cancelling second entry preserves first callback', listRollCallbackFunctions[0], callbackA);
expect('cancelling second entry preserves first ID', listPlayerIDsWaitingOnRollFrom.join(','), 'A');
expect('non-turn caller removes own callback', listRollCallbackFunctions.length, 1);
expect('non-turn caller removes own save', listTokensWaitingOnSavingThrowsFrom.length, 1);
expect('non-turn caller preserves turn player save', listTokensWaitingOnSavingThrowsFrom[0].associatedCharacter.owner, 'A');
expect('non-turn caller keeps roll wait for remaining expectation', bIsWaitingOnRoll, true);
expect('non-turn caller confirmation does not claim prompts cleared', chats[0],
    '/w "Alice" Cancelled your pending rolls (1) and saving-throw targets (1).');
expect('non-turn caller preserves reticle', removed, 0);
expect('non-turn caller preserves reticle ID', reticleTokenId, 'reticle');
expect('non-turn caller preserves selection callback', selectedTokenCallbackFunction, callbackB);

reset(); pending();
listPlayerIDsWaitingOnRollFrom = []; listRollCallbackFunctions = []; listTokensWaitingOnSavingThrowsFrom = [];
bIsWaitingOnRoll = false;
var savedReticle = graphics.reticle;
cancel('B', false, 'Bob');
expect('idle other player does not remove reticle', removed, 0);
expect('idle other player preserves reticle graphic', graphics.reticle, savedReticle);
expect('idle other player preserves reticle ID', reticleTokenId, 'reticle');
expect('idle other player preserves selection callback', selectedTokenCallbackFunction, callbackB);
expect('idle other player has nothing to cancel', chats[0], '/w "Bob" There was nothing to cancel.');
expect('idle other player does not re-prompt', prompts.length, 0);
cancel('A');
expect('aiming turn player has no roll expectation', listPlayerIDsWaitingOnRollFrom.length, 0);
expect('aiming turn player removes reticle', removed, 1);
expect('aiming turn player removes graphic', graphics.reticle, undefined);
expect('aiming turn player clears reticle ID', reticleTokenId, undefined);
expect('aiming turn player clears selection callback', selectedTokenCallbackFunction, undefined);
expect('aiming turn player confirms prompts cleared', chats[1].includes('cleared the outstanding prompts'), true);
expect('aiming turn player re-prompts', prompts.length, 1);

reset(); pending(); currentTurnPlayer = undefined; currentTurnToken = undefined; turnorder = '';
cancel('A');
expect('no current player still cancels own expectation', listPlayerIDsWaitingOnRollFrom.join(','), 'B');
expect('no current player preserves shared reticle', removed, 0);
expect('no current player preserves reticle ID', reticleTokenId, 'reticle');
expect('no current player preserves selection callback', selectedTokenCallbackFunction, callbackB);
expect('no current player confirmation omits prompts', chats[0].includes('cleared'), false);
expect('no current player does not re-prompt', prompts.length, 0);
reset(); cancel();
expect('nothing pending whispers', chats[0].includes('nothing to cancel'), true);
expect('nothing pending does not re-prompt', prompts.length, 0);

reset(); pending(); savedTarget = target; cancel('gm', true, 'Character Without Suffix');
expect('GM clears all IDs', listPlayerIDsWaitingOnRollFrom.length, 0);
expect('GM clears all callbacks', listRollCallbackFunctions.length, 0);
expect('GM clears all saves', listTokensWaitingOnSavingThrowsFrom.length, 0);
expect('GM clears roll flag', bIsWaitingOnRoll, false);
expect('GM clears selection callback', selectedTokenCallbackFunction, undefined);
expect('GM removes reticle', removed, 1);
expect('GM clears reticle ID', reticleTokenId, undefined);
expect('GM preserves target', target, savedTarget);
expect('GM re-prompts menu', prompts.length, 1);
expect('GM cancel all re-prompts current turn player menu', JSON.stringify(prompts),
    JSON.stringify([['Select an action', ['Weapon Attack'], ['weaponattack'], 'Alice']]));
expect('GM receives confirmation', chats[0].startsWith('/w "Game Master" Cancelled everyone'), true);
reset(); pending(); savedTarget = target; otherSave = listTokensWaitingOnSavingThrowsFrom.slice();
cancel('A', true, 'Fake (GM)');
expect('non-GM refused despite suffix', chats[0].includes('Only a GM'), true);
expect('refusal preserves IDs', listPlayerIDsWaitingOnRollFrom.join(','), 'A,B');
expect('refusal preserves first callback', listRollCallbackFunctions[0], callbackA);
expect('refusal preserves second callback', listRollCallbackFunctions[1], callbackB);
expect('refusal preserves saves', listTokensWaitingOnSavingThrowsFrom.every(function(t, i) { return t === otherSave[i]; }), true);
expect('refusal preserves roll flag', bIsWaitingOnRoll, true);
expect('refusal preserves selection callback', selectedTokenCallbackFunction, callbackB);
expect('refusal preserves reticle ID', reticleTokenId, 'reticle');
expect('refusal preserves graphic', removed, 0);
expect('refusal preserves target', target, savedTarget);
expect('refusal does not prompt', prompts.length, 0);

['empty', 'deleted', 'custom', 'no wrapper', 'missing player and reticle'].forEach(function(mode) {
    reset(); pending();
    if (mode === 'empty') { turnorder = ''; }
    if (mode === 'deleted') { delete graphics.turn; }
    if (mode === 'custom') { turnorder = '[{"id":"-1"}]'; }
    if (mode === 'no wrapper') { currentTurnToken = undefined; }
    if (mode === 'missing player and reticle') { delete players.A; delete graphics.reticle; }
    cancel();
    expect(mode + ' still clears caller expectation', listPlayerIDsWaitingOnRollFrom.join(','), 'B');
    expect(mode + ' menu guard', prompts.length, mode === 'missing player and reticle' ? 1 : 0);
});
reset(); reticleTokenId = 'already deleted'; cancel();
expect('prompt-only cancellation re-prompts', prompts.length, 1);
cancel(); expect('repeat cancellation does not re-prompt', prompts.length, 1);
if (failures) { process.exit(1); }
