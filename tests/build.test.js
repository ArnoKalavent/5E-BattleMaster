/* Build stamping and sandbox startup tests. Run with: npm test */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var execFileSync = require('child_process').execFileSync;
var root = path.join(__dirname, '..');
var sourcePath = path.join(root, '5ebattlemaster.js');
var sourceBytes = fs.readFileSync(sourcePath);
var source = sourceBytes.toString('utf8');
var placeholder = "    var buildRev = 'dev (unstamped)';";
var failures = 0;

function expect(name, got, want) {
    var pass = JSON.stringify(got) === JSON.stringify(want);
    if (!pass) { failures++; }
    console.log((pass ? 'PASS' : 'FAIL') + '  ' + name +
        '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
}

expect('source contains exactly one unstamped declaration', source.split(placeholder).length - 1, 1);

function checkStartup(script, expectedRev) {
    var ready;
    var events = [];
    var context = {
        state: {},
        on: function (event, callback) { if (event === 'ready') { ready = callback; } },
        log: function (message) { events.push(message); },
        Date: function () { return new Date('2026-09-21T12:00:00Z'); }
    };
    vm.runInNewContext(script, context);
    expect('exported build rev', context.BattleMaster.BuildRev, expectedRev);
    // A sentinel proves the banner reads the exposed value at startup.
    context.BattleMaster.BuildRev = 'test-rev-sentinel';
    var registrationError = new Error('registration failed');
    context.BattleMaster.RegisterEventHandlers = function () {
        events.push('register');
        throw registrationError;
    };
    var caught;
    try { ready(); } catch (err) { caught = err; }
    expect('registration was invoked', caught === registrationError, true);
    expect('dynamic banner with date precedes failing registration', events, [
        '-=> BattleMaster test-rev-sentinel <=- [' + new context.Date() + ']',
        'register'
    ]);
}

checkStartup(source, 'dev (unstamped)');
execFileSync(process.execPath, [path.join(root, 'tools', 'build.js')], { cwd: root, stdio: 'inherit' });
var builtBytes = fs.readFileSync(path.join(root, 'dist', '5ebattlemaster.js'));
var built = builtBytes.toString('utf8');
var stampLines = built.match(/^    var buildRev = .+;\r?$/gm) || [];
expect('built file has exactly one stamp line', stampLines.length, 1);
var rev = stampLines.length === 1 ? JSON.parse(stampLines[0].trim().slice('var buildRev = '.length, -1)) : '';
expect('built rev is not the placeholder', rev !== 'dev (unstamped)', true);
var version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
var describe = execFileSync('git', ['describe', '--always', '--dirty', '--abbrev=7'], {
    cwd: root, encoding: 'utf8'
}).trim();
expect('stamp includes package version and git describe', rev, 'v' + version + ' (' + describe + ')');
var restored = built.replace(/^    var buildRev = .+;(?=\r?$)/gm, function () { return placeholder; });
expect('built bytes match source except for the stamped line', Buffer.from(restored, 'utf8').equals(sourceBytes), true);
expect('build leaves source bytes untouched', fs.readFileSync(sourcePath).equals(sourceBytes), true);
checkStartup(built, rev);

if (failures > 0) {
    console.error('\n' + failures + ' test(s) failed.');
    process.exit(1);
}
console.log('\nAll tests passed.');
