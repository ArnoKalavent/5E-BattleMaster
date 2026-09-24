'use strict';
var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var src = fs.readFileSync(path.join(__dirname, '..', '5ebattlemaster.js'), 'utf8');
var failures = 0;
function expect(name, got, want) {
    var pass = JSON.stringify(got) === JSON.stringify(want);
    if (!pass) { failures++; }
    console.log((pass ? 'PASS' : 'FAIL') + '  ' + name +
        '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
}
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

['Deathmarkers', 'bDeathMarkersPlusInstalled', 'DMPConfig', 'DeathMarkersPlus'].forEach(function(name) {
    expect('shipping source has zero occurrences of ' + name,
        (src.match(new RegExp(name, 'gi')) || []).length, 0);
});

var attributes = {};
function log() {}
function getAttrByName(id, name) { return attributes[name]; }
var applyDamage, universalizeString, HandleInput;
eval('applyDamage = function(dmgAmt, dmgType, targetToken, targetCharacter)' +
    extract('applyDamage = function(dmgAmt, dmgType, targetToken, targetCharacter){'));
eval('universalizeString = function(string)' + extract('universalizeString = function(string){'));
eval('HandleInput = function(msg_orig)' + extract('HandleInput = function(msg_orig){'));

function makeToken(tempHP) {
    var values = { name: 'Target', bar2_value: tempHP, bar3_value: 30 };
    return {
        writes: [],
        get: function(key) { return values[key]; },
        set: function(key, value) {
            values[key] = value;
            this.writes.push([key, value]);
        }
    };
}
var character = { id: 'target-character', get: function() { return 'Target'; } };
[
    { name: 'plain hit', temp: undefined, resistance: '', hp: 20, writes: [['bar3_value', 20]] },
    { name: 'resisted hit', temp: undefined, resistance: 'fire', hp: 25, writes: [['bar3_value', 25]] },
    { name: 'plain hit with temp HP', temp: 3, resistance: '', hp: 23,
        writes: [['bar2_value', 0], ['bar3_value', 23]] },
    { name: 'resisted hit with temp HP', temp: 3, resistance: 'fire', hp: 28,
        writes: [['bar2_value', 0], ['bar3_value', 28]] }
].forEach(function(test) {
    attributes = { npc_resistances: test.resistance };
    var token = makeToken(test.temp);
    expect(test.name + ' returns normally', applyDamage(10, 'fire', token, character), undefined);
    expect(test.name + ' updates HP', token.get('bar3_value'), test.hp);
    expect(test.name + ' preserves bar write order and values', token.writes, test.writes);
    expect(test.name + ' updates temp HP', token.get('bar2_value'), test.temp === undefined ? undefined : 0);
});

if (failures) { process.exit(1); }
console.log('\nAll tests passed.');
