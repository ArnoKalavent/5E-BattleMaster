'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var src = fs.readFileSync(path.join(__dirname, '..', '5ebattlemaster.js'), 'utf8');
var context = { state: {}, log: function() {}, on: function() {} };
vm.runInNewContext(src.replace('BuildRev: buildRev,',
    'BuildRev: buildRev, generateTurnOptions: generateTurnOptions, generateTurnOptionCommands: generateTurnOptionCommands,'), context);
var options = Array.from(context.BattleMaster.generateTurnOptions());
var commands = Array.from(context.BattleMaster.generateTurnOptionCommands());
assert.deepStrictEqual(options, ['Weapon Attack', 'Direct Spell']);
console.log('PASS  turn menu contains exactly Weapon Attack and Direct Spell');
assert.deepStrictEqual(commands, ['weaponattack', 'directspell']);
console.log('PASS  turn commands match the two actions in order');
assert.strictEqual(options.length, commands.length);
console.log('PASS  turn menu and commands have matching lengths');
