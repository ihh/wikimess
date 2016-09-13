var BigHouse = (function() {
    var proto = function (config) {
        config = config || {}
        $.extend (this, config)
        this.container = $('#'+this.containerID)
            .addClass("bighouse")

	this.localStorage = { playerName: undefined,
                              musicVolume: .5,
                              soundVolume: .5 }
	try {
	    var ls = JSON.parse (localStorage.getItem (this.localStorageKey))
            $.extend (this.localStorage, ls)
	} catch (err) {
            // do nothing
	}
        $.extend (this, this.localStorage)

        this.socket_onPlayer ($.proxy (this.handlePlayerMessage, this))

        // prevent scrolling/viewport bump on iOS Safari
        $(document).on('touchmove',function(e){
            e.preventDefault()
        })

        this.pushedViews = []
	this.postponedCallbacks = []

        this.changeMusic('menu')
        this.showLoginPage()
    }

    $.extend (proto.prototype, {
        // default constants
        containerID: 'bighouse',
        localStorageKey: 'bighouse',
	blankImageUrl: '/images/1x1blank.png',
        moods: ['happy', 'surprised', 'sad', 'angry'],
        musicFadeDelay: 800,
        avatarSize: 298,
        cardDelimiter: ';;',
	maxJoinWaitTime: 500,  // 5
	kickDelay: 2,
	timeoutCardTossWait: 500,
        
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

        REST_getPlayerJoinBot: function (playerID) {
            return $.get ('/player/' + playerID + '/join/bot')
        },

        REST_getPlayerJoinCancel: function (playerID) {
            return $.get ('/player/' + playerID + '/join/cancel')
        },

        REST_getPlayerGames: function (playerID) {
            return $.get ('/player/' + playerID + '/games')
        },

        REST_getPlayerGameKick: function (playerID, gameID) {
            return $.get ('/player/' + playerID + '/game/' + gameID + '/kick')
        },

        REST_getPlayerGameStatusSelf: function (playerID, gameID) {
            return $.get ('/player/' + playerID + '/game/' + gameID + '/status/self')
        },

        REST_getPlayerGameStatusOther: function (playerID, gameID) {
            return $.get ('/player/' + playerID + '/game/' + gameID + '/status/other')
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

        socket_getPlayerGameMove: function (playerID, gameID, move) {
            return this.socketGetPromise ('/player/' + playerID + '/game/' + gameID + '/move/' + move)
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
	isTouchDevice: function() {
	    return 'ontouchstart' in document.documentElement
	},

	inPortraitMode: function() {
	    return window.innerHeight > window.innerWidth
	},

        callWithSoundEffect: function (callback, sfx) {
            sfx = sfx || 'select'
            var bh = this
            return function (evt) {
                if (sfx.length)
                    bh.selectSound = bh.playSound (sfx)
                evt.preventDefault()
                callback.call (bh, evt)
            }
        },

        makeLink: function (text, callback, sfx) {
            sfx = sfx || 'select'
            return $('<a href="#">')
                .text (text)
                .attr ('title', text)
                .on ('click', this.callWithSoundEffect (callback, sfx))
        },

        makeListLink: function (text, callback, sfx) {
            sfx = sfx || 'select'
            return $('<li>')
                .append ($('<span>')
                         .text(text))
                .on('click', this.callWithSoundEffect (callback, sfx))
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
                         .append ($('<ul>')
                                  .append (this.makeListLink ('Log in', this.doReturnLogin))
                                  .append (this.makeListLink ('Create player', this.createPlayer))))
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
            this.writeLocalStorage ('playerName')
            return true
        },

        writeLocalStorage: function (key) {
            this.localStorage[key] = this[key]
            localStorage.setItem (this.localStorageKey,
				  JSON.stringify (this.localStorage))
        },

        doReturnLogin: function() {
            return this.doLogin (this.showPlayPage)
        },

        doInitialLogin: function() {
            return this.doLogin (this.showInitialUploadPage)
        },

        doLogin: function (showNextPage) {
            var bh = this
            if (this.validatePlayerName())
                this.REST_postLogin (this.playerName, this.playerPassword)
                .done (function (data) {
		    if (!data.player)
                        bh.showModalMessage (data.message)
		    else {
                        bh.selectSound.stop()
                        bh.playSound ('login')
			bh.playerID = data.player.id
                        showNextPage.call(bh)
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
                    bh.selectSound.stop()
                    bh.playSound ('login')
		    bh.doInitialLogin()
                })
                .fail (function (err) {
                    if (err.status == 400)
                        bh.showModalMessage ("A player with that name already exists")
                    else
                        bh.showModalWebError (err)
                })
        },

        showModalMessage: function (msg, sfx) {
            sfx = sfx || 'error'
            if (this.selectSound)
                this.selectSound.stop()
            this.playSound(sfx).once ('end', function() {
                alert (msg)
            })
        },

        showModalWebError: function (err, sfx) {
            this.showModalMessage (err.status + " " + err.statusText, sfx)
        },
        
        // play menu
        showPlayPage: function() {
            var bh = this

            this.changeMusic('menu')
            
            this.page = 'play'
            if (!this.lastMood)
                this.lastMood = 'happy'
            this.container
                .empty()
                .append (this.makePageTitle ("Hi " + this.playerName))
                .append (this.menuDiv = $('<div class="menubar">')
                         .append ($('<ul>')
                                  .append (this.makeListLink ('New game', this.joinGame, 'waiting'))
                                  .append (this.makeListLink ('Active games', this.showActiveGamesPage))
                                  .append (this.makeListLink ('Settings', this.showSettingsPage))
                                  .append (this.makeListLink ('Log out', this.doLogout, 'logout'))))
        },

        makePageTitle: function (text, titleBarClass) {
            var titleBar = $('<div class="titlebar">')
                .append ($('<span>')
                         .html ($('<big>')
                                .text (text)))
	    if (titleBarClass)
		titleBar.addClass (titleBarClass)
	    return titleBar
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
                .append (this.makePageTitle ("Settings"))
                .append ($('<div class="menubar">')
                         .append ($('<ul>')
                                  .append (this.makeListLink ('Upload photos', this.showSettingsUploadPage))
                                  .append (this.makeListLink ('Audio settings', this.showAudioPage))
                                  .append (this.makeListLink ('Back', this.showPlayPage))))
        },

        // settings
        showAudioPage: function() {
            var bh = this

            this.pushView ('audio')
            var soundInput, musicInput
            this.container
                .append (this.makePageTitle ("Audio settings"))
                .append ($('<div class="menubar">')
                         .append ($('<div class="card">')
                                  .append (soundInput = $('<input type="range" value="50" min="0" max="100">'))
                                  .append ($('<span>').text("Sound FX volume")))
                         .append ($('<div class="card">')
                                  .append (musicInput = $('<input type="range" value="50" min="0" max="100">'))
                                  .append ($('<span>').text("Music volume")))
                         .append ($('<ul>')
                                  .append (this.makeListLink ('Back', this.popView))))

            soundInput.val (this.soundVolume * 100)
            soundInput.on ('change', function() {
                bh.soundVolume = soundInput.val() / 100
                bh.playSound ('select')
                bh.writeLocalStorage ('soundVolume')
            })

            musicInput.val (this.musicVolume * 100)
            musicInput.on ('input', function() {
                bh.musicVolume = musicInput.val() / 100
                bh.changeMusic (undefined, 1)
                bh.writeLocalStorage ('musicVolume')
            })

            // restore disabled slide events for these controls
            soundInput.on('touchmove',function(e){e.stopPropagation()})
            musicInput.on('touchmove',function(e){e.stopPropagation()})
        },

        pushView: function (newPage) {
            var elements = this.container.find(':not(.pushed)')
            var page = this.page
            this.pushedViews.push ({ elements: elements, page: page })
            elements.addClass('pushed')
            this.page = newPage
        },

        popView: function() {
	    var bh = this
            var poppedView = this.pushedViews.pop()
            this.container.find('.pushed').find('*').addBack().addClass('pushed')  // make sure any descendants added after the push are flagged as pushed
            this.container.find(':not(.pushed)').remove()
            poppedView.elements.find('*').addBack().removeClass('pushed')
            this.page = poppedView.page
	    this.callPostponed()
        },

	callPostponed: function() {
	    if (this.page == 'game') {
		this.postponedCallbacks.forEach (function (f) { f.call (bh) })
		this.postponedCallbacks = []
	    }
	},

	callOrPostpone: function (callback) {
	    if (this.page == 'game')
		callback.call (this)
	    else
		this.postponedCallbacks.push (callback)
	},

        // avatar upload page
        showSettingsUploadPage: function() {
            this.showUploadPage ({ uploadText: "Select one of the images below to upload a new photo",
                                   nextPageText: "Back",
                                   showNextPage: this.showSettingsPage,
                                   transitionWhenUploaded: false })
        },

        showInitialUploadPage: function() {
            this.showUploadPage ({ uploadText: "Take a selfie for each of the four moods shown below, so other players can see how you feel.",
                                   nextPageText: "Later",
                                   showNextPage: this.showPlayPage,
                                   transitionWhenUploaded: true })
        },

        showUploadPage: function (config) {
            var bh = this

            this.lastUploadConfig = config
            var uploadText = config.uploadText
            var nextPageText = config.nextPageText
            var showNextPage = config.showNextPage
            var transitionWhenUploaded = config.transitionWhenUploaded
            
            this.page = 'upload'
            this.moodDiv = []
            this.container
                .empty()
                .append (this.makePageTitle ("Upload photos"))
                .append (this.menuBar = $('<div class="menubar">')
			 .append ($('<span class="rubric">')
				  .text(uploadText))
			 .append ($('<ul>')
				  .append (this.makeListLink (nextPageText, showNextPage))))
                .append (this.moodSlugBar = $('<div class="moodslugbar">'))
                .append (this.moodBar = $('<div class="mooduploadbar">'))
		.append (this.moodFileInput = $('<input type="file" style="display:none;">'))
                
            var nUploads = 0, moodUploaded = {}
	    this.moods.forEach (function (mood, m) {
		var moodClass = "mood" + (m+1)
		var moodSlugClass = "moodslug" + (m+1)
		var img = bh.makeMoodImage (bh.playerID, mood)
		var div = $('<div>')
		    .addClass(moodClass)
		    .html (img)
                var uploadFunc = bh.uploadMoodPhotoFunction (mood, div, function() {
                    if (!moodUploaded[mood]) {
                        moodUploaded[mood] = true
                        if (++nUploads == bh.moods.length && transitionWhenUploaded)
                            showNextPage.call(bh)
                    }
                })
		div.on ('click', ':not(.unclickable)', uploadFunc)
                bh.moodSlugBar.append ($('<div>')
                                       .addClass(moodSlugClass)
                                       .text(mood)
                                       .on('click', uploadFunc))
		bh.moodBar.append (div)
                bh.moodDiv.push (div)
            })
            
            if (config.reloadMood)
                this.reloadMoodImage (this.playerID, config.reloadMood)
        },

	makeMoodImage: function (id, mood) {
	    return $('<img class="mood">')
		.attr ('src', this.REST_urlPlayerAvatar (id, mood))
	},

	reloadMoodImage: function (id, mood) {
	    this.forceImgReload (this.REST_urlPlayerAvatar (id, mood))
	},

	uploadMoodPhotoFunction: function (mood, div, uploadedCallback) {
	    var bh = this
	    return function (clickEvt) {
                bh.playSound (mood)
                bh.lastMood = mood
		var inPortrait = bh.inPortraitMode()  // camera will change this, so preserve it now
		bh.moodFileInput.on ('change', function (fileSelectEvt) {
		    var file = this.files[0]
		    if (file) {
		        bh.menuBar
		            .empty()
		            .append ($('<span>').text ("Processing..."))
			bh.moodFileInput.off()
			bh.moodBar.find('*').addClass('unclickable')
			bh.moodSlugBar.find('*').addClass('unclickable')

                        loadImage (file,
                                   function (canvas) {
                                       if (canvas.type === "error")
                                           console.log("Error loading image")
                                       else
                                           canvas.toBlob (function (blob) {
                                               bh.showConfirmUploadPage (mood, div, blob, uploadedCallback, null)
                                           })
                                   },
                                   { orientation: inPortrait ? 6 : 3,
                                     canvas: true })
		    }
		})
		bh.moodFileInput.click()
		return false
	    }
	},

	urlCreator: function() {
	    return window.URL || window.webkitURL
	},

	showConfirmUploadPage: function (mood, div, blob, uploadedCallback, imageCrop) {
	    var bh = this
	    bh.imageCrop = imageCrop

            this.page = 'confirm'
            this.container
                .empty()
                .append (this.makePageTitle ("Rotate & scale", "confirmtitle"))

	    var postBlob = function (finalBlob) {
		bh.container
		    .empty()
                    .append (bh.makePageTitle ("Uploading"))
                    .append ($('<div class="menubar">')
		             .append ($('<span>').text ("Uploading " + mood + " face...")))
		bh.REST_postPlayerAvatar (bh.playerID, mood, finalBlob)
		    .then (function (data) {
			bh.exitConfirmUpload (mood)
			uploadedCallback()
		    })
		    .fail (function (err) {
			bh.showModalWebError (err)
			bh.exitConfirmUpload()
		    })
	    }

	    this.uploadImageUrl = this.urlCreator().createObjectURL( blob )

	    var imgLoaded = $.Deferred()
	    var img = $('<img>')
		.on ('load', function() { imgLoaded.resolve() })
		.attr ('src', this.uploadImageUrl)
            bh.uploadImage = img

	    imgLoaded.done (function() {
                bh.container.append (img)
		var w = img[0].naturalWidth, h = img[0].naturalHeight
                var s = Math.min (w, h)
		if (!bh.imageCrop)
		    bh.imageCrop = { cropX: 0, cropY: 0, cropW: s, cropH: s }

                var cw = document.documentElement.clientWidth, ch = document.documentElement.clientHeight
                var cs = Math.min (cw, ch)
		var config = { width: cs,
                               height: cs,
                               result: bh.imageCrop }
		if (bh.isTouchDevice())
		    config.showControls = 'never'

                img.cropbox (config)
		    .on ('cropbox', function (e, result) {
			bh.imageCrop.cropX = result.cropX
			bh.imageCrop.cropY = result.cropY
			bh.imageCrop.cropW = result.cropW
			bh.imageCrop.cropH = result.cropH
		    })

	        var uploadExit
                bh.container
		    .append (uploadExit = $('<div class="upload-exit">'))
                
		// when user hits rotate, we want to
		//  1) redraw the full-size image, rotated
		//  2) recompute the crop box co-ordinates under the rotation
		var rotateFunc = function (sign) {
		    return function() {
			uploadExit.find('*').off('click').addClass('unclickable')
                        img.remove()
                        
                        var canvas = $('<canvas>')
			var ctx = canvas[0].getContext('2d')
			canvas.attr('width',h).attr('height',w)
			ctx.rotate (sign * Math.PI / 2)
			ctx.drawImage (img[0], sign>0 ? 0 : -w, sign>0 ? -h : 0)
			var newImageCrop = { cropX: sign > 0
					     ? (h - bh.imageCrop.cropY - bh.imageCrop.cropW)
					     : bh.imageCrop.cropY,
					     cropY: sign > 0
					     ? bh.imageCrop.cropX
					     : (w - bh.imageCrop.cropX - bh.imageCrop.cropW),
					     cropW: bh.imageCrop.cropH,
					     cropH: bh.imageCrop.cropW }
			canvas[0].toBlob (function (newBlob) {
			    bh.removeImages()
			    bh.showConfirmUploadPage (mood, div, newBlob, uploadedCallback, newImageCrop)
			})
		    }
		}

		var okFunc = function() {
                    img.remove()
		    var canvas = $('<canvas>')
		    var ctx = canvas[0].getContext('2d')
		    var ic = bh.imageCrop
		    canvas.attr('width',bh.avatarSize).attr('height',bh.avatarSize)
		    ctx.drawImage (img[0], ic.cropX, ic.cropY, ic.cropW, ic.cropH, 0, 0, bh.avatarSize, bh.avatarSize)
                    
		    canvas[0].toBlob (postBlob)
		}

		uploadExit
		    .append ($('<span>')
			     .html (bh.makeLink ("↺", rotateFunc(-1))))
		    .append ($('<span>')
			     .html (bh.makeLink ("Cancel", bh.cancelConfirmUpload)))
		    .append ($('<span>')
			     .html (bh.makeLink ("OK", okFunc)))
		    .append ($('<span>')
			     .html (bh.makeLink ("↻", rotateFunc(+1))))
	    })
	},

	removeImages: function() {
	    // clean up URLs, etc
	    if (this.uploadImage) {
		this.uploadImage.remove()
		delete this.uploadImage
	    }
	    this.urlCreator().revokeObjectURL (this.uploadImageUrl)
	},

        cancelConfirmUpload: function() {
	    this.exitConfirmUpload()
        },

	exitConfirmUpload: function (mood) {
	    this.removeImages()
            var config = {}
            $.extend (config, this.lastUploadConfig)
            if (mood)
                config.reloadMood = mood
            this.showUploadPage (config)
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

	// This function should blank all images that have a matching src, by changing their src property to /images/1x1blank.png.
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
	    // ##### document.getElementById("myImage").src = "/images/1x1blank.png";

	    var blankList = [],
	    fullSrc = window.location.href + src.substr(1) /* Fully qualified (absolute) src - i.e. prepend protocol, server/domain, and path if not present in src */,
	    imgs, img, i;

	    // get list of matching images:
	    imgs = window.document.body.getElementsByTagName("img");
	    for (i = imgs.length; i--;) if ((img = imgs[i]).src===fullSrc)  // could instead use body.querySelectorAll(), to check both tag name and src attribute, which would probably be more efficient, where supported
	    {
		img.src = this.blankImageUrl;  // blank them
		blankList.push(img);            // optionally, save list of blanked images to make restoring easy later on
	    }

	    // for each (/* img DOM node held only by javascript, for example in any image-caching script */) if (img.src===fullSrc)
//	    {
//		img.src = "/images/1x1blank.png";   // do the same as for on-page images!
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

        // active games
	showActiveGamesPage: function() {
            var bh = this

	    this.page = 'activeGames'
	    var tbody
	    this.container
		.empty()
                .append (this.makePageTitle ("Active games"))
		.append ($('<div>')
			 .append ($('<table class="gametable">')
				  .append ($('<thead>')
					   .append ($('<tr>')
						    .append ($('<th>').text("Player"))
						    .append ($('<th>').text("Started"))
						    .append ($('<th>').text("Updated"))
						    .append ($('<th>').text("State"))
						    .append ($('<th>'))))
				  .append (tbody = $('<tbody>'))))
		.append ($('<div class="menubar">')
			 .append ($('<span>')
				  .html (this.makeLink ('Back', this.showPlayPage))))

	    // allow scrolling for tbody, while preventing bounce at ends
	    this.restoreScrolling (tbody)

	    this.REST_getPlayerGames (this.playerID)
		.done (function (data) {
		    tbody.append (data.map (function (info) {
			var state = info.finished ? "Over" : (info.waiting ? "Ready" : "Waiting")
			return $('<tr>')
			    .append ($('<td>').text(info.other.name))
			    .append ($('<td>').text(bh.hoursMinutes (info.running)))
			    .append ($('<td>').text(bh.hoursMinutes (info.dormant)))
			    .append ($('<td>').addClass(state.toLowerCase()).text(state))
			    .append ($('<td>')
				     .append ($('<span>')
					      .text("Join")
					      .on ('click', function() {
						  bh.startGame (info.game)
					      })))
		    }))
		})
	},

	hoursMinutes: function (seconds) {
	    var m = parseInt(seconds / 60)
	    var h = parseInt(m / 60)
	    m = m % 60
	    return h + ":" + (m < 10 ? "0" : "") + m
	},

	restoreScrolling: function (elem) {
	    // allow scrolling for elem, while preventing bounce at ends
            // http://stackoverflow.com/a/20477023/726581
            elem.on('touchstart', function(event) {
                this.allowUp = (this.scrollTop > 0);
                this.allowDown = (this.scrollTop < this.scrollHeight - this.clientHeight);
                this.slideBeginY = event.pageY;
            });
            elem.on('touchmove', function(event) {
                var up = (event.pageY > this.slideBeginY);
                var down = (event.pageY < this.slideBeginY);
                this.slideBeginY = event.pageY;
                if ((up && this.allowUp) || (down && this.allowDown)) {
                    event.stopPropagation();
                }
                else {
                    event.preventDefault();
                }
            });
	},

        // start/join new game
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
                .append ($('<span class="rubric">')
                         .text ("Waiting for another player"))
                .append ($('<ul>')
                         .append (this.makeListLink ('Cancel', this.cancelJoin)))
	    this.joinWaitTimer = window.setTimeout (function() {
		bh.REST_getPlayerJoinBot (bh.playerID)
		delete bh.joinWaitTimer
	    }, this.maxJoinWaitTime * 1000)
        },

        cancelJoin: function() {
            var bh = this
	    this.cancelJoinBot()
            this.REST_getPlayerJoinCancel (this.playerID)
                .done ($.proxy (this.showPlayPage, this))
                .fail ($.proxy (this.showModalWebError, this))
        },

	cancelJoinBot: function() {
	    if (this.joinWaitTimer) {
		window.clearTimeout (this.joinWaitTimer)
		delete this.joinWaitTimer
	    }
	},

        // in-game menu
        showGameMenuPage: function() {
            var bh = this

            this.pushView ('gamemenu')
            this.container
                .append (this.makePageTitle ("Game menu"))
                .append ($('<div class="menubar">')
                         .append ($('<ul>')
                                  .append (this.makeListLink ('Resume game', this.popView))
                                  .append (this.makeListLink ('Status', this.showPlayerStatusPage))
                                  .append (this.makeListLink ('Audio settings', this.showAudioPage))
                                  .append (this.makeListLink ('Exit to menu', this.exitGame))))
        },

	clearMoveTimer: function() {
	    if (this.moveTimer) {
		window.clearInterval (this.moveTimer)
		delete this.moveTimer
	    }
	},

	exitGame: function() {
	    this.clearMoveTimer()
	    this.showPlayPage()
	},

	// game status
        showPlayerStatusPage: function() {
            this.showGameStatusPage (this.playerName, this.REST_getPlayerGameStatusSelf)
        },
        
        showOpponentStatusPage: function() {
            this.showGameStatusPage (this.opponentName, this.REST_getPlayerGameStatusOther)
        },

        showGameStatusPage: function (name, getMethod) {
            var bh = this
            this.pushView ('status')
	    var detail
            this.container
                .append (this.makePageTitle (name))
		.append (detail = $('<div class="detailbar">'))
		.append ($('<div class="menubar">')
			 .append ($('<span>')
				  .html (this.makeLink ('Back', this.popView))))

	    this.restoreScrolling (detail)

            getMethod.call (this, this.playerID, this.gameID)
		.done (function (data) {
		    detail.html (data)
		})
	},

        // game pages
        showGamePage: function() {
            var bh = this

            this.changeMusic('game')

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
                             .append ($('<div class="rightstatus">')
                                      .append (this.opponentNameDiv = $('<span>')
                                               .on ('click', bh.callWithSoundEffect (bh.showOpponentStatusPage))))
                             .append (this.opponentMoodDiv = $('<div class="rightmood">'))
                             .append ($('<div class="statuslink">')
                                      .append ($('<span>')
                                               .html (this.makeLink ('Menu', this.showGameMenuPage)))))
                    .append ($('<div class="timebar">')
			     .append (bh.timerDiv = $('<div class="timer">')
				      .width("100%")))
                    .append ($('<div class="cardbar">')
                             .append ($('<div class="cardtable">')
                                      .append (this.choiceBar = $('<div class="choicebar">')
                                               .append (this.choiceDiv = $('<div>')))
				      .append (this.stackList = $('<ul class="stack">'))))
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
                this.dealCard ({ listItem: gameOverCardListItem,
				 swipe: function() {
				     bh.playSound ('gameover')
				     bh.showPlayPage()
				 },
				 silent: true })
            }

            this.loadGameCards()
        },

        loadGameCards: function() {
	    var bh = this
	    this.clearMoveTimer()
            var loadingCardListItem, loadingCardSwipe, loadingCardTimer
	    var loadingSpan = $('<span>').text ("Loading")
	    if (this.nextOutcomeCardListItem) {
		// not the first move; repurpose the previously-added placeholder outcome card as a 'Loading' card
                loadingCardListItem = this.nextOutcomeCardListItem
		    .html (loadingSpan)
		    .removeClass()
		    .addClass('waitcard')
		loadingCardSwipe = this.nextOutcomeCardSwipe
	    } else {
		// first move, so add a 'Loading' card, with a short time delay in case server response is quick
		loadingCardTimer = window.setTimeout (function() {
		    loadingCardListItem = bh.createCardListItem (loadingSpan, 'waitcard')
		    loadingCardSwipe = bh.pushChoiceRevealer().wrapCallback()
		    loadingCardTimer = null
		}, 100)
	    }
	    if (this.waitCardListItem)
		this.throwDummyCard (this.waitCardListItem, this.waitCardSwipe)  // visibly throw the 'waiting for player' card

            this.socket_getPlayerGame (this.playerID, this.gameID)
                .done (function (data) {
		    if (loadingCardTimer)
			window.clearTimeout (loadingCardTimer)
		    if (loadingCardListItem)
			bh.throwDummyCard (loadingCardListItem)

                    bh.moveNumber = data.move

		    bh.updatePlayerMood (data.self.mood)
		    bh.opponentNameDiv.text (bh.opponentName = data.other.name)
		    bh.updateOpponentMood (data.other.id, data.other.mood)

		    bh.currentChoiceCards = []
                    if (data.finished)
			bh.showLastOutcome (data.lastOutcome)
		    else {
			bh.createPlaceholderCards()
			bh.waitingForOther = data.waiting
			bh.defaultMove = data.defaultMove
			if (data.waiting) {
			    bh.createAndDealCards ({ text: data.intro,
						     finalCardClass: 'verb-' + data.verb,
						     swipeRight: bh.makeMoveFunction (data.move, 'c'),
						     swipeLeft: bh.makeMoveFunction (data.move, 'd'),
						     rightHint: data.hintc, 
						     leftHint: data.hintd,
						     dealt: $.proxy (bh.showWaitingForOther, bh) })
			    bh.showLastOutcome (data.lastOutcome)
			} else {
			    bh.createPlaceholderCards()
			    bh.showWaitingForOther()
			}

			bh.missedTimeouts = 0
			if (data.deadline) {
			    bh.dealTime = new Date()
			    bh.deadline = new Date(data.deadline)
			    var totalTime = bh.deadline - bh.dealTime
			    bh.updateTimer (totalTime, totalTime)
			    var kickDelay = (bh.waitingForOther ? 0 : bh.kickDelay) + Math.random()
			    bh.moveTimer = window.setInterval (function() {
				var now = new Date()
				bh.updateTimer (Math.max (0, bh.deadline - now), totalTime)
				if (now.getTime() > bh.deadline.getTime() + 1000*kickDelay) {
				    bh.clearMoveTimer()
				    bh.REST_getPlayerGameKick (bh.playerID, bh.gameID)
					.done (function (data) {
//					    console.log(data)
					}).fail (function (err) {
					    console.log(err)
					})
				}
			    }, 10)
			}
			bh.socket_getPlayerGameMove (bh.playerID, bh.gameID)
			bh.callPostponed()
		    }
                })
	},

	updateTimer: function (timeLeft, totalTime) {
	    this.timerDiv.width(Math.round(100*timeLeft/totalTime)+"%")
	    if (timeLeft <= 5000) {
		var choiceClass = this.defaultMove == 'd' ? 'choice1' : 'choice2'
		$('.'+choiceClass).find(':visible').css ('opacity', Math.sqrt (Math.abs ((timeLeft % 1000) / 500 - 1)))
	    }
	},

	createPlaceholderCards: function() {
            this.nextOutcomeCardListItem = this.createCardListItem ('', 'outcome')  // placeholder, for appearances
	    this.nextOutcomeCardSwipe = this.pushChoiceRevealer().wrapCallback()

            this.waitCardListItem = this.createCardListItem ('', 'waitcard')
	    this.waitCardSwipe = this.pushChoiceRevealer().wrapCallback()
	},

	showWaitingForOther: function() {
	    this.waitCardListItem.html ($('<span>').text ("Waiting for other player"))
	},

	showLastOutcome: function (outcome) {
	    if (outcome) {
		if (outcome.verb)
		    this.playSound (outcome.verb)
		if (outcome.outro && /\S/.test (outcome.outro))
		    this.createAndDealCards ({ text: outcome.outro,
					       firstCardClass: 'outcome' })
	    }
	},

	createAndDealCards: function (config) {
	    var bh = this
	    var texts = config.text.split (this.cardDelimiter)
	    texts.reverse().forEach (function (text, n) {
		var isFirst = (n+1 == texts.length)
		var isFinal = (n == 0)
		var cardClass = isFirst ? config.firstCardClass : (isFinal ? config.finalCardClass : undefined)
                // misc text expansions go here...
                var content = text.split(/\n/).map (function (para) {
                    return $('<span>').html(para)
                })
                var cardListItem = bh.createCardListItem (content, cardClass)
		var cardConfig = { listItem: cardListItem }
		if (isFinal)
		    $.extend (cardConfig, config)
                var card = bh.dealCard (cardConfig)
		bh.currentChoiceCards.push (card)
	    })
	},

        createCardListItem: function (cardContent, cardClass) {
            var listItem = $('<li>').append(cardContent)
            if (cardClass)
                listItem.addClass (cardClass)
            this.stackList.append (listItem)
            return listItem
        },
        
        addCard: function (config) {
	    var listItem = config.listItem
            var rightCallback = config.swipeRight || function() { }
            var leftCallback = config.swipeLeft || function() { }
	    var silent = config.silent
            var bh = this
            var card = this.stack.createCard (listItem[0])
            card.on ('throwoutright', function () {
                if (!silent)
                    bh.playSound ('swiperight')
                rightCallback.call (bh)
                bh.fadeCard (listItem)
            })
            card.on ('throwoutleft', function () {
                if (!silent)
                    bh.playSound ('swipeleft')
                leftCallback.call (bh)
                bh.fadeCard (listItem)
            })
            return card
        },

	pushChoiceRevealer: function() {
	    var bh = this
	    var newChoiceDiv, oldChoiceDiv = this.choiceDiv
	    oldChoiceDiv.hide()
	    this.choiceBar
                .append (newChoiceDiv = $('<div>'))
	    this.choiceDiv = newChoiceDiv
	    return { newChoiceDiv: newChoiceDiv,
		     wrapCallback: function (callback) {
			 return function() {
			     newChoiceDiv.remove()
			     oldChoiceDiv.show()
			     bh.choiceDiv = oldChoiceDiv
			     if (callback)
				 callback.call (bh)
			 }
		     }
		   }
	},

        dealCard: function (config) {
	    var choiceRevealer = this.pushChoiceRevealer()
            config.swipeRight = choiceRevealer.wrapCallback (config.swipeRight || config.swipe)
            config.swipeLeft = choiceRevealer.wrapCallback (config.swipeLeft || config.swipe || config.swipeRight)
            var card = this.addCard (config)
	    var rightHint = config.rightHint || config.hint || "Next"
	    var leftHint = config.leftHint || config.hint || rightHint
	    if (rightHint)
                choiceRevealer.newChoiceDiv
		.append ($('<div class="choice1">')
                         .append ($('<div class="hint">')
			          .append (this.makeLink ("← " + leftHint,
						          this.cardThrowFunction (card, gajus.Swing.Card.DIRECTION_LEFT),
                                                          ''))))
                .append ($('<div class="choice2">')
                         .append ($('<div class="hint">')
			          .append (this.makeLink (rightHint + " →",
						          this.cardThrowFunction (card, gajus.Swing.Card.DIRECTION_RIGHT),
                                                          ''))))

	    if (config.dealt)
		card.on ('throwinend', config.dealt)
            card.throwIn (-600, -100)

            return card
        },
        
        fadeCard: function (listItem) {
            listItem.find('*').off()
            listItem.fadeOut (500, function() { listItem.remove() })
        },

        throwDummyCard: function (listItem, swipe) {
            this.addCard ({ listItem: listItem,
			    swipe: swipe,
			    silent: true })
		.throwOut()
        },
        
        updatePlayerMood: function (mood) {
            var bh = this
            this.lastMood = mood
            var newMoodImg = this.makeMoodImage (this.playerID, mood)
            newMoodImg.on ('load', function() {
                bh.playerMoodDiv
		    .html (newMoodImg)
                    .off ('click')
                    .on ('click', bh.callWithSoundEffect (bh.showPlayerStatusPage))
            })
            for (var m = 0; m < this.moods.length; ++m) {
                var newMood = this.moods[m]
                this.moodDiv[m].off()
		if (newMood == mood)
		    this.moodImg[m].fadeTo(100,1)
		else {
		    this.moodImg[m].fadeTo(200,.5)
                    this.moodDiv[m]
			.on('click',
			    ':not(.unclickable)',
			    bh.changeMoodFunction (bh.moveNumber, newMood))
		}
            }
        },

        updateOpponentMood: function (id, mood) {
            var bh = this
            var newMoodImg = this.makeMoodImage (id, mood)
            newMoodImg.on ('load', function() {
                bh.opponentMoodDiv
		    .html (newMoodImg)
                    .off ('click')
                    .on ('click', bh.callWithSoundEffect (bh.showOpponentStatusPage))
            })
        },

        makeMoveFunction: function (moveNumber, choice) {
            var bh = this
            return function() {
		if (bh.moveNumber == moveNumber)
                    bh.socket_getPlayerGameMoveChoice (bh.playerID, bh.gameID, moveNumber, choice)
		    .done (function() {
			bh.waitingForOther = true
		    })
            }
        },
        
        changeMoodFunction: function (moveNumber, mood) {
            var bh = this
            return function() {
                bh.moodBar.find('*').addClass('unclickable')
                bh.REST_getPlayerGameMoveMood (bh.playerID, bh.gameID, moveNumber, mood)
                    .done (function (data) {
                        bh.playSound (mood)
                        bh.moodBar.find('*').removeClass('unclickable')
                        bh.updatePlayerMood (mood)
                    })
            }
        },

        showOutcome: function() {
            var bh = this
            this.updatePlayerMood (this.outcome.self.mood)
            this.updateOpponentMood (this.outcome.other.id, this.outcome.other.mood)

            this.loadGameCards()
        },

        cardThrowFunction: function (card, direction) {
            var bh = this
            return function() {
                card.throwOut (300*direction, 600*(Math.random() - .5))
            }
        },

	throwCard: function (card) {
	    var dir = this.defaultMove == 'd' ? gajus.Swing.Card.DIRECTION_LEFT	: gajus.Swing.Card.DIRECTION_RIGHT;
	    (this.cardThrowFunction (card, dir)) ()
	},
        
        // socket message handler
        handlePlayerMessage: function (msg) {
            switch (msg.data.message) {
            case "join":
                if (this.page == 'play' || this.page == 'waitingToJoin') {
		    this.cancelJoinBot()
                    // known bug: if logged in from multiple devices, they will all join the game here
                    // even if they are just on the play page, not waitingToJoin
                    // (we allow play->game transitions because the 2nd player to join gets an immediate message,
                    // before the waitingToJoin page is shown)
                    this.selectSound.stop()
                    this.startGame (msg.data.game)
                }
                break
            case "move":
                if (this.gameID == msg.data.game && this.moveNumber == msg.data.move)
		    this.callOrPostpone (function() {
			this.outcome = msg.data.outcome
			this.moveNumber = parseInt(msg.data.move) + 1  // this is required so that we can change move from the outcome page
			this.showOutcome()
		    })
                break
            case "timeout":
                if (this.gameID == msg.data.game) {
		    if (this.moveNumber == msg.data.move) {
			this.clearMoveTimer()
			this.callOrPostpone (this.throwCurrentChoice)
		    } else if (msg.data.move > this.moveNumber)
			++this.missedTimeouts
		}
                break
            case "mood":
                if (this.gameID == msg.data.game)
		    this.callOrPostpone (function() {
			this.playSound (msg.data.other.mood, .5)
			this.updateOpponentMood (msg.data.other.id, msg.data.other.mood)
                    })
                break
            default:
                console.log ("Unknown message")
                console.log (msg)
                break
            }
        },

	startGame: function (gameID) {
            this.playSound ('gamestart')
            this.gameID = gameID
	    delete this.nextOutcomeCardListItem
	    delete this.nextOutcomeCardSwipe
	    delete this.waitCardListItem
	    delete this.waitCardSwipe
            this.showGamePage()
	},

	throwCurrentChoice: function() {
	    delete this.moveNumber  // prevent card throwout callbacks from trying to send move to server
	    if (this.currentChoiceCards.length) {
		if (this.missedTimeouts > 0) {
		    this.currentChoiceCards.forEach (function (card) {
			bh.throwCard (card)
		    })
		    this.loadGameCards()
		} else {
		    var card = this.currentChoiceCards.pop()
		    this.throwCard (card)
		    window.setTimeout ($.proxy (this.throwCurrentChoice, this),
				       this.timeoutCardTossWait)
		}
	    } else
		this.loadGameCards()
	},

        // audio
        startMusic: function (type, volume) {
            this.currentMusicVolume = volume
            this.music = new Howl({
                src: ['/sounds/' + type + '-music.mp3'],
                loop: true,
                volume: this.currentMusicVolume
            });
            this.music.play()
        },

        changeMusic: function (type, volume) {
            type = type || this.musicType
            volume = (volume || 1) * this.musicVolume
            var bh = this
            if (this.musicType == type)
                this.music.volume (this.currentMusicVolume = volume)
            else {
                this.musicType = type
                if (this.music) {
                    this.music.fade (this.currentMusicVolume, 0, this.musicFadeDelay)
                    this.music.once ('fade', function() {
                        bh.startMusic (type, volume)
                    })
                } else
                    this.startMusic (type, volume)
            }
        },

        playSound: function (type, volume) {
            volume = volume || 1
            var sound = new Howl ({
                src: ['/sounds/' + type + '.wav'],
                autoplay: true,
                volume: volume * this.soundVolume
            })
            sound.play()
            return sound
        },
        
    })

    // end of module
    return proto
}) ()

var bh
$(function() {
    bh = new BigHouse()
})
