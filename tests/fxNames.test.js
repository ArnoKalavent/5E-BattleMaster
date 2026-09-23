'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var src = fs.readFileSync(path.join(__dirname, '..', '5ebattlemaster.js'), 'utf8');
var failures = 0;
function expect(name, got, want) {
    var pass = JSON.stringify(got) === JSON.stringify(want);
    if (!pass) { failures++; }
    console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
}
function extract(decl) {
    var start = src.indexOf(decl);
    if (start < 0) { throw new Error('Missing declaration: ' + decl); }
    var open = src.indexOf('{', start + decl.length - 1), depth = 0;
    for (var end = open; end < src.length; end++) {
        if (src[end] === '{') { depth++; }
        if (src[end] === '}' && --depth === 0) { return src.slice(start, end + 1); }
    }
    throw new Error('Unclosed function: ' + decl);
}
var effects = [];
var context = {
    _: require('underscore'),
    log: function() {},
    currentTurnToken: { token: { get: function() { return 70; } } },
    currentPlayerDisplayName: 'Caster',
    direction: 'up',
    promptButtonArray: function() {},
    spawnFx: function(x, y, name) { effects.push(name); },
    spawnFxBetweenPoints: function(start, end, name) { effects.push(name); },
    createLocFromToken: function() { return { x: 70, y: 70, z: 0 }; },
    location: function(x, y, z) { this.x = x; this.y = y; this.z = z; },
    findAllTokensInSphere: function() { return []; },
    findAllTokensInCone: function() { return []; },
    findAllTokensInLine: function() { return []; },
    spellEffects: function() {}
};
vm.createContext(context);
[
    'universalizeString = function(string){',
    'dmgTypeToFXName = function(dmgType){',
    'AOESpellRollCallback = function(rollData){',
    'coneDirectionPromptCallback = function(){',
    'lineDirectionPromptCallback = function(){'
].forEach(function(decl) { vm.runInContext(extract(decl), context); });
function safely(name, fn) {
    var result, error;
    try { result = fn(); } catch (e) { error = e.message; }
    expect(name + ' does not throw', error, undefined);
    return result;
}
[undefined, null, 42, false, {}, [], function() {}].forEach(function(value, index) {
    expect('non-string normalization ' + index, safely('normalize ' + index, function() {
        return context.universalizeString(value);
    }), '');
});
var mappings = {
    fire: 'fire', necrotic: 'death', radiant: 'holy', force: 'magic', cold: 'frost',
    acid: 'slime', psychic: 'magic', lightning: 'smoke', poison: 'slime', thunder: 'smoke'
};
Object.keys(mappings).forEach(function(type) {
    expect(type + ' mapping unchanged', context.dmgTypeToFXName(type), mappings[type]);
});
var fallbackInputs = [undefined, null, 'bludgeoning', 'piercing', 'slashing', '', 'unknown', 'undefined', 42, false, {}, []];
fallbackInputs.forEach(function(value, index) {
    var name = safely('FX fallback ' + index, function() { return context.dmgTypeToFXName(value); });
    expect('FX fallback ' + index, name, 'magic');
    expect('FX fallback is usable ' + index, typeof name === 'string' && name.length > 0 && name.indexOf('undefined') === -1, true);
});
['\nFire\n', '\tFire\t', ' \n\tFire\t\n ', 'F\ti\nr e'].forEach(function(value) {
    expect('whitespace normalization ' + JSON.stringify(value), context.universalizeString(value), 'fire');
    expect('whitespace FX ' + JSON.stringify(value), context.dmgTypeToFXName(value), context.dmgTypeToFXName('Fire'));
});
expect('resistance space stripping unchanged', context.universalizeString('cold iron'), 'coldiron');
expect('resistance repeated spaces and case unchanged', context.universalizeString(' Cold  Iron '), 'coldiron');
expect('internal resistance whitespace stripped', context.universalizeString('cold\t\niron'), 'coldiron');
expect('whitespace-only input', context.universalizeString(' \t\n '), '');
// Exercise all three shipping FX call sites with the real lookup and normalizer.
['sphere', 'cone', 'line'].forEach(function(shape, shapeIndex) {
    [[], ['unknown'], ['slashing'], ['\nFire\n']].forEach(function(types, caseIndex) {
        effects.length = 0;
        safely(shape + ' callback ' + caseIndex, function() {
            context.AOESpellRollCallback({ rangeString: 'self ' + shape + ' 15', dmgTypes: types, dmgRolls: [] });
            if (shape !== 'sphere') { context.responseCallbackFunction(); }
        });
        var prefix = ['burst-', 'breath-', 'beam-'][shapeIndex];
        expect(shape + ' usable FX ' + caseIndex, effects, [prefix + (caseIndex === 3 ? 'fire' : 'magic')]);
        expect(shape + ' no undefined FX ' + caseIndex, effects.every(function(name) {
            return name.indexOf('undefined') === -1;
        }), true);
    });
});
console.log('\n' + (failures ? failures + ' failure(s)' : 'All FX name tests passed.'));
process.exitCode = failures ? 1 : 0;
