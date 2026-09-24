'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
['5ebattlemaster.js', 'dist/5ebattlemaster.js'].forEach(function(filename) {
    var src = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
    new vm.Script(src, { filename: filename });
    console.log('PASS  whole-file compilation: ' + filename);
});
