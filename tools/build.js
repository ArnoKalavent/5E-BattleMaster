'use strict';

var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;
var root = path.join(__dirname, '..');

try {
    var source = fs.readFileSync(path.join(root, '5ebattlemaster.js'), 'utf8');
    var stamp = /(?<=^    var buildRev = )'dev \(unstamped\)'(?=;\r?$)/gm;
    var matches = source.match(stamp) || [];
    if (matches.length !== 1) {
        throw new Error('Expected exactly one build-rev literal; found ' + matches.length + '. No file written.');
    }
    var version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
    var describe = execFileSync('git', ['describe', '--always', '--dirty', '--abbrev=7'], {
        cwd: root,
        encoding: 'utf8'
    }).trim();
    var rev = 'v' + version + ' (' + describe + ')';
    var built = source.replace(stamp, function () { return JSON.stringify(rev); });
    var output = path.join(root, 'dist', '5ebattlemaster.js');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, built, 'utf8');
    console.log(output + ': ' + rev);
} catch (err) {
    console.error('Build failed: ' + err.message);
    process.exit(1);
}
