'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

module.exports = function loadScript(options) {
    options = options || {};
    var registry = [];
    var chats = [], logs = [], calls = {};
    var nextId = 1;
    function makeObject(type, props) {
        props = Object.assign({}, props);
        var id = props.id || props._id || type + '-' + nextId++;
        props._id = id;
        props._type = type;
        var object = {
            id: id,
            props: props,
            writes: [],
            get: function(key) { return props[key]; },
            set: function(key, value) {
                var updates = typeof key === 'object' ? key : { [key]: value };
                Object.keys(updates).forEach(function(name) {
                    object.writes.push([name, updates[name]]);
                    props[name] = updates[name];
                });
            }
        };
        registry.push(object);
        return object;
    }
    function getObj(type, id) {
        return registry.find(function(object) { return object.get('_type') === type && object.id === id; });
    }
    var campaign = makeObject('campaign', Object.assign({ turnorder: '', playerpageid: 'page-1' }, options.campaign));
    var context = {
        state: {},
        _: require('underscore'),
        getObj: getObj,
        findObjs: function(query) {
            return registry.filter(function(object) {
                return Object.keys(query).every(function(key) {
                    return object.get(key === 'type' ? '_type' : key === 'id' ? '_id' : key) === query[key];
                });
            });
        },
        getAttrByName: function(id, name) {
            var character = getObj('character', id);
            return character && character.attrs[name];
        },
        Campaign: function() { return campaign; },
        sendChat: function(who, message) { chats.push({ who: who, message: message }); },
        log: function(message) { logs.push(message); },
        playerIsGM: options.playerIsGM || function() { return false; }
    };
    ['on', 'spawnFx', 'sendPing', 'createObj', 'toFront', 'toBack'].forEach(function(name) {
        calls[name] = [];
        context[name] = function() { calls[name].push(Array.from(arguments)); };
    });
    var src = fs.readFileSync(path.join(__dirname, '..', '..', '5ebattlemaster.js'), 'utf8');
    var marker = 'BuildRev: buildRev,';
    if (src.split(marker).length !== 2) { throw new Error('Expected one BattleMaster export marker'); }
    var exports = (options.internals || []).map(function(name) {
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) { throw new Error('Invalid internal name: ' + name); }
        return name + ': ' + name + ',';
    });
    vm.runInNewContext(src.replace(marker, marker + exports.join('')), context, { filename: '5ebattlemaster.js' });
    return {
        BattleMaster: context.BattleMaster,
        state: context.state,
        context: context,
        registry: registry,
        campaign: campaign,
        chats: chats,
        logs: logs,
        calls: calls,
        makeGraphic: function(props) { return makeObject('graphic', props); },
        makeCharacter: function(props, attrs) {
            var character = makeObject('character', props);
            character.attrs = Object.assign({}, attrs);
            return character;
        }
    };
};
