var BigHouse = (function() {
    var proto = function (config) {
        config = config || {}
        $.extend (this, config)
        this.container = $('#'+this.containerID)
            .addClass("bighouse")
	var ls
	try {
	    ls = JSON.parse (localStorage.getItem (this.localStorageKey))
	} catch (err) {
	    ls = null
	}
	if (ls)
            this.playerName = ls.name
        this.socket_onPlayer ($.proxy (this.handlePlayerMessage, this))
        this.showLoginPage()
    }

    $.extend (proto.prototype, {
        // default params/data
        containerID: 'bighouse',
        localStorageKey: 'bighouse',
        moods: ['happy', 'surprised', 'angry', 'sad'],
        
        // REST interface
        REST_postPlayer: function (playerName, playerPassword) {
            return $.post('/player', { name: playerName, password: playerPassword })
        },

        REST_postLogin: function (playerName, playerPassword) {
            return $.post('/login', { name: playerName, password: playerPassword })
        },

        REST_getLogout: function() {
            return $.post('/logout')
        },

        REST_getPlayerCancel: function (playerID) {
            return $.get ('/player/' + playerID + '/cancel')
        },

        REST_getPlayerStats: function (playerID) {
            return $.get ('/player/' + playerID + '/stats')
        },

        REST_getPlayerStats: function (playerID) {
            return $.get ('/player/' + playerID + '/stats')
        },

        REST_getPlayerGameMoveMood: function (playerID, gameID, move, mood) {
            return $.get ('/player/' + playerID + '/game/' + gameID + '/move/' + move + '/mood/' + mood)
        },

        REST_urlPlayerAvatar: function (playerID, mood) {
            return '/player/' + playerID + '/avatar/' + mood
        },

        REST_postPlayerAvatar: function (playerID, mood, blob) {
            var url = '/player/' + playerID + '/avatar/' + mood
	    var formData = new FormData()
	    formData.append ('avatar', blob)
	    return $.ajax ({ url: url,
			     type: 'POST',
			     cache: false,
			     contentType: false,
			     processData: false,
			     data: formData })
        },

        // WebSockets interface
        socket_onPlayer: function (callback) {
            io.socket.on ('player', callback)
        },

        socket_getPlayerJoin: function (playerID) {
            return this.socketGetPromise ('/player/' + playerID + '/join')
        },

        socket_getPlayerGame: function (playerID, gameID) {
            return this.socketGetPromise ('/player/' + playerID + '/game/' + gameID)
        },

        socket_getPlayerGameMoveChoice: function (playerID, gameID, move, choice) {
            return this.socketGetPromise ('/player/' + playerID + '/game/' + gameID + '/move/' + move + '/choice/' + choice)
        },

        // helper to convert socket callbacks to promises
        socketGetPromise: function (url) {
            var def = $.Deferred()
            io.socket.get (url, function (resData, jwres) {
                if (jwres.statusCode == 200)
                    def.resolve (resData)
                else
                    def.reject (jwres)
            })
            return def
        },

        // helpers
        makeLink: function (text, callback) {
            var cb = $.proxy (callback, this)
            return $('<a href="#">')
                .text (text)
                .on ('click', function (evt) {
                    evt.preventDefault()
                    cb(evt)
                })
        },

        makeListLink: function (text, callback) {
            var cb = $.proxy (callback, this)
            return $('<li>')
                .append ($('<span>')
                         .text(text))
                .on('click', function (evt) {
                    cb(evt)
                })
        },

        // login menu
        showLoginPage: function() {
            this.page = 'login'
            this.container
                .empty()
                .append ($('<div class="inputbar">')
                         .append ($('<form>')
                                  .append ($('<label for="player">')
                                           .text('Player name'))
                                  .append (this.nameInput = $('<input name="player" type="text">'))
                                  .append ($('<label for="player">')
                                           .text('Password'))
                                  .append (this.passwordInput = $('<input name="password" type="password">'))))
                .append ($('<div class="menubar">')
                         .append ($('<div>')
                                  .append ($('<ul>')
                                           .append (this.makeListLink ('Log in', this.doLogin))
                                           .append (this.makeListLink ('Create player', this.createPlayer)))))
            if (this.playerName)
                this.nameInput.val (this.playerName)
        },

        validatePlayerName: function() {
            this.playerName = this.nameInput.val()
            this.playerPassword = this.passwordInput.val()
            this.playerName = this.playerName.replace(/^\s*/,'').replace(/\s*$/,'')
            if (!/\S/.test(this.playerName)) {
                this.showModalMessage ("Please enter a player name")
                return false
            }
            if (!/\S/.test(this.playerPassword)) {
                this.showModalMessage ("Please enter a password")
                return false
            }
            localStorage.setItem (this.localStorageKey,
				  JSON.stringify ({ name: this.playerName }))
            return true
        },
        
        doLogin: function() {
            var bh = this
            if (this.validatePlayerName())
                this.REST_postLogin (this.playerName, this.playerPassword)
                .done (function (data) {
		    if (!data.player)
                        bh.showModalMessage (data.message)
		    else {
			bh.playerID = data.player.id
			bh.showPlayPage()
		    }
                })
                .fail (function (err) {
                    bh.showModalWebError (err)
                })
        },

        createPlayer: function() {
            var bh = this
            if (this.validatePlayerName())
                this.REST_postPlayer (this.playerName, this.playerPassword)
                .done (function (data) {
		    bh.doLogin()
                })
                .fail (function (err) {
                    bh.showModalWebError (err)
                })
        },

        showModalMessage: function (msg) {
            alert (msg)
        },

        showModalWebError: function (err) {
            this.showModalMessage (err.status + " " + err.statusText)
        },
        
        // play menu
        showPlayPage: function() {
            var bh = this
            var cashDiv

            this.page = 'play'
            this.container
                .empty()
                .append ($('<div class="statusbar">')
                         .append (this.playerMoodDiv = $('<div class="leftmood">'))
                         .append ($('<div class="leftstatus">')
                                  .append ($('<span>')
                                           .text (this.playerName)))
                         .append ($('<div class="midstatus">')
                                  .append (this.playerCashDiv = $('<span>'))))
                .append (this.menuDiv = $('<div class="menubar">')
                         .append ($('<ul>')
                                  .append (this.makeListLink ('Play game', this.joinGame))
                                  .append (this.makeListLink ('Settings', this.showSettingsPage))
                                  .append (this.makeListLink ('Log out', this.doLogout))))
            
            this.REST_getPlayerStats (this.playerID)
                .done (function (data) {
                    bh.playerCashDiv.text ("Score: $" + data.cash)
                })
        },

	// log out
        doLogout: function() {
            var bh = this
            this.REST_getLogout()
	    this.showLoginPage()
        },

        // settings menu
        showSettingsPage: function() {
            var bh = this

            this.page = 'settings'
            this.container
                .empty()
                .append ($('<div class="inputbar">'))
                .append ($('<div class="menubar">')
                         .append ($('<ul>')
                                  .append (this.makeListLink ('Upload photos', this.showUploadPage))
                                  .append (this.makeListLink ('Back', this.showPlayPage))))
        },

        // avatar upload page
        showUploadPage: function() {
            var bh = this

            this.page = 'upload'
            this.moodDiv = []
            this.container
                .empty()
                .append ($('<div class="statusbar">')
			 .append($('<div class="midstatus">')
				 .append($('<span>')
					 .append($('<big>')
						 .text ("Upload photos")))))
                .append (this.menuDiv = $('<div class="menubar">')
			 .append ($('<span>')
				  .text("Select one of the images below to upload a photo"))
                         .append ($('<ul>')
                                  .append (this.makeListLink ('Back', this.showSettingsPage))))
                .append (this.moodBar = $('<div class="moodbar">'))
		.append (this.moodFileInput = $('<input type="file" style="display:none;">'))

	    this.moods.forEach (function (mood, m) {
		var moodClass = "mood" + (m+1)
		var img = bh.makeMoodImage (bh.playerID, mood)
		var div = $('<div>')
		    .addClass(moodClass)
		    .html (img)
		div.on ('click', bh.uploadMoodPhotoFunction (mood, div))
		bh.moodBar.append (div)
                bh.moodDiv.push (div)
            })
        },

	makeMoodImage: function (id, mood) {
	    return $('<img>')
		.attr ('width', '100%')
		.attr ('height', '100%')
		.attr ('src', this.REST_urlPlayerAvatar (id, mood))
	},

	reloadMoodImage: function (id, mood) {
	    this.forceImgReload (this.REST_urlPlayerAvatar (id, mood))
	},

	uploadMoodPhotoFunction: function (mood, div) {
	    var bh = this
	    return function (clickEvt) {
		bh.moodFileInput.on ('change', function (fileSelectEvt) {
		    bh.moodFileInput.off()
		    var file = this.files[0]
		    var reader = new FileReader()
		    reader.onload = function (fileLoadEvt) {
			var arrayBuffer = reader.result
			var blob = new Blob ([arrayBuffer], {type:file.type})
			bh.REST_postPlayerAvatar (bh.playerID, mood, blob)
			    .then (function (data) {
				// refresh image
				// this probably won't work unless cache is disabled
				div.html (bh.makeMoodImage (bh.playerID, mood))
				// this, however, should do it
				bh.reloadMoodImage (bh.playerID, mood)
			    })
			    .fail (function (err) {
				bh.showModalWebError (err)
			    })
		    }
		    reader.readAsArrayBuffer (file)
		})
		bh.moodFileInput.click()
		return false
	    }
	},

	// force image reload
	// http://stackoverflow.com/questions/1077041/refresh-image-with-a-new-one-at-the-same-url/22429796#22429796
	// Force an image to be reloaded from the server, bypassing/refreshing the cache.
	// due to limitations of the browser API, this actually requires TWO load attempts - an initial load into a hidden iframe, and then a call to iframe.contentWindow.location.reload(true);
	// If image is from a different domain (i.e. cross-domain restrictions are in effect, you must set isCrossDomain = true, or the script will crash!
	// imgDim is a 2-element array containing the image x and y dimensions, or it may be omitted or null; it can be used to set a new image size at the same time the image is updated, if applicable.
	// if "twostage" is true, the first load will occur immediately, and the return value will be a function
	// that takes a boolean parameter (true to proceed with the 2nd load (including the blank-and-reload procedure), false to cancel) and an optional updated imgDim.
	// This allows you to do the first load early... for example during an upload (to the server) of the image you want to (then) refresh.
	forceImgReload: function(src, isCrossDomain, imgDim, twostage)
	{
	    var bh = this
	    var blankList, step = 0,                                // step: 0 - started initial load, 1 - wait before proceeding (twostage mode only), 2 - started forced reload, 3 - cancelled
	    iframe = window.document.createElement("iframe"),   // Hidden iframe, in which to perform the load+reload.
	    loadCallback = function(e)                          // Callback function, called after iframe load+reload completes (or fails).
	    {                                                   // Will be called TWICE unless twostage-mode process is cancelled. (Once after load, once after reload).
		if (!step)  // initial load just completed.  Note that it doesn't actually matter if this load succeeded or not!
		{
		    if (twostage) step = 1;  // wait for twostage-mode proceed or cancel; don't do anything else just yet
		    else { step = 2; blankList = bh.imgReloadBlank(src); iframe.contentWindow.location.reload(true); }  // initiate forced-reload
		}
		else if (step===2)   // forced re-load is done
		{
		    bh.imgReloadRestore(src,blankList,imgDim,(e||window.event).type==="error");    // last parameter checks whether loadCallback was called from the "load" or the "error" event.
		    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
		}
	    }
	    iframe.style.display = "none";
	    window.parent.document.body.appendChild(iframe);    // NOTE: if this is done AFTER setting src, Firefox MAY fail to fire the load event!
	    iframe.addEventListener("load",loadCallback,false);
	    iframe.addEventListener("error",loadCallback,false);
	    iframe.src = (isCrossDomain ? "/echoimg.php?src="+encodeURIComponent(src) : src);  // If src is cross-domain, script will crash unless we embed the image in a same-domain html page (using server-side script)!!!
	    return (twostage
		    ? function(proceed,dim)
		    {
			if (!twostage) return;
			twostage = false;
			if (proceed)
			{
			    imgDim = (dim||imgDim);  // overwrite imgDim passed in to forceImgReload() - just in case you know the correct img dimensions now, but didn't when forceImgReload() was called.
			    if (step===1) { step = 2; blankList = bh.imgReloadBlank(src); iframe.contentWindow.location.reload(true); }
			}
			else
			{
			    step = 3;
			    if (iframe.contentWindow.stop) iframe.contentWindow.stop();
			    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
			}
		    }
		    : null);
	},

	// This function should blank all images that have a matching src, by changing their src property to /assets/images/1x1blank.png.
	// ##### You should code the actual contents of this function according to your page design, and what images there are on them!!! #####
	// Optionally it may return an array (or other collection or data structure) of those images affected.
	// This can be used by imgReloadRestore() to restore them later, if that's an efficient way of doing it (otherwise, you don't need to return anything).
	// NOTE that the src argument here is just passed on from forceImgReload(), and MAY be a relative URI;
	// However, be aware that if you're reading the src property of an <img> DOM object, you'll always get back a fully-qualified URI,
	// even if the src attribute was a relative one in the original HTML.  So watch out if trying to compare the two!
	// NOTE that if your page design makes it more efficient to obtain (say) an image id or list of ids (of identical images) *first*, and only then get the image src,
	// you can pass this id or list data to forceImgReload() along with (or instead of) a src argument: just add an extra or replacement parameter for this information to
	// this function, to imgReloadRestore(), to forceImgReload(), and to the anonymous function returned by forceImgReload() (and make it overwrite the earlier parameter variable from forceImgReload() if truthy), as appropriate.
	imgReloadBlank: function(src)
	{
	    // ##### Everything here is provisional on the way the pages are designed, and what images they contain; what follows is for example purposes only!
	    // ##### For really simple pages containing just a single image that's always the one being refreshed, this function could be as simple as just the one line:
	    // ##### document.getElementById("myImage").src = "/assets/images/1x1blank.png";

	    var blankList = [],
	    fullSrc = window.location.href + src.substr(1) /* Fully qualified (absolute) src - i.e. prepend protocol, server/domain, and path if not present in src */,
	    imgs, img, i;

	    // get list of matching images:
	    imgs = window.document.body.getElementsByTagName("img");
	    for (i = imgs.length; i--;) if ((img = imgs[i]).src===fullSrc)  // could instead use body.querySelectorAll(), to check both tag name and src attribute, which would probably be more efficient, where supported
	    {
		img.src = "/assets/images/1x1blank.png";  // blank them
		blankList.push(img);            // optionally, save list of blanked images to make restoring easy later on
	    }

	    // for each (/* img DOM node held only by javascript, for example in any image-caching script */) if (img.src===fullSrc)
//	    {
//		img.src = "/assets/images/1x1blank.png";   // do the same as for on-page images!
//		blankList.push(img);
//	    }

	    // ##### If necessary, do something here that tells all accessible windows not to create any *new* images with src===fullSrc, until further notice,
	    // ##### (or perhaps to create them initially blank instead and add them to blankList).
	    // ##### For example, you might have (say) a global object window.top.blankedSrces as a propery of your topmost window, initially set = {}.  Then you could do:
	    // #####
	    // #####     var bs = window.top.blankedSrces;
	    // #####     if (bs.hasOwnProperty(src)) bs[src]++; else bs[src] = 1;
	    // #####
	    // ##### And before creating a new image using javascript, you'd first ensure that (blankedSrces.hasOwnProperty(src)) was false...
	    // ##### Note that incrementing a counter here rather than just setting a flag allows for the possibility that multiple forced-reloads of the same image are underway at once, or are overlapping.

	    return blankList;   // optional - only if using blankList for restoring back the blanked images!  This just gets passed in to imgReloadRestore(), it isn't used otherwise.
	},

	// This function restores all blanked images, that were blanked out by imgReloadBlank(src) for the matching src argument.
	// ##### You should code the actual contents of this function according to your page design, and what images there are on them, as well as how/if images are dimensioned, etc!!! #####
	imgReloadRestore: function(src,blankList,imgDim,loadError)
	{
	    // ##### Everything here is provisional on the way the pages are designed, and what images they contain; what follows is for example purposes only!
	    // ##### For really simple pages containing just a single image that's always the one being refreshed, this function could be as simple as just the one line:
	    // ##### document.getElementById("myImage").src = src;

	    // ##### if in imgReloadBlank() you did something to tell all accessible windows not to create any *new* images with src===fullSrc until further notice, retract that setting now!
	    // ##### For example, if you used the global object window.top.blankedSrces as described there, then you could do:
	    // #####
	    // #####     var bs = window.top.blankedSrces;
	    // #####     if (bs.hasOwnProperty(src)&&--bs[src]) return; else delete bs[src];  // return here means don't restore until ALL forced reloads complete.

	    var i, img, width = imgDim&&imgDim[0], height = imgDim&&imgDim[1];
	    if (width) width += "px";
	    if (height) height += "px";

	    if (loadError) {/* If you want, do something about an image that couldn't load, e.g: src = "/img/brokenImg.jpg"; or alert("Couldn't refresh image from server!"); */}

	    // If you saved & returned blankList in imgReloadBlank(), you can just use this to restore:

	    for (i = blankList.length; i--;)
	    {
		(img = blankList[i]).src = src;
		if (width) img.style.width = width;
		if (height) img.style.height = height;
	    }
	},

        // join game
        joinGame: function() {
            var bh = this
            this.socket_getPlayerJoin (this.playerID)
                .done (function (data) {
                    if (data.waiting)
                        bh.showWaitingToJoinPage()
                })
        },

        showWaitingToJoinPage: function() {
            var bh = this
            this.page = 'waitingToJoin'
            this.menuDiv
                .empty()
                .append ($('<span>')
                         .text ("Waiting for another player"))
                .append ($('<ul>')
                         .append (this.makeListLink ('Cancel', this.cancelJoin)))
        },

        cancelJoin: function() {
            var bh = this
            this.REST_getPlayerCancel (this.playerID)
                .done ($.proxy (this.showPlayPage, this))
                .fail ($.proxy (this.showModalWebError, this))
        },

        // game pages
        showGamePage: function() {
            var bh = this

            if (this.page == 'game') {
                // page is already initialized
            } else {
                this.page = 'game'
                this.moodDiv = []
                this.moodImg = []
                this.container
                    .empty()
                    .append ($('<div class="statusbar">')
                             .append (this.playerMoodDiv = $('<div class="leftmood">'))
                             .append ($('<div class="leftstatus">')
                                      .append ($('<span>')
                                               .text (this.playerName)))
                             .append ($('<div class="midstatus">')
                                      .append (this.playerCashDiv = $('<span>')))
                             .append ($('<div class="rightstatus">')
                                      .append (this.opponentNameDiv = $('<span>')))
                             .append (this.opponentMoodDiv = $('<div class="rightmood">'))
                             .append ($('<div class="quit">')
                                      .append ($('<span>')
                                               .html (this.quitLink = this.makeLink ('Exit', this.showPlayPage)))))
                    .append ($('<div class="cardbar">')
                             .append ($('<div class="cardtable">')
                                      .append (this.stackList = $('<ul class="stack">'))))
                    .append ($('<div class="choicebar">')
                             .append (this.choiceDiv = $('<div>')
                                      .append (this.choice1Div = $('<div class="choice1">'))
                                      .append (this.choice2Div = $('<div class="choice2">')))
                             .append (this.nextDiv = $('<div>')
                                      .append (this.next1Div = $('<div class="choice1">'))
                                      .append (this.next2Div = $('<div class="choice2">'))))
                    .append (this.moodBar = $('<div class="moodbar">'))

		this.moods.forEach (function (mood, m) {
		    var moodClass = "mood" + (m+1)
		    var img = bh.makeMoodImage (bh.playerID, mood)
		    var div = $('<div>')
			.addClass(moodClass)
			.html (img)
		    bh.moodBar.append (div)
                    bh.moodDiv.push (div)
                    bh.moodImg.push (img)
		})

                var throwOutConfidence = function (offset, element) {
                    return Math.min(Math.abs(offset) / element.offsetWidth, 1)
                }
                var isThrowOut = function (offset, element, throwOutConfidence) {
                    return throwOutConfidence > .25
                }
                this.stack = gajus.Swing.Stack ({ throwOutConfidence: throwOutConfidence,
                                                  isThrowOut: isThrowOut })

                var gameOverCardListItem = bh.createCardListItem ($('<span>').text ("Game Over"), 'gameover')
                this.dealCard (gameOverCardListItem, this.showPlayPage)
            }

            this.revealChoice()
            this.loadGameCard()
        },

        loadGameCard: function (gameCardDealtCallback) {
            gameCardDealtCallback = gameCardDealtCallback || function(){}
            this.choice1Div.empty()
            this.choice2Div.empty()
            if (this.gameOver)
                gameCardDealtCallback()
            else {
                var loadingCardListItem = this.createCardListItem ($('<span>').text ("Loading"), 'waitcard')
                
                this.socket_getPlayerGame (this.playerID, this.gameID)
                    .done (function (data) {
                        bh.throwDummyCard (loadingCardListItem)
                        if (!data.finished) {
                            bh.moveNumber = data.move
                            bh.playerCash = data.self.cash

                            bh.updatePlayerCash (data.self.cash)
                            bh.updatePlayerMood (data.self.mood)
                            bh.opponentNameDiv.text (data.other.name)
                            bh.updateOpponentMood (data.other.id, data.other.mood)

                            var makeMoveC = bh.makeMoveFunction (data.move, 'c')
                            var makeMoveD = bh.makeMoveFunction (data.move, 'd')

                            bh.nextOutcomeCardListItem = bh.createCardListItem ('', 'outcome-default')
                            bh.waitCardListItem = bh.createCardListItem ($('<span>').text ("Waiting for other player"), 'waitcard')
                            
                            var cardListItem = bh.createCardListItem ($('<span>').html (data.intro), 'verb-' + data.verb)
                            var card = bh.dealCard (cardListItem, makeMoveC, makeMoveD)

                            bh.choice1Div.append (bh.makeLink (data.hintd, bh.cardThrowFunction (card, gajus.Swing.Card.DIRECTION_LEFT)))
                            bh.choice2Div.append (bh.makeLink (data.hintc, bh.cardThrowFunction (card, gajus.Swing.Card.DIRECTION_RIGHT)))

                            gameCardDealtCallback()
                        }
                    })
            }
        },

        createCardListItem: function (cardContent, cardClass) {
            var listItem = $('<li class="in-deck ' + (cardClass || "") + '">')
            listItem.html (cardContent)
            this.stackList.append (listItem)
            return listItem
        },
        
        addCard: function (listItem, rightCallback, leftCallback) {
            rightCallback = rightCallback || function() { }
            leftCallback = leftCallback || rightCallback
            var bh = this
            var card = this.stack.createCard (listItem[0])
            card.on ('throwoutright', function () {
                rightCallback.call (bh)
                bh.fadeCard (listItem)
            })
            card.on ('throwoutleft', function () {
                leftCallback.call (bh)
                bh.fadeCard (listItem)
            })
            return card
        },

        dealCard: function (listItem, rightCallback, leftCallback) {
            var card = this.addCard (listItem, rightCallback, leftCallback)
            card.throwIn (-600, -100)
            return card
        },
        
        fadeCard: function (listItem) {
            listItem.prop('disabled',true)
            listItem.fadeOut (500, function() { listItem.remove() })
        },
        
        moveCardToTop: function (listItem) {
            this.stackList.append (listItem)
        },

        throwDummyCard: function (listItem) {
            this.addCard(listItem).throwOut()
        },
        
        updatePlayerCash: function (cash) {
            this.playerCashDiv.text ("Score: $" + cash)
        },

        updatePlayerMood: function (mood) {
            var bh = this
            this.playerMoodDiv
		.html (this.makeMoodImage (this.playerID, mood))
            for (var m = 0; m < this.moods.length; ++m) {
                var newMood = this.moods[m]
                this.moodDiv[m].off()
		if (newMood == mood)
		    this.moodImg[m].fadeTo(100,1)
		else {
		    this.moodImg[m].fadeTo(200,.5)
                    this.moodDiv[m]
			.on('click', 
			    bh.changeMoodFunction (bh.moveNumber, newMood))
		}
            }
        },

        updateOpponentMood: function (id, mood) {
            this.opponentMoodDiv
		.empty()
		.append (this.makeMoodImage (id, mood))
        },

        makeMoveFunction: function (moveNumber, choice) {
            var bh = this
            return function() {
                bh.socket_getPlayerGameMoveChoice (bh.playerID, bh.gameID, moveNumber, choice)
                    .done (function (data) {
                        if (data.waiting) {
                            bh.choice1Div.empty()
                            bh.choice2Div.empty()
                        }
                    })
            }
        },
        
        changeMoodFunction: function (moveNumber, mood) {
            var bh = this
            return function() {
                bh.moodBar.prop('disabled',true)
                bh.REST_getPlayerGameMoveMood (bh.playerID, bh.gameID, moveNumber, mood)
                    .done (function (data) {
                        bh.moodBar.prop('disabled',false)
                        bh.updatePlayerMood (mood)
                    })
            }
        },

        showOutcome: function() {
            var bh = this
            this.updatePlayerCash (this.playerCash + this.outcome.self.reward)
            this.updatePlayerMood (this.outcome.self.mood)
            this.updateOpponentMood (this.outcome.other.id, this.outcome.other.mood)

            var outcomeCardListItem = this.nextOutcomeCardListItem
            delete this.nextOutcomeCardListItem
            outcomeCardListItem
                .removeClass()
                .addClass('outcome-default')
                .html($('<span>').html (this.outcome.outro))

            this.choiceDiv.hide()
            this.nextDiv.show()

            this.throwDummyCard (this.waitCardListItem)

            this.loadGameCard (function () {
                var card = bh.dealCard (outcomeCardListItem, bh.revealChoice)

                var nextFunc = bh.cardThrowFunction (card, gajus.Swing.Card.DIRECTION_RIGHT)
                bh.next1Div.html (bh.makeLink ("Next", nextFunc))
                bh.next2Div.html (bh.makeLink ("Next", nextFunc))
            })
        },

        revealChoice: function() {
            this.choiceDiv.show()
            this.nextDiv.hide()
        },
        
        cardThrowFunction: function (card, direction) {
            var bh = this
            return function() {
                card.throwOut (300*direction, 600*(Math.random() - .5))
            }
        },
        
        // socket message handler
        handlePlayerMessage: function (msg) {
            switch (msg.data.message) {
            case "join":
                if (this.page == 'play' || this.page == 'waitingToJoin') {
                    // known bug: if logged in from multiple devices, they will all join the game here
                    // even if they are just on the play page, not waitingToJoin
                    // (we allow play->game transitions because the 2nd player to join gets an immediate message,
                    // before the waitingToJoin page is shown)
                    this.gameID = msg.data.game
                    this.gameOver = false
                    this.showGamePage()
                }
                break
            case "move":
                if (this.page == 'game' && this.gameID == msg.data.game) {
                    this.outcome = msg.data.outcome
                    this.moveNumber = parseInt(msg.data.move) + 1  // this is required so that we can change move from the outcome page
                    this.gameOver = msg.data.finished
                    this.showOutcome()
                }
                break
            case "mood":
                if (this.page == 'game' && this.gameID == msg.data.game) {
                    this.updateOpponentMood (msg.data.other.id, msg.data.other.mood)
                }
                break
            default:
                console.log ("Unknown message")
                console.log (msg)
                break
            }
        },
    })
    
    return proto
}) ()

var bh
$(function() {
    bh = new BigHouse()
})
