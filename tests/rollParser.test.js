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
// Expose private functions only in the test VM; run the real module initialization.
var testSrc = src.replace('BuildRev: buildRev,', 'BuildRev: buildRev, rollData: rollData, text: extractTemplateText, index: extractInlineRollIndex, universalizeString: universalizeString,');
function load(state) {
    var context = { state: state, log: function() {}, on: function() {} };
    vm.runInNewContext(testSrc, context);
    return context.BattleMaster;
}
var state = {};
var parser = load(state);
expect('fresh state defaults to OGL', state.sCharacterSheetType, 'OGL');
['Shaped', 'OGL', 'custom'].forEach(function(value) {
    var persisted = { sCharacterSheetType: value };
    load(persisted);
    expect('preserves persisted ' + value, persisted.sCharacterSheetType, value);
});
var inline = [18, 12, 15, 8, 4].map(function(total) { return { results: { total: total } }; });
var content = '&{template:atkdmg} {{r1=$[[0]]}} {{r2=$[[1]]}} {{savedc=$[[2]]}} {{dmg1=$[[3]]}} {{crit1=$[[4]]}} {{dmg1type= Slashing }} {{range=5 ft.}} {{saveattr=Dexterity}} {{savedesc=Half damage on success}}';
function parse(text, data) { return new parser.rollData({ playerid: 'player', content: text, inlinerolls: data }); }
var full = parse(content, inline);
['r1', 'r2', 'savedc', 'dmg1', 'crit1'].forEach(function(field, index) {
    expect(field + ' index', parser.index(content, field), index);
});
expect('full attack rolls and length', full.d20Rolls, inline.slice(0, 2));
expect('full damage rolls and length', full.dmgRolls, [inline[3]]);
expect('normalized damage type', full.dmgTypes, ['slashing']);
expect('save DC references inline entry', full.dc === inline[2], true);
expect('player preserved', full.playerid, 'player');
expect('existing critical array behavior', full.critRolls, []);
var missing = parse(content.replace('{{dmg1=$[[3]]}}', ''), inline);
expect('LIVE BUG: absent damage produces empty array', missing.dmgRolls, []);
expect('LIVE BUG: absent damage produces no damage type', missing.dmgTypes, []);
['abc', '-1', '1.5', '3oops', '', 'Infinity', '9007199254740993', '9'.repeat(400)].forEach(function(value) {
    var malformed = content.replace('{{dmg1=$[[3]]}}', '{{dmg1=$[[' + value + ']]}}');
    expect('reject malformed index ' + value.slice(0, 20), parser.index(malformed, 'dmg1'), undefined);
    expect('malformed damage array ' + value.slice(0, 20), parse(malformed, inline).dmgRolls, []);
});
expect('plain numeric text is not an inline reference', parser.index('{{dmg1=3}}', 'dmg1'), undefined);
expect('absent index is undefined', parser.index(content, 'missing'), undefined);
var unavailable = parse(content.replace('{{dmg1=$[[3]]}}', '{{dmg1=$[[99]]}}'), inline);
expect('out of bounds damage omitted', unavailable.dmgRolls, []);
expect('out of bounds type omitted', unavailable.dmgTypes, []);
var sparse = inline.slice();
delete sparse[0]; delete sparse[3];
expect('sparse attack skips missing entry', parse(content, sparse).d20Rolls, [inline[1]]);
expect('sparse damage skips missing entry', parse(content, sparse).dmgRolls, []);
expect('missing inline data gives empty attack', parse(content).d20Rolls, []);
expect('missing inline data gives empty damage', parse(content).dmgRolls, []);
expect('missing DC stays undefined', parse(content, []).dc, undefined);
var fields = { dmg1type: ' Slashing ', range: '5 ft.', saveattr: 'Dexterity', savedesc: 'Half damage on success' };
Object.keys(fields).forEach(function(field) {
    expect(field + ' text', parser.text(content, field), fields[field]);
    expect(field + ' absent text', parser.text('{{other=value}}', field), undefined);
});
expect('range property', full.rangeString, fields.range);
expect('save type property', full.saveType, fields.saveattr);
expect('save effects property', full.saveEffects, fields.savedesc);
var empty = parse('', inline);
expect('absent range property', empty.rangeString, '');
expect('absent save type property', empty.saveType, '');
expect('absent save effects property', empty.saveEffects, '');
expect('absent save requirement', empty.bRequiresSavingThrow, false);
expect('empty text is present', parser.text('{{range=}}', 'range'), '');
expect('multiline text', parser.text('{{savedesc=first\nsecond}}', 'savedesc'), 'first\nsecond');
var literalName = 'a.*+?^${}()|[]\\';
expect('regex metacharacters treated literally', parser.text('{{' + literalName + '=literal}}', literalName), 'literal');
expect('regex name cannot match another field', parser.text('{{axb=value}}', 'a.b'), undefined);
expect('inline names escaped too', parser.index('{{a.b=$[[2]]}}', 'a.b'), 2);
expect('absent damage type defaults to empty string', parse('{{dmg1=$[[3]]}}', inline).dmgTypes[0], '');
expect('absent damage type retains alignment', parse('{{dmg1=$[[3]]}}', inline).dmgTypes.length, 1);
state.sCharacterSheetType = 'Shaped';
var shaped = '{{attack1=$[[0]]}} {{attack_damage=$[[3]]}} {{attack_damage_type= Fire }} {{attack_second_damage=$[[4]]}} {{attack_second_damage_type=Cold}}';
expect('Shaped attack', parse(shaped, inline).d20Rolls, [inline[0]]);
expect('Shaped both damage rolls', parse(shaped, inline).dmgRolls, [inline[3], inline[4]]);
expect('Shaped both damage types', parse(shaped, inline).dmgTypes, ['fire', 'cold']);
var skipped = parse(shaped.replace('{{attack_damage=$[[3]]}}', '{{attack_damage=$[[99]]}}'), inline);
expect('skipped first damage retains second roll', skipped.dmgRolls, [inline[4]]);
expect('skipped first damage retains only second type', skipped.dmgTypes, ['cold']);
expect('Shaped generic roll', parse('{{roll1=$[[1]]}}', inline).d20Rolls, [inline[1]]);
var save = parse('{{saving_throw_vs_ability=Dexterity}} {{saving_throw_dc=14}} {{saving_throw_damage=$[[3]]}} {{saving_throw_damage_type=Fire}}', inline);
expect('Shaped saving throw', [save.bRequiresSavingThrow, save.saveType, save.dc, save.dmgRolls, save.dmgTypes], [true, 'Dexterity', 14, [inline[3]], ['fire']]);
expect('Shaped absent rolls', parse('', inline).d20Rolls, []);
// Exercise the real string operations used by consumers, without changing callbacks.
function expectString(name, value, consume) {
    expect(name + ' is a string', typeof value, 'string');
    var threw = false;
    try { consume(value); } catch (error) { threw = true; }
    expect(name + ' consumer does not throw', threw, false);
}
function expectTextContract(name, roll) {
    expectString(name + ' range', roll.rangeString, function(value) { value.toLowerCase(); });
    expectString(name + ' save effects', roll.saveEffects, parser.universalizeString);
    expectString(name + ' save type', roll.saveType, parser.universalizeString);
}
function expectDamageContract(name, roll, expectedRolls) {
    expect(name + ' damage rolls', roll.dmgRolls, expectedRolls);
    expect(name + ' damage alignment', roll.dmgTypes.length, roll.dmgRolls.length);
    expectedRolls.forEach(function(entry, index) {
        expect(name + ' missing type ' + index, roll.dmgTypes[index], '');
        expectString(name + ' damage type ' + index, roll.dmgTypes[index], parser.universalizeString);
    });
}
state.sCharacterSheetType = 'OGL';
expectTextContract('OGL absent text', parse('{{r1=$[[0]]}}', inline));
expect('OGL absent save field is not a saving throw', parse('{{r1=$[[0]]}}', inline).bRequiresSavingThrow, false);
expect('OGL present save field requires saving throw', full.bRequiresSavingThrow, true);
expect('OGL empty save field is still present', parse('{{saveattr=}}', inline).bRequiresSavingThrow, true);
expectDamageContract('OGL untyped damage', parse('{{dmg1=$[[3]]}}', inline), [inline[3]]);
state.sCharacterSheetType = 'Shaped';
var shapedAttack = parse('{{attack1=$[[0]]}} {{attack_damage=$[[3]]}} {{attack_second_damage=$[[4]]}}', inline);
expectTextContract('Shaped attack absent text', shapedAttack);
expect('Shaped attack does not require saving throw', shapedAttack.bRequiresSavingThrow, false);
expectDamageContract('Shaped untyped attack', shapedAttack, [inline[3], inline[4]]);
var shapedSave = parse('{{saving_throw_vs_ability=Dexterity}} {{saving_throw_damage=$[[3]]}}', inline);
expectTextContract('Shaped save absent text', shapedSave);
expect('Shaped present save field requires saving throw', shapedSave.bRequiresSavingThrow, true);
expect('Shaped empty save field is still present', parse('{{saving_throw_vs_ability=}}', inline).bRequiresSavingThrow, true);
expectDamageContract('Shaped untyped save', shapedSave, [inline[3]]);
expectTextContract('Shaped absent fields', parse('', inline));
expect('Shaped absent save field is not a saving throw', parse('', inline).bRequiresSavingThrow, false);
console.log('\n' + (failures ? failures + ' failed' : 'All roll parser tests passed'));
process.exitCode = failures ? 1 : 0;
