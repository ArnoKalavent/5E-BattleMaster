var BattleMaster = BattleMaster || (function() {
    'use strict';

    /* BUILD REVISION — filled in by tools/build.js for distribution */
    var buildRev = 'dev (unstamped)';
    
    var bInCombat, bStagingInitiative, bIsWaitingOnRoll, selectedTokenCallbackFunction,
    sLastPromptedTurnID, iLastTurnorderLength = 0,
    currentPlayerDisplayName, currentTurnPlayer, currentTurnCharacter, currentTurnToken,
    currentlyCastingSpellRoll,
    target,
    reticleTokenId,
    listTokensInEncounter = [],
    listTokensWaitingOnSavingThrowsFrom = [],
    sPreviousAction, sPreviousBonusAction,
    listRollCallbackFunctions = [],
    listPlayerIDsWaitingOnRollFrom = [],
    listSelectableGraphics = [],
    defaults = {
            css: {
                button: {
                    'border': '1px solid #cccccc',
                    'border-radius': '1em',
                    'background-color': '#006dcc',
                    'margin': '0 .1em',
                    'font-weight': 'bold',
                    'padding': '.1em 1em',
                    'color': 'white'
                }
            }
        },
    templates = {};
    // Inline rolls may be absent, or occupy an array slot without an entry.
    function safeRollTotal(entry){
        if(!entry || !entry.results || typeof entry.results.total !== 'number' || !isFinite(entry.results.total)){
            return undefined;
        }
        return entry.results.total;
    }

    function reportMissingRoll(problem){
        log("BattleMaster: " + problem);
        var recipient = currentPlayerDisplayName ? '"' + currentPlayerDisplayName + '"' : 'GM';
        sendChat("BattleMaster", '/w ' + recipient + ' ' + problem);
    }

    function reportRefusedCommand(msg, problem){
        var caller = getObj('player', msg.playerid);
        var name = (caller && caller.get('displayname')) || msg.who;
        var recipient = name ? '"' + name.replace(/"/g, '') + '"' : 'GM';
        sendChat("BattleMaster", '/w ' + recipient + ' ' + problem);
    }

    function invokePendingCallback(msg, callback, beforeInvoke){
        if(typeof callback !== 'function'){
            reportRefusedCommand(msg, "There is nothing pending for that command.");
            return;
        }
        beforeInvoke();
        callback();
    }

    // Template names are literal, even when they contain regex metacharacters.
    function extractTemplateText(content, fieldName){
        var escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var match = new RegExp('\\{\\{' + escapedName + '=([\\s\\S]*?)\\}\\}').exec(content);
        return match ? match[1] : undefined;
    }

    function extractInlineRollIndex(content, fieldName){
        var value = extractTemplateText(content, fieldName);
        var match = value === undefined ? null : /^\$\[\[(\d+)\]\]$/.exec(value);
        if(!match){return undefined;}
        var index = Number(match[1]);
        return Number.isSafeInteger(index) && index >= 0 ? index : undefined;
    }

    /* OBJECTS */
    function rollData(rollMsg){
        log("Creating RollData object!");
        var inlineData = rollMsg.inlinerolls || [];
        var r1Index, r2Index, dmg1Index, dmg2Index, crit1Index, crit2Index, saveDCIndex;
        var dmgType1, dmgType2, saveType;
        log("Inline data: " + JSON.stringify(inlineData));
        log(rollMsg.content);
        this.playerid = rollMsg.playerid;
        this.d20Rolls = [];
        this.dmgRolls = [];
        this.dmgTypes = [];
        this.critRolls = [];
        this.critTypes = [];
        this.rangeString = "";
        this.saveType = "";
        this.saveEffects = "";
        r1Index = extractInlineRollIndex(rollMsg.content, 'r1');
        r2Index = extractInlineRollIndex(rollMsg.content, 'r2');
        saveDCIndex = extractInlineRollIndex(rollMsg.content, 'savedc');
        dmg1Index = extractInlineRollIndex(rollMsg.content, 'dmg1');
        //dmg2Index = extractInlineRollIndex(rollMsg.content, 'dmg2');
        crit1Index = extractInlineRollIndex(rollMsg.content, 'crit1');
        //crit2Index = extractInlineRollIndex(rollMsg.content, 'crit2');
        dmgType1 = extractTemplateText(rollMsg.content, 'dmg1type');
        //dmgType2 = extractTemplateText(rollMsg.content, 'dmg2type');
        this.rangeString = extractTemplateText(rollMsg.content, 'range') || "";
        saveType = extractTemplateText(rollMsg.content, 'saveattr');
        this.bRequiresSavingThrow = saveType !== undefined;
        this.saveType = saveType || "";
        this.saveEffects = extractTemplateText(rollMsg.content, 'savedesc') || "";
        if(r1Index !== undefined && inlineData[r1Index]){this.d20Rolls.push(inlineData[r1Index]);}
        if(r2Index !== undefined && inlineData[r2Index]){this.d20Rolls.push(inlineData[r2Index]);}
        if(saveDCIndex !== undefined && inlineData[saveDCIndex]){this.dc = inlineData[saveDCIndex];}
        if(dmg1Index !== undefined && inlineData[dmg1Index]){
            this.dmgRolls.push(inlineData[dmg1Index]);
            this.dmgTypes.push(universalizeString(dmgType1 || ""));
        }
        if(dmg2Index !== undefined && inlineData[dmg2Index]){
            this.dmgRolls.push(inlineData[dmg2Index]);
            this.dmgTypes.push(universalizeString(dmgType2 || ""));
        }
    }
    function tokenWrapper(token){
        this.token = token;
        this.associatedCharacter = getObj('character', token.get('represents'));
        this.bIsMook
        this.bIsPlayer
        this.bHasTakenAction = false;
        this.bHasTakenBonusAction = false;
        this.bHasTakenReaction = false;
        this.name = token.get('name');
        this.ac = undefined;
        if(token.get('represents')){
            this.ac = getAttrByName(token.get('represents'),'npcd_ac');
            if(this.ac === "" || this.ac === undefined){
                log('Couldn\'t find npcd_ac, looking for just ac')
                this.ac = getAttrByName(token.get('represents'),'ac');
            }
        }
        this.get = function(attribute){
            return token.get(attribute);
        }
    }
    /*UTILITY SCRIPTS*/
    var buildTemplates = function() {
        templates.cssProperty =_.template(
            '<%=name %>: <%=value %>;'
        );

        templates.style = _.template(
            'style="<%='+
                '_.map(css,function(v,k) {'+
                    'return templates.cssProperty({'+
                        'defaults: defaults,'+
                        'templates: templates,'+
                        'name:k,'+
                        'value:v'+
                    '});'+
                '}).join("")'+
            ' %>"'
        );
        
        templates.button = _.template(
            '<a <%= templates.style({'+
                'defaults: defaults,'+
                'templates: templates,'+
                'css: _.defaults(css,defaults.css.button)'+
                '}) %> href="<%= command %>"><%= label||"Button" %></a>'
        );
    },

    /*Makes the API buttons used throughout the script*/
    makeButton = function(command, label, backgroundColor, color){
        return templates.button({
            command: command,
            label: label,
            templates: templates,
            defaults: defaults,
            css: {
                color: color,
                'background-color': backgroundColor
            }
        });
    },
    
    promptButtonArray = function(promptName, listPromptableItems, listCommandNames, sPlayerDisplayName){
        var stringToSend, 
            buttonArray = [];
            /*
        for(var i = 0; i < listPromptableItems.length; i++){
            var tempString = listPromptableItems[i];
            while(tempString.indexOf(' ') != -1){
                tempString = tempString.slice(0,tempString.indexOf(' ')) + tempString.slice(tempString.indexOf(' ') + 1);
            }
            tempString = tempString.toLowerCase();
            listCommandNames[i] = tempString;
            log(tempString);
        }
        */
        
        for(var i = 0; i < listPromptableItems.length; i++){
            buttonArray[i] = makeButton('!combat ' + listCommandNames[i], listPromptableItems[i], '#CDAE88', 'black');
        }
        stringToSend = '/w "' + sPlayerDisplayName + '" '
            +'<div style="border: 1px solid black; background-color: white; padding: 3px 3px;">'
            +'<div style="font-weight: bold; border-bottom: 1px solid black;font-size: 130%;">'
            +promptName
            +'</div>';
        for(var i = 0; i < buttonArray.length; i++){
            stringToSend += buttonArray[i];
        }
        stringToSend += '</div>';
        sendChat('BattleMaster', stringToSend);
    },

    //Spawns the targeting reticle. Returns true on success. The image MUST
    //come from the game creator's own Roll20 library (as a "thumb" URL) or
    //createObj rejects it - which is why the imgsrc is configured per-game
    //via "!combat set reticle" rather than hard-coded.
    promptTarget = function(){
        var imgsrc = state.BattleMaster && state.BattleMaster.reticleImgSrc;
        if(!imgsrc){
            sendChat("BattleMaster", '/w "' + currentPlayerDisplayName + '" The targeting reticle isn\'t set up yet - the GM needs to configure it first.');
            sendChat("BattleMaster", "/w GM No reticle image is configured. Upload any small image to your Roll20 library, drag it onto the page, select it, and run <b>!combat set reticle</b>. (The token can be deleted afterward.)");
            return false;
        }
        var reticle = createObj("graphic", {
            controlledby: (currentTurnPlayer.id),
            _pageid: Campaign().get('playerpageid'),
            left: (currentTurnToken.token.get('left')),
            top: (currentTurnToken.token.get('top') - distanceToPixels(5)),
            layer: "objects",
            imgsrc: imgsrc,
            width: distanceToPixels(5),
            height: distanceToPixels(5),
        });
        if(!reticle){
            //Never dereference a failed createObj - that crashes the whole
            //API sandbox and wipes all script state.
            sendChat("BattleMaster", "/w GM Reticle creation failed. The configured image was rejected by Roll20 - it must be an image uploaded to YOUR library (not marketplace/external). Re-run <b>!combat set reticle</b> with a library-image token selected.");
            return false;
        }
        reticleTokenId = reticle.id;
        sendPing(currentTurnToken.token.get('left'), currentTurnToken.token.get('top') - distanceToPixels(5), Campaign().get('playerpageid'), null, true);
        log("Reticle token ID: " + reticleTokenId);
        promptButtonArray("Move the target to where you would like to attack", ["Target selected"], ["selectedTarget"], currentPlayerDisplayName);
        return true;
    },

    //"!combat set reticle" - captures the reticle image from the GM's
    //selected token (preferred, no URL wrangling) or from a pasted URL.
    //Normalizes any library image size (med/original/max) to the "thumb"
    //size the API requires, preserving the query string.
    ConfigureReticle = function(msg, urlArg){
        if(playerIsGM(msg && msg.playerid) !== true){
            sendChat("BattleMaster", '/w "' + ((msg && msg.who) || 'Player') + '" Reticle setup is GM-only.');
            return;
        }
        var imgsrc;
        if(msg.selected && msg.selected.length > 0){
            var selectedToken = getObj('graphic', msg.selected[0]._id);
            if(selectedToken){
                imgsrc = selectedToken.get('imgsrc');
            }
        }
        if(!imgsrc && urlArg){
            imgsrc = urlArg;
        }
        if(!imgsrc){
            sendChat("BattleMaster", "/w GM To set the reticle image: upload an image to your Roll20 library, drag it onto the page, select that token, and run <b>!combat set reticle</b> again.");
            return;
        }
        imgsrc = imgsrc.replace(/\/(med|original|max|min)\.(png|jpg|jpeg|gif|webp)/, '/thumb.$2');
        state.BattleMaster = state.BattleMaster || {};
        state.BattleMaster.reticleImgSrc = imgsrc;
        sendChat("BattleMaster", "/w GM Reticle image saved" + (imgsrc.indexOf('/thumb.') === -1 ? " - WARNING: the URL doesn't look like a library thumb image, so reticle creation may still fail. If it does, re-run with a token whose image came from your own library." : "!"));
    },
    
    //Returns the Graphic whose turn it is, or undefined when there is no
    //valid token turn: empty tracker, a custom entry (round counter etc.) on
    //top, or a top entry whose token has been deleted from the page.
    findCurrentTurnToken = function(turnorder) {
        log("Finding current turn token!");
		if (!turnorder) 
			{turnorder = Campaign().get('turnorder');}
		if (!turnorder) 
			{return undefined;}
		if (typeof(turnorder) === 'string') 
			{turnorder = JSON.parse(turnorder);}
		if (!turnorder || turnorder.length === 0)
			{return undefined;}
		//Custom turn-order items have id "-1" - a STRING per the current API
		//docs. Check the legacy numeric -1 too, defensively.
		if (turnorder[0].id === "-1" || turnorder[0].id === -1){
			log("Top of the turn order is a custom entry, not a token.");
			return undefined;
		}
		var currentToken = getObj('graphic', turnorder[0].id);
		if (!currentToken){
			log("Top turn order entry doesn't resolve to a token (deleted from page?).");
			return undefined;
		}
        log("Found current turn token!");
		return currentToken;
	},
	
	//Returns a player ID in every case, preferring whoever can actually act:
	//  1. an ONLINE non-GM controller listed on the character (normal play)
	//  2. an ONLINE GM controller listed on the character (GM co-listed on a
	//     PC takes over when the player is absent)
	//  3. an OFFLINE non-GM listed controller (async/play-by-post: the whisper
	//     still lands in their archive)
	//  4. any other listed controller
	//  5. an online GM, then any GM (uncontrolled NPCs, stale controller IDs)
	findWhoIsControlling = function(character){
        log("Running findWhoIsControlling!");
        var controllerIDs = [];
        if(character){
            //'controlledby' can be "", "all", or a comma-delimited ID list.
            //"" splits to [""], and "all" is not a player ID - filter both out.
            //Also drop IDs that no longer resolve to a player in this game
            //(e.g. a player who left), so callers can trust the returned ID.
            controllerIDs = _.filter(character.get('controlledby').split(','), function(id){
                return id !== '' && id !== 'all' && getObj('player', id) !== undefined;
            });
        }
        var isOnline = function(id){
            return getObj('player', id).get('_online') === true;
        };
        var pick =
            _.find(controllerIDs, function(id){ return isOnline(id) && !playerIsGM(id); }) ||
            _.find(controllerIDs, function(id){ return isOnline(id); }) ||
            _.find(controllerIDs, function(id){ return !playerIsGM(id); }) ||
            controllerIDs[0];
        if(pick){
            log("Found a controlling player from the character's controller list!");
            return pick;
        }
        //No usable controllers listed (typical for NPCs): fall back to a GM.
        //playerIsGM takes a player ID, so pass p.id, not the player object.
        log("No players in the controlling list! Falling back to a GM.");
        var onlineGM = _.find(findObjs({_type: "player", _online: true}), function(p){
            return playerIsGM(p.id);
        });
        if(onlineGM){
            log(onlineGM.get('displayname') + " is an online GM, setting them to controlling!");
            return onlineGM.id;
        }
        //Last resort: any GM, online or not, so callers always receive an ID.
        var anyGM = _.find(findObjs({_type: "player"}), function(p){
            return playerIsGM(p.id);
        });
        if(anyGM){
            log("No GM online; falling back to offline GM " + anyGM.get('displayname'));
            return anyGM.id;
        }
        log("ERROR: no GM found in game; findWhoIsControlling returning undefined.");
        return undefined;
	},
    
    findTokenAtTarget = function(){
        listSelectableGraphics = [];
        var recipient = currentPlayerDisplayName ? '"' + currentPlayerDisplayName + '"' : 'GM';
        var reticleToken = getObj("graphic",reticleTokenId);
        if(reticleToken){
            var testedEntries = 0;
            var reticleLeft = reticleToken.get('left'), reticleTop = reticleToken.get('top');
            log("Reticle token isn't null!");
            var turnorder = Campaign().get('turnorder');
            var parsed;
            try {
                parsed = turnorder ? JSON.parse(turnorder) : [];
            } catch (e) {
                parsed = [];
            }
            _.each(parsed, function(entry){
                //Skip custom entries (id "-1") and deleted tokens - only real
                //tokens can be targeted.
                if(entry.id === "-1" || entry.id === -1){ return; }
                var token = getObj('graphic', entry.id);
                if(!token){ return; }
                testedEntries++;
                log("Testing token " + token.id);
                log("Token coords: (" + token.get('left') + ", " + token.get('top'));
                log("Reticle coords: (" + reticleToken.get('left') + ", " + reticleToken.get('top'));
                if(token.get('left') + (token.get('width')/2) >= reticleToken.get('left') && 
                    token.get('left') - (token.get('width')/2) <= reticleToken.get('left') && 
                    token.get('top') + (token.get('height')/2) >= reticleToken.get('top') &&
                    token.get('top') - (token.get('height')/2) <= reticleToken.get('top'))
                    {
                        listSelectableGraphics.push(getObj('graphic', token.id))
                    }
            });
            log('List of selectable graphics: ' + listSelectableGraphics);
            reticleToken.remove();
            if(listSelectableGraphics.length > 1){
                var listTokenNames = [], listCommandNames = [];
                for(var i = 0; i<listSelectableGraphics.length; i++){
                    listTokenNames.push(listSelectableGraphics[i].get("name"));
                    listCommandNames.push("tokenfromlist " + i);
                }
                log("List of potential targets is more than one long!");
                promptButtonArray("Which token are you targeting?",listTokenNames,listCommandNames,currentPlayerDisplayName);
            }
            else if(listSelectableGraphics.length === 1){
                target = new tokenWrapper(listSelectableGraphics[0]);
                log("Target:" + target);
            }
            else{
                target = undefined;
                log("BattleMaster: No target found; tested " + testedEntries + " turn-tracker entries; reticle coordinates: (" + reticleLeft + ", " + reticleTop + ").");
                sendChat("BattleMaster", '/w ' + recipient + ' Nothing was found under the reticle. Only combatants in the turn tracker can be targeted.');
            }
        }
        else{
            target = undefined;
            sendChat("BattleMaster", '/w ' + recipient + ' The targeting reticle was lost. Please try the action again.');
        }
    };

    var HandleInput = function(msg_orig){
        var msg = _.clone(msg_orig),
			args,
            attr,
            amount,
            chr,
            token,
            text='',
            totamount;
        if (msg.type !== 'api' && !bIsWaitingOnRoll){
            return;
        }
        if(bIsWaitingOnRoll && msg.inlinerolls != undefined){
            //Call roll result here
            log("We have recieved a roll result!")
            var playerIDLocation = listPlayerIDsWaitingOnRollFrom.indexOf(msg.playerid);
            var recievedRoll = new rollData(msg);
            if(playerIDLocation >= 0){
                if(listRollCallbackFunctions[playerIDLocation](recievedRoll)){
                    listPlayerIDsWaitingOnRollFrom.splice(playerIDLocation,1);
                    listRollCallbackFunctions.splice(playerIDLocation,1);
                }
            }
            bIsWaitingOnRoll = (listPlayerIDsWaitingOnRollFrom.length > 0);
            return;
        }
        args = msg.content.split(/\s+/);//splits the message contents into discrete arguments
		switch(args[0]) {
		    case '!combat':
                if(['weaponattack', 'directspell', 'selectedTarget', 'tokenfromlist'].indexOf(args[1]) !== -1 &&
                    (!bInCombat || !currentTurnPlayer || !currentTurnToken || !currentTurnToken.token)){
                    reportRefusedCommand(msg, "Combat is not running with a current turn.");
                    return;
                }
		        switch(args[1]){
                    case 'cancel':
                        CancelPendingRolls(msg, args[2] === 'all');
                    break;
		            case 'roll':  //"!combat roll initiative"
		            case 'start': //legacy alias
		                StageInitiative();
                    break;
		            case 'begin': //"!combat begin round 1"
		                BeginCombat(args.slice(2).join(' '));
                    break;
		            case 'end':
		            case 'stop':  //legacy alias
		                EndCombat();
                    break;
                    case 'weaponattack': 
                                if(promptTarget()){
                                    selectedTokenCallbackFunction = WeaponAttack;
                                }
                    break;
                    case 'directspell': 
                                if(promptTarget()){
                                    selectedTokenCallbackFunction = DirectSpellAttack;
                                }
                    break;
                    case 'selectedTarget':
                        invokePendingCallback(msg, selectedTokenCallbackFunction, findTokenAtTarget);
                    break;
                    case 'tokenfromlist':
                        target = listSelectableGraphics[args[2]];
                    break;
                    case 'set':
                        if(args[2] === 'reticle'){
                            ConfigureReticle(msg, args[3]);
                        }
                        else{
                            sendChat("BattleMaster", '/w "' + (msg.who || 'Player') + '" Usage: !combat set reticle [URL] (or select an image token).');
                        }
                    break;
                    case 'reticleconfig': //legacy alias
                        ConfigureReticle(msg, args[2]);
                    break;
		            default:
                        reportRefusedCommand(msg, "Unknown command. Available: !combat begin, !combat end, !combat cancel, !combat set reticle.");
                    break;
		        }break;
		}
    },
    
    CancelPendingRolls = function(msg, cancelAll){
        var caller = getObj('player', msg.playerid);
        var recipient = caller ? caller.get('displayname') : (msg.who || 'Player');
        var whisper = '/w "' + recipient.replace(/"/g, '') + '" ';
        if(cancelAll && !playerIsGM(msg.playerid)){
            sendChat('BattleMaster', whisper + 'Only a GM can cancel all pending rolls.');
            return;
        }
        var cancelledRolls = 0, cancelledSaves = 0;
        var canClearPrompt = cancelAll || (currentTurnPlayer && currentTurnPlayer.id === msg.playerid);
        var hadPrompt = !!canClearPrompt && !!(selectedTokenCallbackFunction || reticleTokenId);
        for(var i = listPlayerIDsWaitingOnRollFrom.length - 1; i >= 0; i--){
            if(cancelAll || listPlayerIDsWaitingOnRollFrom[i] === msg.playerid){
                listPlayerIDsWaitingOnRollFrom.splice(i, 1);
                listRollCallbackFunctions.splice(i, 1);
                cancelledRolls++;
            }
        }
        for(var j = listTokensWaitingOnSavingThrowsFrom.length - 1; j >= 0; j--){
            var waitingTarget = listTokensWaitingOnSavingThrowsFrom[j];
            if(cancelAll || (waitingTarget &&
                findWhoIsControlling(waitingTarget.associatedCharacter) === msg.playerid)){
                listTokensWaitingOnSavingThrowsFrom.splice(j, 1);
                cancelledSaves++;
            }
        }
        if(canClearPrompt){
            selectedTokenCallbackFunction = undefined;
            var reticle = reticleTokenId ? getObj('graphic', reticleTokenId) : undefined;
            if(reticle){ reticle.remove(); }
            reticleTokenId = undefined;
        }
        bIsWaitingOnRoll = listPlayerIDsWaitingOnRollFrom.length > 0;
        // Keep target so a different action can use the same creature without re-aiming.
        if(!cancelledRolls && !cancelledSaves && !hadPrompt){
            sendChat('BattleMaster', whisper + 'There was nothing to cancel.');
            return;
        }
        sendChat('BattleMaster', whisper + 'Cancelled ' + (cancelAll ? 'everyone\'s' : 'your') +
            ' pending rolls (' + cancelledRolls + ') and saving-throw targets (' + cancelledSaves + ')' +
            (hadPrompt ? ', and cleared the outstanding prompts.' : '.'));
        var turnGraphic = findCurrentTurnToken(Campaign().get('turnorder'));
        if(canClearPrompt && turnGraphic && currentTurnToken && currentTurnToken.token &&
            currentTurnToken.token.id === turnGraphic.id && currentPlayerDisplayName){
            promptButtonArray("Select an action", generateTurnOptions(), generateTurnOptionCommands(), currentPlayerDisplayName);
        }
    },

    //Phase 1 of 3: "!combat roll initiative" - announce combat and enter the
    //staging phase. Tracker changes are IGNORED while staging, so initiative
    //rolls landing in the tracker don't fire spurious turn prompts.
    StageInitiative = function(){
        bInCombat = false;
        bStagingInitiative = true;
        bIsWaitingOnRoll = false;
        sLastPromptedTurnID = undefined;
        log('Combat staged - waiting on initiative.');
        sendChat("BattleMaster", "Roll for initiative!");
        sendChat("BattleMaster", "/w GM When the tracker is set and sorted, run <b>!combat begin round 1</b>");
    },

    //Phase 2 of 3: "!combat begin round 1" - turn processing goes live and
    //the first turn is prompted. Anything after "begin" is echoed to the
    //table as the announcement (e.g. "round 1").
    BeginCombat = function(announceLabel){
        var turnorder = Campaign().get('turnorder');
        var parsed = turnorder ? JSON.parse(turnorder) : [];
        var hasTokenEntry = _.some(parsed, function(entry){
            return entry.id !== "-1" && entry.id !== -1 && getObj('graphic', entry.id) !== undefined;
        });
        if(!hasTokenEntry){
            sendChat("BattleMaster", "/w GM The turn tracker has no combatant tokens yet - roll initiative first, then run !combat begin");
            return;
        }
        bStagingInitiative = false;
        bInCombat = true;
        iLastTurnorderLength = parsed.length;
        log('Combat begun!');
        sendChat("BattleMaster", "Combat begins" + (announceLabel ? " - " + announceLabel : "") + "!");
        TurnChange();
    },

    //Phase 3 of 3: "!combat end" - tear everything down, including any
    //pending roll interception so stray rolls aren't swallowed after combat.
    EndCombat = function(){
        bInCombat = false;
        bStagingInitiative = false;
        bIsWaitingOnRoll = false;
        sLastPromptedTurnID = undefined;
        iLastTurnorderLength = 0;
        listPlayerIDsWaitingOnRollFrom = [];
        listRollCallbackFunctions = [];
        listTokensWaitingOnSavingThrowsFrom = [];
        listTokensInEncounter = [];
        log('Combat ended!');
        sendChat("BattleMaster", "/w GM Combat Ended!")
    },
    
    TurnChange = function(){
        log('The turn has changed!');
        var turnorder;
        //Find all the information on whose turn it is
        log("Turnorder: " + Campaign().get('turnorder'));
        //Record the top entry we're processing so the change listener can
        //suppress duplicate events for the same turn (covers BeginCombat's
        //direct call too). Recorded even when we skip below, so an unlinked
        //token or custom entry doesn't re-warn on every tracker touch.
        var rawTurnorderForGuard = Campaign().get('turnorder');
        var parsedForGuard = rawTurnorderForGuard ? JSON.parse(rawTurnorderForGuard) : [];
        sLastPromptedTurnID = parsedForGuard.length > 0 ? parsedForGuard[0].id : undefined;
        var currentTurnGraphic = findCurrentTurnToken(Campaign().get('turnorder'));
        if(!currentTurnGraphic){
            log("No token at the top of the turn order (custom entry, empty tracker, or deleted token). Skipping turn prompts.");
            return;
        }
        currentTurnToken = new tokenWrapper(currentTurnGraphic);
        log("CurrentTurnToken: " + JSON.stringify(currentTurnToken));
        currentTurnCharacter = getObj('character',currentTurnToken.token.get('represents'));
        log("CurrentTurnCharacter: " + JSON.stringify(currentTurnCharacter));
        if(!currentTurnCharacter){
            sendChat('BattleMaster','/w gm Token "' + (currentTurnToken.name || 'unnamed') + '" isn\'t linked to a character sheet, so BattleMaster can\'t run its turn. Set "Represents Character" on the token and re-add it to the tracker.');
            return;
        }
        currentTurnPlayer = getObj('player',findWhoIsControlling(currentTurnCharacter));
        log("CurrentTurnPlayer: " + JSON.stringify(currentTurnPlayer));
        if(!currentTurnPlayer){
            log("ERROR: couldn't resolve a controlling player for the current turn. Skipping turn prompts.");
            return;
        }
        currentPlayerDisplayName = currentTurnPlayer.get('displayname');
        if (!turnorder) 
			{turnorder = Campaign().get('turnorder');}
		if (!turnorder) 
			{return undefined;}
		if (typeof(turnorder) === 'string')
			{turnorder = JSON.parse(turnorder);}
        //Reset all the variables for the new turn
        ResetCharacterTurnValues(currentTurnCharacter);
        ResetUnspecificTurnValues();
        _.each(turnorder, function(current){
            //Only real, still-existing tokens join the encounter list: skip
            //custom entries (id "-1") and entries whose token was deleted.
            if(current.id === "-1" || current.id === -1){ return; }
            var entryGraphic = getObj("graphic", current.id);
            if(!entryGraphic){ return; }
            listTokensInEncounter.push(new tokenWrapper(entryGraphic));
        });
        log('It\'s now ' + currentTurnCharacter.get('name') + '\'s turn!' );
        log('This character is controlled by player ' + currentTurnPlayer.get('displayname'))
        sendChat('BattleMaster','/w "'+ currentTurnPlayer.get('displayname') + '" It\'s your turn as ' + currentTurnToken.name);
        promptButtonArray("Select an action", generateTurnOptions(),generateTurnOptionCommands(), currentPlayerDisplayName);
    },
    
    ResetCharacterTurnValues = function(currentTurnCharacter){
        
    },
    
    ResetUnspecificTurnValues = function(){
        listSelectableGraphics = [];
        sPreviousAction = "";
        sPreviousBonusAction = "";
        listTokensInEncounter = [];
    },
    
    universalizeString = function(string){
        if(typeof string !== "string"){ return ""; }
        var tempString = string.toLowerCase().trim();
        return tempString.replace(/\s/g, "");
    },
    
    WeaponAttack = function(){
        if(target != undefined){
            log('Weapon attacking at ' + target.name);
            sendChat("BattleMaster", '/w "' + currentPlayerDisplayName + '" ' + "Now attempting to attack " + target.name + ". Please roll your weapon attack from your character sheet.");
            listRollCallbackFunctions.push(WeaponAttackRollCallback);
            listPlayerIDsWaitingOnRollFrom.push(currentTurnPlayer.id);
            bIsWaitingOnRoll = true;
        }
        else{
            log('Tried to attack with weapon, but no target was selected!');
            sendChat("BattleMaster", '/w "' + currentPlayerDisplayName + '" No target is selected! Please select a target!');
            if(promptTarget()){
                selectedTokenCallbackFunction = WeaponAttack;
            }
        }
    },
    
    WeaponAttackRollCallback = function(rollData){
        var toHit = safeRollTotal(rollData.d20Rolls[0]);
        if(toHit === undefined){
            reportMissingRoll("The to-hit roll was not present in the message or was unreadable; roll the attack from your character sheet again so it can be adjudicated.");
            return false;
        }
        if(target.ac <= toHit){
            log("Hit! Enemy AC is " + target.ac + " and roll result was " + toHit);
            sendChat("BattleMaster", '/w "' + currentPlayerDisplayName + '" Hit! Target: ' + target.name);
            var damage = safeRollTotal(rollData.dmgRolls[0]);
            var secondaryDamage = safeRollTotal(rollData.dmgRolls[1]);
            if(damage === undefined || (rollData.dmgRolls.length > 1 && secondaryDamage === undefined)){
                reportMissingRoll("The damage roll was not present in the message or was unreadable; enable your sheet's \"Auto Roll Damage & Crit\" setting (the usual cause) and retry the attack.");
                return false;
            }
            applyDamage(damage, rollData.dmgTypes[0], target.token, target.associatedCharacter);
            if(secondaryDamage !== undefined && secondaryDamage != 0){
                applyDamage(secondaryDamage, rollData.dmgTypes[1], target.token, target.associatedCharacter);
            }
            spawnFx(target.token.get('left'), target.token.get('top'), 'glow-blood');
        }
        else{
            log("Miss! Enemy AC is " + target.ac + " and roll result was " + toHit);
            sendChat("BattleMaster", '/w "' + currentPlayerDisplayName + '" Miss!');
        }
        return true;
    },
    
    DirectSpellAttack = function(){
        if(target != undefined){
            log('Direct spell attacking at ' + target.name);
            sendChat("BattleMaster", '/w "' + currentPlayerDisplayName + '" ' + "Now attempting to attack " + target.name + ". Please roll your spell attack from your character sheet.");
            listRollCallbackFunctions.push(DirectSpellRollCallback);
            log("Current turn player: " + currentTurnPlayer);
            listPlayerIDsWaitingOnRollFrom.push(currentTurnPlayer.id);
            bIsWaitingOnRoll = true;
        }
        else{
            log('Tried to attack with direct spell, but no target was selected!');
            sendChat("BattleMaster", '/w "' + currentPlayerDisplayName + '" No target is selected! Please select a target!');
            if(promptTarget()){
                selectedTokenCallbackFunction = DirectSpellAttack;
            }
        }
    },

    DirectSpellRollCallback = function(rollData){
        if(rollData.bRequiresSavingThrow){
            var spellDamage = safeRollTotal(rollData.dmgRolls[0]);
            var spellDC = safeRollTotal(rollData.dc);
            if(spellDamage === undefined){
                reportMissingRoll("The damage roll was not present in the message or was unreadable; enable your sheet's \"Auto Roll Damage & Crit\" setting (the usual cause) and retry the attack.");
                return false;
            }
            if(typeof spellDC !== "number" || !isFinite(spellDC)){
                reportMissingRoll("The spell save DC was not present in the message or was unreadable; roll the spell again with its save DC included.");
                return false;
            }
            currentlyCastingSpellRoll = rollData;
            log("Saving throw spell!");
            var playerID = findWhoIsControlling(target.associatedCharacter);
            var player = getObj('player', playerID);
            var recipient = player ? '"' + player.get('displayname') + '"' : 'GM';
            if(!player){
                log("BattleMaster: No controlling player was resolvable for the saving throw; whispering GM.");
            }
            sendChat("BattleMaster", '/w ' + recipient + ' Please roll a ' + rollData.saveType + ' saving throw for ' + target.get("name"));
            listPlayerIDsWaitingOnRollFrom.push(playerID);
            listRollCallbackFunctions.push(SavingThrowAgainstDamageRollCallback);
            listTokensWaitingOnSavingThrowsFrom.push(target);
        }
        else{
            log("Spell attack!");
            var toHit = safeRollTotal(rollData.d20Rolls[0]);
            if(toHit === undefined){
                reportMissingRoll("The to-hit roll was not present in the message or was unreadable; roll the attack from your character sheet again so it can be adjudicated.");
                return false;
            }
            var ac = getAttrByName(target.get('represents'),'npcd_ac');
            if(ac === "" || ac === undefined){
                log('Couldn\'t find npcd_ac, looking for just ac')
                ac = getAttrByName(target.get('represents'),'ac');
            }
            if(ac <= toHit){
                log("Hit! Enemy AC is " + ac + " and roll result was " + toHit);
                sendChat("BattleMaster", '/w "' + currentPlayerDisplayName + '" Hit! Target: ' + target.get('name'));
                var damage = safeRollTotal(rollData.dmgRolls[0]);
                var secondaryDamage = safeRollTotal(rollData.dmgRolls[1]);
                if(damage === undefined || (rollData.dmgRolls.length > 1 && secondaryDamage === undefined)){
                    reportMissingRoll("The damage roll was not present in the message or was unreadable; enable your sheet's \"Auto Roll Damage & Crit\" setting (the usual cause) and retry the attack.");
                    return false;
                }
                applyDamage(damage, rollData.dmgTypes[0], target.token, target.associatedCharacter);
                if(secondaryDamage !== undefined && secondaryDamage != 0){
                    applyDamage(secondaryDamage, rollData.dmgTypes[1], target.token, target.associatedCharacter);
                }
            }
        }
        return true;
    },
    
    distanceToPixels = function(dist) {
	    var PIX_PER_UNIT = 70;
	    var page = getObj('page', Campaign().get('playerpageid'));
        var scale = page && Number(page.get('scale_number'));
        if(!scale || !isFinite(scale) || scale < 0 || !isFinite(PIX_PER_UNIT * (dist/scale))){
            // Default to the usual 5 units per square so missing page settings remain usable in arithmetic.
            log("BattleMaster: Missing page or unusable scale_number; using 5 units per square.");
            scale = 5;
        }
        return PIX_PER_UNIT * (dist/scale);
    },  
    
    SavingThrowAgainstDamageRollCallback = function(rollData){
        for(var i = 0; i < listTokensWaitingOnSavingThrowsFrom.length; i++){
            if(!listTokensWaitingOnSavingThrowsFrom[i]){
                log("BattleMaster: Empty saving-throw queue entry; skipping it.");
                continue;
            }
            if(findWhoIsControlling(listTokensWaitingOnSavingThrowsFrom[i].associatedCharacter) === rollData.playerid){
                var token = listTokensWaitingOnSavingThrowsFrom[i];
                break;
            }
        }
        var savingThrowRoll = safeRollTotal(rollData.d20Rolls[0]);
        if(savingThrowRoll === undefined){
            reportMissingRoll("The saving throw roll was not present in the message or was unreadable; roll the saving throw again from your character sheet.");
            return false;
        }

        //Past this point every exit consumes the roll expectation, so consume the
        //target with it. Leaving a stale entry here would make the next valid save
        //from this player match the OLD token and resolve against the wrong target.
        if(token){
            listTokensWaitingOnSavingThrowsFrom.splice(i,1);
        }
        if(!currentlyCastingSpellRoll){
            reportMissingRoll("The spell data was not present; ask the caster to recast the spell before you retry the saving throw.");
            //Caster-fault: the player receiving this cannot fix it by rolling
            //again, so consume the expectation rather than trapping them in it.
            return true;
        }
        var rollEffectsDesc = currentlyCastingSpellRoll.saveEffects,
        rollDmg = safeRollTotal(currentlyCastingSpellRoll.dmgRolls[0]),
        rollDmgType = currentlyCastingSpellRoll.dmgTypes[0],
        rollDC = safeRollTotal(currentlyCastingSpellRoll.dc);
        if(typeof rollDC !== "number" || !isFinite(rollDC)){
            reportMissingRoll("The spell save DC was not present in the message or was unreadable; ask the caster to recast the spell with its save DC included.");
            //Caster-fault: the player receiving this cannot fix it by rolling
            //again, so consume the expectation rather than trapping them in it.
            return true;
        }
        if(rollDmg === undefined){
            reportMissingRoll("The spell damage roll was not present in the message or was unreadable; ask the caster to recast the spell with damage included.");
            //Caster-fault: the player receiving this cannot fix it by rolling
            //again, so consume the expectation rather than trapping them in it.
            return true;
        }
        if(!token){
            reportMissingRoll("No target was waiting for this saving throw; ask the caster to select the intended target and recast the spell.");
            //Caster-fault: the player receiving this cannot fix it by rolling
            //again, so consume the expectation rather than trapping them in it.
            return true;
        }
        sendChat("BattleMaster",'/w "' + currentPlayerDisplayName +'" Recieved roll for ' + token.token.get("name"));
        if(savingThrowRoll >= rollDC){
            //SAVING THROW EFFECTS GO HERE
            switch(universalizeString(rollEffectsDesc)){
                case "halfdamage":
                    applyDamage(rollDmg/2, rollDmgType, token.token, token.associatedCharacter);
                break;

                default: break;
            }
        }
        else{
            applyDamage(rollDmg, rollDmgType, token.token, token.associatedCharacter);
        }
        return true;
    },
    
    applyDamage = function(dmgAmt, dmgType, targetToken, targetCharacter){
        log("Applying " + dmgAmt +" " +  dmgType + " damage to " + targetToken.get('name'));
        if(!targetCharacter){
            log("BattleMaster: No linked character for " + targetToken.get('name') + "; applying damage without immunities, resistances or vulnerabilities.");
        }
        var immunitiesRaw = targetCharacter ? getAttrByName(targetCharacter.id,"npc_immunities") : undefined,
        resistancesRaw = targetCharacter ? getAttrByName(targetCharacter.id,"npc_resistances") : undefined,
        vulnerabilitiesRaw = targetCharacter ? getAttrByName(targetCharacter.id,"npc_vulnerabilities") : undefined;
        var damageType = universalizeString(dmgType);
        if(!damageType){
            immunitiesRaw = resistancesRaw = vulnerabilitiesRaw = undefined;
        }
        var hp = targetToken.get('bar3_value');
        if(hp == null || String(hp).trim() === '' || !isFinite(Number(hp))){
            var message = targetToken.get('name') + " has no usable HP bar (bar3), so " + dmgAmt + " damage was not applied. Set the token's bar3 to a number.";
            sendChat("BattleMaster", "/w GM " + message);
            log("BattleMaster: " + message);
            return;
        }
        var tempHP = Number(targetToken.get('bar2_value'));
        if(!isFinite(tempHP)){
            tempHP = 0;
        }
        if(immunitiesRaw != undefined && universalizeString(immunitiesRaw).indexOf(damageType) != -1){
            return;
        } 
        else if(tempHP > 0){
            if(vulnerabilitiesRaw != undefined && universalizeString(vulnerabilitiesRaw).indexOf(damageType) != -1){
                if(tempHP >= Math.floor(2*dmgAmt)){
                    targetToken.set('bar2_value', tempHP - Math.floor(2*dmgAmt));
                }
                else{
                    targetToken.set('bar2_value', 0);
                    var dmgLeft = Math.floor(2*dmgAmt) - tempHP;
                    targetToken.set('bar3_value', targetToken.get('bar3_value') - dmgLeft);
                }
                return;
            }
            else if(resistancesRaw != undefined && universalizeString(resistancesRaw).indexOf(damageType) != -1){
                log(targetCharacter.get('name') + " has resistance to " + dmgType +" damage!")
                if(tempHP >= Math.floor(dmgAmt/2)){
                    targetToken.set('bar2_value', tempHP - Math.floor(dmgAmt/2));
                }
                else{
                    targetToken.set('bar2_value', 0);
                    var dmgLeft = Math.floor(dmgAmt/2) - tempHP;
                    targetToken.set('bar3_value', targetToken.get('bar3_value') - dmgLeft);
                }
                
                return;
            }
            else{
                if(tempHP >= Math.floor(dmgAmt)){
                    targetToken.set('bar2_value', tempHP - Math.floor(dmgAmt));
                }
                else{
                    targetToken.set('bar2_value', 0);
                    var dmgLeft = Math.floor(dmgAmt) - tempHP;
                    targetToken.set('bar3_value', targetToken.get('bar3_value') - dmgLeft);
                }
                return;
            }
        }
        else{
            if(targetToken.get('bar2_value') === 0 || targetToken.get('bar2_value') === '0'){
                targetToken.set('bar2_value', 0);
            }
            if(vulnerabilitiesRaw != undefined && universalizeString(vulnerabilitiesRaw).indexOf(damageType) != -1){
                targetToken.set('bar3_value', targetToken.get('bar3_value') - Math.floor(2*dmgAmt));
                return;
            }
            else if(resistancesRaw != undefined && universalizeString(resistancesRaw).indexOf(damageType) != -1){
                log(targetCharacter.get('name') + " has resistance to " + dmgType +" damage!")
                targetToken.set('bar3_value', targetToken.get('bar3_value') - Math.floor(dmgAmt/2));
                return;
            }
            else{
                targetToken.set('bar3_value', targetToken.get('bar3_value') - Math.floor(dmgAmt));
            }
        }
    },

    generateTurnOptions = function(){
        
        //Add class specific options as well!
        var optionsToReturn = [
            'Weapon Attack',
            'Direct Spell'
        ];
        return optionsToReturn;
    },

    generateTurnOptionCommands = function(){
        var optionsToReturn = [
            'weaponattack',
            'directspell'
        ];
        return optionsToReturn;
    },
    
    RegisterEventHandlers = function(){
        state.BattleMaster = state.BattleMaster || {};
        buildTemplates();
        on('chat:message', HandleInput);
        on('change:campaign:turnorder', function(){
            //Staging (initiative gathering) and inactive: ignore all changes.
            if(!bInCombat){
                return;
            }
            var turnorder = Campaign().get('turnorder');
            var parsed = turnorder ? JSON.parse(turnorder) : [];
            //Growth guard: gaining entries means an addition (initiative
            //roll, mid-fight summon), never a turn advance - a real advance
            //is a rotation that keeps the length constant. Never prompt on
            //growth; the new arrival gets its turn when the tracker rotates.
            if(parsed.length > iLastTurnorderLength){
                iLastTurnorderLength = parsed.length;
                return;
            }
            iLastTurnorderLength = parsed.length;
            //Top-unchanged guard: re-sorts, edits, and removals below the
            //top slot shouldn't re-prompt the same combatant.
            var topID = parsed.length > 0 ? parsed[0].id : undefined;
            if(topID !== undefined && topID === sLastPromptedTurnID){
                return;
            }
            TurnChange();
        });
    };
    return {
        BuildRev: buildRev,
        RegisterEventHandlers: RegisterEventHandlers,
    };
}());
on('ready',function(){
    'use strict';
    
    log('-=> BattleMaster ' + BattleMaster.BuildRev + ' <=- [' + new Date() + ']');
    BattleMaster.RegisterEventHandlers();
});
