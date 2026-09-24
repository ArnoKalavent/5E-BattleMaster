'use strict';
var assert = require('assert');
var loadScript = require('./support/roll20');
var failures = 0;
function expect(name, run, want) {
    try {
        assert.deepStrictEqual(run(), want);
        console.log('PASS  ' + name);
    } catch (error) {
        failures++;
        console.log('FAIL  ' + name + ': ' + error.message);
    }
}
function fixture(sheet, attrs, temp, hp, unlinked) {
    var world = loadScript({ internals: ['applyDamage'] });
    world.state.sCharacterSheetType = sheet;
    var token = world.makeGraphic({ name: 'Target', bar2_value: temp, bar3_value: hp });
    var character = unlinked ? undefined : world.makeCharacter({ name: 'Defender' }, attrs);
    return {
        world: world, token: token,
        hit: function(amount, type) {
            world.BattleMaster.applyDamage(amount, type, token, character);
            return [token.get('bar2_value'), token.get('bar3_value')];
        }
    };
}
expect('HP only with no temp HP bar', function() {
    return fixture('OGL', {}, undefined, 20).hit(7, 'fire');
}, [undefined, 13]);
expect('temp HP absorbs part of damage', function() {
    return fixture('OGL', {}, 3, 20).hit(7, 'fire');
}, [0, 16]);
expect('temp HP absorbs all damage without writing HP', function() {
    var f = fixture('OGL', {}, 10, 20);
    f.hit(7, 'fire');
    return f.token.writes;
}, [['bar2_value', 3]]);

['OGL'].forEach(function(sheet) {
    var prefix = 'npc_';
    var other = 'damage_';
    [undefined, 3, 20].forEach(function(temp) {
        ['immunities', 'vulnerabilities', 'resistances'].forEach(function(kind) {
            var attrs = {};
            attrs[prefix + kind] = 'fire';
            var damage = kind === 'immunities' ? 0 : kind === 'vulnerabilities' ? 12 : 3;
            var remaining = temp === undefined ? damage : Math.max(0, damage - temp);
            expect(sheet + ' ' + kind + ' with temp HP ' + temp, function() {
                var f = fixture(sheet, attrs, temp, 30);
                if (kind === 'immunities') {
                    f.hit(6, 'fire');
                    return f.token.writes;
                }
                return f.hit(6, 'fire');
            }, kind === 'immunities' ? [] : [temp === undefined ? undefined : Math.max(0, temp - damage), 30 - remaining]);
        });
    });
    expect(sheet + ' ignores attributes belonging to the other sheet', function() {
        var attrs = {};
        attrs[other + 'immunities'] = 'fire';
        attrs[other + 'vulnerabilities'] = 'fire';
        attrs[other + 'resistances'] = 'fire';
        return fixture(sheet, attrs, 0, 20).hit(6, 'fire');
    }, [0, 14]);
    expect(sheet + ' normalizes resistance casing and spacing', function() {
        var attrs = {};
        attrs[prefix + 'resistances'] = 'Bludgeoning, Piercing, and Slashing from Nonmagical Attacks';
        return fixture(sheet, attrs, 0, 20).hit(6, ' SLASHING ');
    }, [0, 17]);
    expect(sheet + ' unlinked token takes resistance-free path without throwing and logs why', function() {
        // Missing temp HP forces the branch containing the otherwise unguarded
        // targetCharacter.get('name'); absent resistance must keep it unreachable.
        var f = fixture(sheet, {}, undefined, 20, true);
        var bars = f.hit(5, 'fire');
        return [bars, f.world.logs.includes('BattleMaster: No linked character for Target; applying damage without immunities, resistances or vulnerabilities.')];
    }, [[undefined, 15], true]);
    // DEFECT: 5e rounds resisted damage DOWN to 2, leaving 18 HP.
    // TODO.md: "Resistance rounds the wrong way". Flip 17 to 18 when fixed.
    expect('DEFECT ' + sheet + ' resistance rounds .5 up (5 -> 3, should be 2)', function() {
        var attrs = {};
        attrs[prefix + 'resistances'] = 'fire';
        return fixture(sheet, attrs, 0, 20).hit(5, 'fire');
    }, [0, 17]);
});

// DEFECT: a blank temp bar should remain blank and use the HP-only path,
// producing only [['bar3_value', 15]], rather than writing a spurious zero.
expect('DEFECT blank temp HP takes the temp-HP path', function() {
    var f = fixture('OGL', {}, '', 20);
    f.hit(5, 'fire');
    return f.token.writes;
}, [['bar2_value', 0], ['bar3_value', 15]]);
// DEFECT: blank HP must not become negative HP; invalid/missing HP should
// remain blank pending validation, so the correct bars are ['', ''].
expect('DEFECT both blank bars become zero temp HP and negative HP', function() {
    return fixture('OGL', {}, '', '').hit(5, 'fire');
}, [0, -5]);
// DEFECT: invalid HP should be rejected and remain 'unknown', never NaN.
// deepStrictEqual explicitly distinguishes NaN from null/undefined.
expect('DEFECT non-numeric HP writes NaN', function() {
    return fixture('OGL', {}, 0, 'unknown').hit(5, 'fire');
}, [0, NaN]);
// DEFECT: invalid bars should remain unchanged until validated:
// ['unknown', 'unknown'], rather than persisting NaN in HP.
expect('DEFECT non-numeric bars bypass temp HP and write NaN', function() {
    return fixture('OGL', {}, 'unknown', 'unknown').hit(5, 'fire');
}, ['unknown', NaN]);
// DEFECT: an unspecified damage type should not match fire resistance;
// 6 damage should leave 14 HP, not 17.
expect('DEFECT empty damage type matches non-empty resistance', function() {
    return fixture('OGL', { npc_resistances: 'fire' }, 0, 20).hit(6, '');
}, [0, 17]);
// DEFECT: an unspecified type should not match immunity; correct HP is 14.
expect('DEFECT empty damage type matches non-empty immunity', function() {
    return fixture('OGL', { npc_immunities: 'cold', npc_resistances: 'fire' }, 0, 20).hit(6, '');
}, [0, 20]);
// DEFECT: even an empty immunity string matches empty damage type;
// correct HP is 14, with no immunity or resistance applied.
expect('DEFECT empty damage type matches empty immunity before resistance', function() {
    return fixture('OGL', { npc_immunities: '', npc_resistances: 'fire' }, 0, 20).hit(6, '');
}, [0, 20]);
// A stale persisted setting cannot disable OGL resistance handling.
expect('resistance applies regardless of leftover state value', function() {
    return fixture('custom', { npc_resistances: 'fire' }, 0, 20).hit(6, 'fire');
}, [0, 17]);
process.exitCode = failures ? 1 : 0;
