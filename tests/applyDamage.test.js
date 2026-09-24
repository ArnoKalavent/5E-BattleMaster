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
    expect(sheet + ' resistance is logged whether or not the target has temp HP', function() {
        // The log is the GM's evidence that resistance applied. It lived only in
        // the no-temp-HP branch, so a resisted hit on a target with temp HP was
        // halved silently.
        var attrs = {};
        attrs[prefix + 'resistances'] = 'fire';
        var line = 'Defender has resistance to fire damage!';
        var withTemp = fixture(sheet, attrs, 6, 20);
        withTemp.hit(5, 'fire');
        var without = fixture(sheet, attrs, 0, 20);
        without.hit(5, 'fire');
        return [withTemp.world.logs.includes(line), without.world.logs.includes(line)];
    }, [true, true]);
    expect(sheet + ' resistance rounds 5 damage down to 2', function() {
        var attrs = {};
        attrs[prefix + 'resistances'] = 'fire';
        return fixture(sheet, attrs, 0, 20).hit(5, 'fire');
    }, [0, 18]);
});

expect('blank temp HP uses the HP-only path', function() {
    var f = fixture('OGL', {}, '', 20);
    f.hit(5, 'fire');
    return f.token.writes;
}, [['bar3_value', 15]]);
[
    ['both blank bars remain unchanged', '', ''],
    ['non-numeric HP remains unchanged', 0, 'unknown'],
    ['non-numeric bars remain unchanged', 'unknown', 'unknown'],
    ['missing HP remains unchanged', 3, undefined],
    ['whitespace HP remains unchanged', 3, '   '],
    ['infinite HP remains unchanged', 3, Infinity]
].forEach(function(test) {
    expect(test[0] + ' and notify the GM once', function() {
        var f = fixture('OGL', {}, test[1], test[2]);
        var bars = f.hit(5, 'fire');
        var message = "Target has no usable HP bar (bar3), so 5 damage was not applied. Set the token's bar3 to a number.";
        return [bars, f.token.writes, f.world.chats, f.world.logs.includes('BattleMaster: ' + message)];
    }, [[test[1], test[2]], [], [{ who: 'BattleMaster', message: "/w GM Target has no usable HP bar (bar3), so 5 damage was not applied. Set the token's bar3 to a number." }], true]);
});
expect('empty damage type ignores non-empty resistance', function() {
    return fixture('OGL', { npc_resistances: 'fire' }, 0, 20).hit(6, '');
}, [0, 14]);
expect('empty damage type ignores non-empty immunity', function() {
    return fixture('OGL', { npc_immunities: 'cold', npc_resistances: 'fire' }, 0, 20).hit(6, '');
}, [0, 14]);
expect('empty damage type ignores empty immunity and resistance', function() {
    return fixture('OGL', { npc_immunities: '', npc_resistances: 'fire' }, 0, 20).hit(6, '');
}, [0, 14]);
[undefined, 0, 2, 3, 10].forEach(function(temp) {
    expect('save-for-half 3.5 damage floors to 3 with temp HP ' + temp, function() {
        return fixture('OGL', {}, temp, 20).hit(3.5, 'fire');
    }, [temp === undefined ? undefined : Math.max(0, temp - 3), 20 - Math.max(0, 3 - (temp || 0))]);
    expect('resisted odd damage floors to 2 with temp HP ' + temp, function() {
        return fixture('OGL', { npc_resistances: 'fire' }, temp, 20).hit(5, 'fire');
    }, [temp === undefined ? undefined : Math.max(0, temp - 2), 20 - Math.max(0, 2 - (temp || 0))]);
    expect('fractional vulnerable damage floors after doubling with temp HP ' + temp, function() {
        return fixture('OGL', { npc_vulnerabilities: 'fire' }, temp, 20).hit(3.75, 'fire');
    }, [temp === undefined ? undefined : Math.max(0, temp - 7), 20 - Math.max(0, 7 - (temp || 0))]);
    expect('whitespace damage type ignores vulnerability with temp HP ' + temp, function() {
        return fixture('OGL', { npc_vulnerabilities: 'fire' }, temp, 20).hit(6, '   ');
    }, [temp === undefined ? undefined : Math.max(0, temp - 6), 20 - Math.max(0, 6 - (temp || 0))]);
});
expect('non-numeric temp HP uses the HP-only path', function() {
    var f = fixture('OGL', {}, 'unknown', '20');
    f.hit(5, 'fire');
    return f.token.writes;
}, [['bar3_value', 15]]);
expect('numeric string temp HP absorbs damage', function() {
    return fixture('OGL', {}, '3', '20').hit(5, 'fire');
}, [0, 18]);
// A stale persisted setting cannot disable OGL resistance handling.
expect('resistance applies regardless of leftover state value', function() {
    return fixture('custom', { npc_resistances: 'fire' }, 0, 20).hit(6, 'fire');
}, [0, 17]);
process.exitCode = failures ? 1 : 0;
