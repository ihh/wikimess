var BigHouse = (function() {
    var proto = function (config) {
        config = config || {}
        $.extend (this, config)
        this.container = $('#'+this.containerID)
            .addClass("bighouse")

	this.localStorage = { playerLogin: undefined,
                              musicVolume: .5,
                              soundVolume: .5,
                              theme: 'cardroom' }
	try {
	    var ls = JSON.parse (localStorage.getItem (this.localStorageKey))
            $.extend (this.localStorage, ls)
	} catch (err) {
            // do nothing
	}
        $.extend (this, this.localStorage)

        this.socket_onPlayer (this.handlePlayerMessage.bind (this))

        // prevent scrolling/viewport bump on iOS Safari
        $(document).on('touchmove',function(e){
            e.preventDefault()
        })

        this.themeSelector(this.theme) ()
        
        this.pushedViews = []
	this.postponedMessages = []
        this.avatarConfigPromise = {}
        this.gamePosition = {}
        
        if (config.playerID) {
            this.playerID = config.playerID
            this.playerLogin = undefined  // we don't want to show the ugly generated login name if logged in via Facebook etc
            this.playerName = config.playerDisplayName
            if (config.newSignUp)
                this.showInitialUploadPage()
            else
                this.showPlayPage()
        } else
            this.showLoginPage()
    }

    $.extend (proto.prototype, {
        // default constants
        containerID: 'bighouse',
        localStorageKey: 'bighouse',
	iconPrefix: '/icon/',
	iconSuffix: '.svg',
	blankImageUrl: '/images/1x1blank.png',
        facebookButtonImageUrl: '/images/facebook.png',
        maxNameLength: 16,
        moods: ['happy', 'surprised', 'sad', 'angry'],
        musicFadeDelay: 800,
	cardFadeTime: 500,
        loadingTextFadeTime: 500,
        avatarSize: 128,
        cardDelimiter: ';;',
	botWaitTime: 10,  // time before 'join' will give up on finding a human opponent
	nTimeoutChimes: 3,
	moveRetryCount: 3,
	moveRetryMinWait: 10,
	moveRetryMaxWait: 500,
	kickRetryCount: 10,
	kickRetryMinWait: 1000,
	kickRetryMaxWait: 2000,
	minCardDisplayTimeInSeconds: 15,
        dealXOffset: 400,
        dealYOffset: 600,
	allowedStateTransition: { start: { loading: true },
				  loading: { gameOver: true, ready: true, waitingForOther: true },
				  ready: { sendingMove: true, sendingDefaultMove: true, loading: true },
				  waitingForOther: { kicking: true, loading: true },
				  sendingMove: { waitingForOther: true, loading: true },
				  sendingDefaultMove: { kicking: true, loading: true },
				  kicking: { loading: true, sendingKick: true },
				  sendingKick: { kicking: true, loading: true },
				  gameOver: { } },

	swingDir: { left: gajus.Swing.Card.DIRECTION_LEFT,
		    right: gajus.Swing.Card.DIRECTION_RIGHT },

	defaultBackHint: "Back",
	defaultNextHint: "Next",
	defaultAbsentText: "Time passes...",

        themes: [ {style: 'plain', text: 'Plain'},
                  {style: 'cardroom', text: 'Card room'} ],

	verbose: { page: false,
                   gameState: true,
                   moveNumber: true,
                   messages: true,
                   timer: false,
                   errors: true,
                   music: false,
		   stack: true },
        
        // REST interface
        REST_loginFacebook: function() {
            window.location.replace ('/login/facebook')
        },

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

        REST_getPlayerGameStatusSelf: function (playerID, gameID) {
            return $.get ('/player/' + playerID + '/game/' + gameID + '/status/self')
        },

        REST_getPlayerGameStatusOther: function (playerID, gameID) {
            return $.get ('/player/' + playerID + '/game/' + gameID + '/status/other')
        },

        REST_getPlayerGameMoveChoice: function (playerID, gameID, move, choice) {
            return $.get ('/player/' + playerID + '/game/' + gameID + '/move/' + move + '/choice/' + choice)
        },

        REST_getPlayerGameMoveKick: function (playerID, gameID, moveNumber) {
            return $.get ('/player/' + playerID + '/game/' + gameID + '/move/' + moveNumber + '/kick')
        },

        REST_getPlayerGameMoveMood: function (playerID, gameID, move, mood) {
            return $.get ('/player/' + playerID + '/game/' + gameID + '/move/' + move + '/mood/' + mood)
        },

        REST_getPlayerAvatarConfig: function (playerID) {
            return $.get ('/player/' + playerID + '/avatar')
        },

        REST_putPlayerAvatarConfig: function (playerID, config) {
            return $.ajax ({ url: '/player/' + playerID + '/avatar',
                             type: 'PUT',
                             cache: false,
                             contentType: 'application/json',
                             data: JSON.stringify ({ avatarConfig: config })
                           })
        },

        REST_putPlayerAvatarMood: function (playerID, mood, blob) {
            var url = '/player/' + playerID + '/avatar/' + mood
	    var formData = new FormData()
	    formData.append ('avatar', blob)
	    return $.ajax ({ url: url,
			     type: 'PUT',
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

        socket_getPlayerGameHistory: function (playerID, gameID, move) {
            return this.socketGetPromise ('/player/' + playerID + '/game/' + gameID + '/history/' + move)
        },

        // helpers to convert socket callbacks to promises
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

        makeSilentLink: function (text, callback) {
	    return this.makeLink (text, callback, '')
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
                         .html(text))
                .on('click', this.callWithSoundEffect (callback, sfx))
        },

	setPage: function (page) {
	    if (this.verbose.page)
		console.log ("Changing view from " + this.page + " to " + page)
	    this.page = page

            if (this.pageAnimationTimer)
                window.clearInterval (this.pageAnimationTimer)
            delete this.pageAnimationTimer
	},

        // login menu
        showLoginPage: function() {
            this.changeMusic('menu')
            this.setPage ('login')
            this.container
                .empty()
                .append ($('<div class="inputbar">')
                         .append ($('<form>')
                                  .append ($('<label for="player">')
                                           .text('Player name'))
                                  .append (this.nameInput = $('<input name="player" type="text">')
                                           .attr('maxlength', this.maxNameLength))
                                  .append ($('<label for="player">')
                                           .text('Password'))
                                  .append (this.passwordInput = $('<input name="password" type="password">'))))
                .append ($('<div class="menubar">')
                         .append ($('<ul>')
                                  .append (this.makeListLink ('Log in', this.doReturnLogin))
                                  .append (this.makeListLink ('Sign up', this.createPlayer))
                                  .append (this.makeListLink ($('<img>').attr('src',this.facebookButtonImageUrl), this.REST_loginFacebook)
                                           .addClass("noborder"))))
            if (this.playerLogin)
                this.nameInput.val (this.playerLogin)
        },
        
        validatePlayerName: function() {
            this.playerLogin = this.nameInput.val()
            this.playerPassword = this.passwordInput.val()
            this.playerLogin = this.playerLogin.replace(/^\s*/,'').replace(/\s*$/,'')
            if (!/\S/.test(this.playerLogin)) {
                this.showModalMessage ("Please enter a player login name")
                return false
            }
            if (!/\S/.test(this.playerPassword)) {
                this.showModalMessage ("Please enter a password")
                return false
            }
            this.writeLocalStorage ('playerLogin')
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
                this.REST_postLogin (this.playerLogin, this.playerPassword)
                .done (function (data) {
		    if (!data.player)
                        bh.showModalMessage (data.message)
		    else {
                        bh.selectSound.stop()
                        bh.playSound ('login')
			bh.playerID = data.player.id
                        bh.playerName = data.player.name
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
                this.REST_postPlayer (this.playerLogin, this.playerPassword)
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

        // showModalMessage(msg)
        // showModalMessage(msg,callback)
        // showModalMessage(msg,sfx,callback)
        showModalMessage: function (msg, sfx, callback) {
            if (!sfx) {
                callback = function() {}
                sfx = 'error'
            } else if (!callback) {
                callback = sfx
                sfx = 'error'
            }
            sfx = sfx || 'error'
            if (this.selectSound)
                this.selectSound.stop()
            this.playSound(sfx).once ('end', function() {
                alert (msg)
                callback()
            })
        },

        showModalWebError: function (err, sfx, callback) {
            this.showModalMessage (err.status + " " + err.statusText, sfx, callback)
        },
        
        // play menu
        showPlayPage: function() {
            var bh = this

            this.clearMoveTimer()
            this.changeMusic('menu')

            this.setPage ('play')
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

            this.setPage ('settings')
            this.container
                .empty()
                .append (this.makePageTitle ("Settings"))
                .append ($('<div class="menubar">')
                         .append ($('<ul>')
                                  .append (this.makeListLink ('Character settings', this.showSettingsUploadPage))
                                  .append (this.makeListLink ('Audio settings', this.showAudioPage))
                                  .append (this.makeListLink ('Themes', this.showThemesPage))
                                  .append (this.makeListLink ('Back', this.showPlayPage))))
        },

        // settings
        showThemesPage: function() {
            var bh = this

            var fieldset
            this.pushView ('theme')
            this.container
                .append (this.makePageTitle ("Themes"))
                .append ($('<div class="menubar">')
                         .append (fieldset = $('<fieldset class="themegroup">')
                                  .append ($('<legend>').text("Select theme")))
                         .append (this.makeLink ('Back', this.popView)))

            var label = {}
            this.themes.forEach (function (theme) {
                var id = 'theme-' + theme.style
                fieldset.append ($('<input type="radio" name="theme" id="'+id+'" value="'+theme.style+'">'))
	            .append (label[theme.style] = $('<label for="'+id+'" class="'+theme.style+'">')
                             .text(theme.text)
                             .on('click',bh.themeSelector(theme.style)))
            })

            label[this.theme].click()
        },

        themeSelector: function(theme) {
            var bh = this
            return function() {
		bh.themes.forEach (function (oldTheme) {
                    bh.container.removeClass (oldTheme.style)
		})
                bh.container.addClass (theme)
                bh.theme = theme
                bh.writeLocalStorage ('theme')
            }
        },

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
	    if (this.verbose.page)
		console.log ("Pushing " + this.page + " view, going to " + newPage)
            var page = this.page
            this.pushedViews.push ({ elements: elements, page: page })
            elements.addClass('pushed')
            this.setPage (newPage)
        },

        popView: function() {
	    var bh = this
            var poppedView = this.pushedViews.pop()
	    if (this.verbose.page)
		console.log ("Popping " + this.page + " view, returning to " + poppedView.page)
            this.container.find('.pushed').find('*').addBack().addClass('pushed')  // make sure any descendants added after the push are flagged as pushed
            this.container.find(':not(.pushed)').remove()
            poppedView.elements.find('*').addBack().removeClass('pushed')
            this.setPage (poppedView.page)
	    this.handlePostponedMessages()
        },

	inMessageAcceptingState: function() {
	    // states in which mood updates & moves can be received
	    return this.page == 'game' && (this.gameState === 'ready' || this.gameState === 'waitingForOther' || this.gameState === 'kicking' || this.gameState === 'gameOver')
	},

	handlePostponedMessages: function() {
	    while (this.inMessageAcceptingState() && this.postponedMessages.length) {
		var msg = this.postponedMessages[0]
		this.postponedMessages = this.postponedMessages.slice(1)
		if (this.verbose.messages)
		    console.log ("Dealing with postponed '" + msg.data.message + "' message (" + this.postponedMessages.length + " messages remaining on queue)")
		this.handlePlayerMessage (msg)
	    }
	},

	callOrPostpone: function (callback, msg) {
	    if (this.inMessageAcceptingState() && this.postponedMessages.length == 0) {
		if (this.verbose.messages)
		    console.log ("Processing '" + msg.data.message + "' message immediately")
		callback.call (this)
	    } else {
		if (this.verbose.messages)
		    console.log ("Postponing '" + msg.data.message + "' message")
		this.postponedMessages.push (msg)
	    }
	},

        // avatar upload page
        showSettingsUploadPage: function() {
            this.showUploadPage ({ uploadText: "Select one of the images below to upload a new photo, or pick an avatar.",
                                   nextPageText: "Back",
                                   showNextPage: this.showSettingsPage,
                                   transitionWhenUploaded: false })
        },

        showInitialUploadPage: function() {
            this.showUploadPage ({ uploadText: "Take a selfie for each of the four moods shown below, so other players can see how you feel. Or, pick an avatar.",
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
            
            this.setPage ('upload')
            this.moodDiv = []
            this.container
                .empty()
                .append (this.makePageTitle ("Character settings"))
                .append (this.menuBar = $('<div class="menubar">')
			 .append ($('<span class="rubric">')
				  .text(uploadText))
			 .append ($('<ul>')
				  .append (this.makeListLink ("Pick avatar", this.pickAvatarPage.bind (this, config)))
				  .append (this.makeListLink (nextPageText, showNextPage))))
                .append (this.moodSlugBar = $('<div class="moodslugbar">'))
                .append (this.moodBar = $('<div class="mooduploadbar">'))
		.append (this.moodFileInput = $('<input type="file" style="display:none;">'))
            
            if (typeof(config.moodUploaded) === 'undefined')
                config.moodUploaded = {}
            delete this.avatarConfigPromise[this.playerID]  // force reload of player avatar config
	    this.moods.forEach (function (mood, m) {
		var moodClass = "mood" + (m+1)
		var moodSlugClass = "moodslug" + (m+1)
		var div = $('<div>')
		    .addClass(moodClass)
                var uploadFunc = bh.uploadMoodPhotoFunction (mood, div, function() {
                    if (!config.moodUploaded[mood])
                        config.moodUploaded[mood] = true
                    if (transitionWhenUploaded && !bh.moods.find(function(m){return !config.moodUploaded[m]}))
                        showNextPage.call(bh)
                })
		div.on ('click', ':not(.unclickable)', uploadFunc)
                bh.moodSlugBar.append ($('<div>')
                                       .addClass(moodSlugClass)
                                       .text(mood)
                                       .on('click', uploadFunc))
		bh.moodBar.append (div)
                bh.moodDiv.push (div)
                bh.showMoodImage (bh.playerID, mood, div)
            })
        },

        pickAvatarPage: function (config) {
            var bh = this

            this.setPage ('avatar')
            this.moodDiv = []
            this.currentFaceSet = undefined
            var avatarGrid, faceSets
            var randomizeFaces = function() {
                avatarGrid.empty()
                faceSets = []
                for (var row = 0; row < 2; ++row) {
                    var span = $('<span class="avatar-grid-row">')
                    avatarGrid.append (span)
                    for (var col = 0; col < 4; ++col)
                        (function() {
                            var div = $('<div class="avatar">')
                            span.append(div)
                            var faceSet = faces.generateSet()
                            var mood = bh.moods[Math.floor (Math.random() * bh.moods.length)]
                            function update(mood) {
                                faces.display ({ container: div[0],
                                                 base: faceSet.base,
                                                 face: faceSet[mood] })
                            }
                            faceSets.push ({ faceSet: faceSet, div: div, mood: mood, update: update })
                            update(mood)
                            div.on('click', function() {
                                bh.currentFaceSet = faceSet
                                for (var m = 0; m < bh.moods.length; ++m) {
                                    faces.display ({ container: bh.moodDiv[m][0],
                                                     base: faceSet.base,
                                                     face: faceSet[bh.moods[m]] })
                                }
                            })
                        }) ()
                }
            }

            this.container
                .empty()
                .append (this.makePageTitle ("Pick an avatar"))
                .append (this.menuBar = $('<div class="menubar">')
			 .append ($('<span class="rubric">')
				  .text("Pick a face to represent you in the game. (Warning: selecting an avatar will erase any photos you have previously uploaded.)"))
                         .append (avatarGrid = $('<div class="avatar-grid">'))
			 .append ($('<div class="avatar-exit">')
                                  .append (this.makeLink ("OK", this.confirmPickAvatar.bind (this, config)))
                                  .append (this.makeLink ("More", randomizeFaces))
				  .append (this.makeLink ("Cancel", this.showUploadPage.bind (this, config)))))
                .append (this.moodSlugBar = $('<div class="moodslugbar">'))
                .append (this.moodBar = $('<div class="mooduploadbar">'))
		.append (this.moodFileInput = $('<input type="file" style="display:none;">'))
            
            randomizeFaces()
            this.pageAnimationTimer = window.setInterval (function() {
                var fs = faceSets[Math.floor(faceSets.length*Math.random())]
                var newMoods = bh.moods.filter (function(m) { return m != fs.mood })
                fs.update (fs.mood = newMoods[Math.floor(newMoods.length*Math.random())])
            }, 100)
            
            this.moods.forEach (function (mood, m) {
		var moodClass = "mood" + (m+1)
		var moodSlugClass = "moodslug" + (m+1)
		var div = $('<div>')
		    .addClass(moodClass)
                bh.moodSlugBar.append ($('<div>')
                                       .addClass(moodSlugClass)
                                       .text(mood))
		bh.moodBar.append (div)
                bh.moodDiv.push (div)
            })

            this.getAvatarConfigPromise(this.playerID)
                .done (function (avatarConfig) {
                    var config = {}
                    $.extend (true, config, avatarConfig)
                    bh.moods.forEach (function (mood, m) {
                        delete config[mood].url
                        bh.showFace (config, mood, bh.moodDiv[m])
                    })
                    bh.currentFaceSet = config
                })
        },

        confirmPickAvatar: function (config) {
            var bh = this
            if (!this.currentFaceSet)
                this.showModalMessage ("You have not selected an avatar",
                                       this.pickAvatarPage.bind (this, config))
            else
                this.REST_putPlayerAvatarConfig (this.playerID, this.currentFaceSet)
                    .done (function() {
                        config.showNextPage.call (bh)
	            }).fail (function (err) {
                        bh.showModalWebError (err)
                    })
        },

        getAvatarConfigPromise: function(id) {
            if (!this.avatarConfigPromise[id])
                this.avatarConfigPromise[id] = this.REST_getPlayerAvatarConfig(id)
            return this.avatarConfigPromise[id]
        },
        
        showMoodImage: function (id, mood, div, callback) {
            var bh = this
            this.getAvatarConfigPromise(id).done (function (avatarConfig) {
                if (avatarConfig[mood].url) {
                    var img = $('<img class="mood">')
                    if (callback)
                        img.on('load',callback)
		    img.attr ('src', avatarConfig[mood].url)
	            div.html (img)
                } else {
                    bh.showFace (avatarConfig, mood, div)
                    if (callback)
                        callback()
                }
            })
	},

        showFace: function (faceSet, mood, div) {
            faces.display ({ container: div[0],
                             base: faceSet.base,
                             face: faceSet[mood] })
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
                                       if (canvas.type === "error") {
                                           if (bh.verbose.errors)
                                               console.log("Error loading image")
                                       } else
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

            this.setPage ('confirm')
            this.container
                .empty()
                .append (this.makePageTitle ("Rotate & scale", "confirmtitle"))

	    var postBlob = function (finalBlob) {
		bh.container
		    .empty()
                    .append (bh.makePageTitle ("Uploading"))
                    .append ($('<div class="menubar">')
		             .append ($('<span>').text ("Uploading " + mood + " face...")))
		bh.REST_putPlayerAvatarMood (bh.playerID, mood, finalBlob)
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
            this.showUploadPage (config)
	},

        // active games
	showActiveGamesPage: function() {
            var bh = this

	    this.setPage ('activeGames')
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
		}).fail (function (err) {
                    bh.showModalWebError (err)
                    bh.showPlayPage()
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
                }).fail (function (err) {
                    bh.showModalWebError (err)
                })
        },

        showWaitingToJoinPage: function() {
            var bh = this
            this.setPage ('waitingToJoin')
            this.menuDiv
                .empty()
                .append ($('<span class="rubric">')
                         .text ("Waiting for another player"))
                .append ($('<ul>')
                         .append (this.makeListLink ('Cancel', this.cancelJoin)))

            this.container
                .append ($('<div class="timebar">')
			 .append (this.timerDiv = $('<div class="timer">')))
            
            var totalTime = this.botWaitTime * 1000,
            joinStartline = new Date(),
            joinDeadline = new Date (joinStartline.getTime() + totalTime)

	    this.joinWaitTimer = window.setInterval (function() {
                var now = new Date()
                var timeLeft = Math.max (0, joinDeadline - now)
	        bh.timerDiv.width((100*timeLeft/totalTime)+"%")
                if (timeLeft == 0) {
                    window.clearInterval (bh.joinWaitTimer)
		    delete bh.joinWaitTimer
		    bh.REST_getPlayerJoinBot (bh.playerID)
	                .fail (function (err) {
                            bh.showModalWebError (err)
                        })
                }
	    }, 10)
            
        },

        cancelJoin: function() {
            var bh = this
	    this.cancelJoinBot()
            this.REST_getPlayerJoinCancel (this.playerID)
                .done (this.showPlayPage.bind (this))
                .fail (this.showModalWebError.bind (this))
        },

	cancelJoinBot: function() {
	    if (this.joinWaitTimer) {
		window.clearInterval (this.joinWaitTimer)
		delete this.joinWaitTimer
	    }
	},

        // in-game menu
        showGameMenuPage: function() {
            var bh = this

            this.pushView ('gamemenu')
	    var menu
            this.container
                .append (this.makePageTitle ("Game menu"))
                .append ($('<div class="menubar">')
                         .append (menu = $('<ul>')
                                  .append (this.makeListLink ('Resume game', this.popView))))

	    if (!this.currentChoiceNode.isHistory)
                menu.append (this.makeListLink ('Status', this.showPlayerStatusPage))

            menu.append (this.makeListLink ('Audio settings', this.showAudioPage))
                .append (this.makeListLink ('Themes', this.showThemesPage))
                .append (this.makeListLink ('Exit to menu', this.exitGame))
        },

	clearMoveTimer: function() {
	    if (this.moveTimer) {
		window.clearTimeout (this.moveTimer)
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

            this.clearMoveTimer()
            this.changeMusic('game')

            this.setPage ('game')
            this.moodDiv = []
	    this.postponedMessages = []
	    this.revealMoods()

            this.container
                .empty()
                .append (this.statusBar = $('<div class="statusbar">'))
                .append ($('<div class="cardbar">')
                         .append ($('<div class="cardtable">')
                                  .append ($('<div class="slidebar">')
                                           .append ($('<div class="slidetab">')
                                                    .on ('click', function() {
							bh.container.toggleClass('bigtable')
							bh.refreshPlayerMoodImage()
							bh.refreshOpponentMoodImage()
						    })))
                                  .append (this.choiceBar = $('<div class="choicebar">')
                                           .append (this.choiceDiv = $('<div>')))
				  .append (this.stackList = $('<ul class="stack">'))))
                .append (this.moodBar = $('<div class="moodbar">'))
                .append ($('<div class="timebar">')
			 .append (bh.timerDiv = $('<div class="timer">')
				  .width("100%"))
                         .append (this.cardCountDiv = $('<div class="cardcount">')
                                  .append (this.cardCountSpan = $('<span>'))))

            var throwOutConfidence = function (offset, element) {
                return Math.min(Math.abs(offset) / element.offsetWidth, 1)
            }
            var isThrowOut = function (offset, element, throwOutConfidence) {
                return throwOutConfidence > .25 && !(bh.throwDisabled && bh.throwDisabled())
            }
            this.stack = gajus.Swing.Stack ({ throwOutConfidence: throwOutConfidence,
                                              isThrowOut: isThrowOut })

	    this.setGameState ('start')
            this.loadGameCards()
        },

	initStatusBar: function() {
	    var bh = this
            this.statusBar
                .append ($('<div class="rightstatus">')
                         .append (this.opponentNameDiv = $('<span>')
                                  .on ('click', bh.callWithSoundEffect (bh.showOpponentStatusPage))))
                .append ($('<div class="statuslink">')
                         .append ($('<span>')
                                  .html (this.makeLink ('Menu', this.showGameMenuPage))))
		.append ($('<div class="leftmood">')
			 .append (this.makeVeil())
			 .append (this.playerMoodDiv = $('<div class="moodcontainer">')))
                .append ($('<div class="rightmood">')
			 .append (this.makeVeil())
			 .append (this.opponentMoodDiv = $('<div class="moodcontainer">')))
	    this.moods.forEach (function (mood, m) {
		var moodClass = "mood" + (m+1)
		var child, div = $('<div class="moodbutton">')
		    .addClass(moodClass)
		    .append (bh.makeVeil())
		    .append (child = $('<div class="moodcontainer">'))
		bh.moodBar.append (div)
                bh.moodDiv.push (child)
		bh.showMoodImage (bh.playerID, mood, child)
	    })
	},

	makeVeil: function() {
	    return $('<div class="veil">')
		.append ($('<div class="cyloneye">'))
	},

	setGameState: function (state) {
            if (typeof state === 'undefined')
                throw "Attempt to set game state to undefined value"
	    if (this.gameState != state) {
		if (this.verbose.gameState)
		    console.log ("Changing state from " + this.gameState + " to " + state)
		if (this.gameState && !this.allowedStateTransition[this.gameState][state])
                    throw "Illegal state transition from " + this.gameState + " to " + state
		this.gameState = state
		this.handlePostponedMessages()
	    }
	},

	setGameStateCallback: function (state) {
	    return this.setGameState.bind (this, state)
	},

        loadGameCards: function() {
	    var bh = this
	    this.clearMoveTimer()

	    var isStart = this.gameState === 'start'
	    this.setGameState('loading')

            this.socket_getPlayerGameHistory (this.playerID, this.gameID, this.currentChoiceMoveNumber || 1)
		.done (function (data) {

		    if (bh.verbose.messages) {
			console.log("Received game state from server")
			console.log(data)
                    }

                    delete this.throwDisabled

		    if (isStart)
			bh.initStatusBar()

		    bh.clearStack()

                    bh.moveNumber = data.move
                    bh.defaultMove = data.defaultMove
                    
		    bh.updatePlayerMood (data.self.mood, data.startline)
		    bh.opponentNameDiv.text (bh.opponentName = data.other.name)
		    bh.updateOpponentMood (data.other.id, data.other.mood, data.startline)

		    function hookup (node, summary, move) {
			if (summary && typeof(summary.id) !== 'undefined') {
			    if (typeof(summary.move) === 'undefined')
				summary.move = move
			    summary.node = bh.nodesForMove[summary.move][summary.id]
			    node.minCardsLeft = bh.minDefined (node.minCardsLeft, summary.node.minCardsLeft + 1)
			    node.maxCardsLeft = bh.maxDefined (node.maxCardsLeft, summary.node.maxCardsLeft + 1)
			    node.expiredCardsLeft = bh.minDefined (node.expiredCardsLeft, summary.node.expiredCardsLeft + 1)
			}
		    }

		    var nextTree
		    data.history.slice(0).reverse().forEach (function (hist) {
			if (!hist.text.length)
			    hist.text = [{ text: bh.defaultAbsentText }]

			bh.nodesForMove[hist.move] = hist.text
			hist.text.forEach (function (node) {
			    node.move = hist.move
			    node.isHistory = (node.move < bh.moveNumber)

			    if (nextTree && !(node.left || node.right || node.menu)) {
				node.left = node.right = nextTree
				node.defaultSwipe = Math.random() < .5 ? 'left' : 'right'
			    }

			    hookup (node, node.left, hist.move)
			    hookup (node, node.right, hist.move)
			    if (node.menu)
				node.menu.forEach (function (item) {
				    hookup (node, item, hist.move)
				})

			    if (node.menu)
				node.defaultNext = node.menu[node.defaultMenuIndex]
			    else if (node.left && node.right)
				node.defaultNext = node[node.defaultSwipe]
			    else
				node.isFinal = true

			    if (node.left && node.right && node.left.node === node.right.node) {
				node.nextInChain = node.left.node
				if (node.left.hint === node.right.hint)
				    node.hasNoChoice = true
			    } else if (node.isHistory)
				node.nextInChain = node.defaultNext.node

			    if (node.isHistory) {
				var next = node.defaultNext.node
				node.minCardsLeft = next.minCardsLeft
				node.maxCardsLeft = next.maxCardsLeft
			    } else {
				node.expiredCardsLeft = 0
				node.minCardsLeft = node.minCardsLeft || 1
				node.maxCardsLeft = bh.maxDefined (node.maxCardsLeft, 1)
			    }
			})
			nextTree = { hint: bh.defaultNextHint,
				     move: hist.move,
				     id: hist.text.length - 1 }
		    })

		    if (typeof (bh.currentChoiceMoveNumber) === 'undefined')
			bh.currentChoiceMoveNumber = data.history[0].move
		    if (typeof (bh.currentChoiceNodeIndex) === 'undefined')
			bh.currentChoiceNodeIndex = bh.nodesForMove[bh.currentChoiceMoveNumber].length - 1
		    var node = bh.nodesForMove[bh.currentChoiceMoveNumber][bh.currentChoiceNodeIndex]
                    
		    var nextState = data.finished ? 'gameOver' : (data.waiting ? 'ready' : 'waitingForOther')
		    bh.dealCardForNode ({ node: node,
					  showDealAnimation: isStart,
					  dealDirection: bh.lastSwipe == 'left' ? 'right' : 'left' })
			.done (function() {
			    bh.initMoveTimer (data, bh.setGameStateCallback(nextState))
			})

		}).fail (function() {
                    if (loadingCardTimer)
			window.clearTimeout (loadingCardTimer)
                    // failed to load; rebuild the page
                    bh.loadGameCards()
		})
	},

	filterDefined: function() {
	    return Array.prototype.filter.call (arguments, function (x) { return typeof(x) !== 'undefined' })
	},

	minDefined: function() {
	    return Math.min.apply (null, this.filterDefined.apply (this, arguments))
	},

	maxDefined: function() {
	    return Math.max.apply (null, this.filterDefined.apply (this, arguments))
	},

        setCurrentChoiceMoveNumber: function (moveNumber) {
            if (moveNumber != this.currentChoiceMoveNumber) {
                delete this.currentChoiceNodeIndex
                if (this.verbose.moveNumber)
                    console.log ("Setting move# to " + moveNumber)
                this.currentChoiceMoveNumber = moveNumber
                this.saveGamePosition()
            }
        },

        saveGamePosition: function() {
            this.gamePosition[this.gameID] = { currentChoiceMoveNumber: this.currentChoiceMoveNumber,
                                               currentChoiceNodeIndex: this.currentChoiceNodeIndex,
                                               moveNumber: this.moveNumber }
        },

	initMoveTimer: function (data, callback) {
	    if (data.deadline) {
                this.cardCountDiv.css ('opacity', 1)
		this.startline = new Date()
		this.deadline = new Date(data.deadline)
		this.setMoveTimer (this.timerCallback, 10)
	    } else {
                this.hideTimer()
            }
	    callback()
	},

        showCountAndHints: function (node) {
	    // show hints
	    var card = node.card

	    var leftHint = node.isFinal ? this.defaultBackHint : (node.left ? node.left.hint : this.defaultNextHint)
	    var rightHint = node.isFinal ? this.defaultBackHint : (node.right ? node.right.hint : this.defaultNextHint)

	    leftHint = "← " + leftHint
	    rightHint = rightHint + " →"

            // strike if we're history
	    var leftStruck, rightStruck
            if (node.isHistory && !node.hasNoChoice) {
		if (node.defaultSwipe === 'left')
		    rightStruck = true
		else
		    leftStruck = true
	    }

	    function makeHint (choiceClass, struck, hint, dir) {
		return $('<div class="'+choiceClass+'">')
		    .append ($('<div class="hint">')
			     .append (struck
				      ? $('<span class="disabled">').append ($('<strike>').text(hint))
				      : bh.makeSilentLink (hint,
							   bh.cardThrowFunction (node, dir))))
	    }
	    
            this.choiceDiv.empty()
		.append (makeHint ('choice1', leftStruck, leftHint, this.swingDir.left))
		.append (makeHint ('choice2', rightStruck, rightHint, this.swingDir.right))

	    // show counts
            // the last two cards are the final choice and then the end waitcard placeholder, so subtract those
	    var countText
	    if (node.isHistory)
		countText = this.plural (node.expiredCardsLeft, "expired card") + " remaining"
	    else if (node.maxCardsLeft == 1)
		countText = "Last card"
	    else {
		if (node.minCardsLeft == node.maxCardsLeft)
		    countText = node.maxCardsLeft + " cards"
		else
		    countText = "At least " + this.plural (node.minCardsLeft, "card")
		countText += " in deck"
	    }

            this.cardCountSpan.text(countText)
            this.cardCountDiv.css ('opacity', 1)
        },

        plural: function(n,singular,plural) {
            plural = plural || (singular + 's')
            n = typeof(n) === 'undefined' ? 0 : n
            return n + ' ' + (n == 1 ? singular : plural)
        },

	setMoveTimer: function (callback, delay) {
	    if (this.verbose.timer)
		console.log ("Setting move timer for " + Math.round(delay) + "ms")
	    this.moveTimer = window.setTimeout (callback.bind(this), delay)
	},

	timerCallback: function() {
	    var bh = this
	    this.clearMoveTimer()
	    var now = new Date(), nowTime = now.getTime()

	    this.updateTimerDiv (this.startline, this.deadline, now)
            var quarterDeadtime = this.startline.getTime() + (this.deadline - this.startline) / 4
	    if (nowTime > quarterDeadtime && this.gameState === 'ready')
                this.stackList.children().last().addClass('jiggle')

	    if (nowTime > this.deadline.getTime()) {
		if (this.verbose.timer)
		    console.log ("Timer callback at " + now + " passed deadline at " + this.deadline)
		switch (this.gameState) {
		case 'ready':
		    this.makeDefaultMove()
		    break
		case 'waitingForOther':
		    this.startKicking()
		    break
		case 'loading':
		    this.setMoveTimer (this.timerCallback, 500)
                    break
		default:
                    if (this.verbose.errors)
		        console.log ("should never get here: move timer expired with gameState=" + this.gameState)
		    break
		}
	    } else {
		this.setMoveTimer (this.timerCallback, 10)
	    }
	},

	getTopCard: function() {
	    var topCard
	    this.stackList.children().each (function (idx, elem) {
		if (!$(elem).hasClass ('gameover')) {
		    var card = bh.stack.getCard (elem)
		    if (card)
			topCard = card
		}
	    });
	    return topCard
	},

	startKicking: function() {
	    this.setKickTimer (this.kickRetryCount)
	},

	setKickTimer: function (triesLeft) {
	    this.setMoveTimer (this.kickCallback.bind (this, triesLeft),
			       this.kickRetryMinWait + Math.random() * (this.kickRetryMaxWait - this.kickRetryMinWait))
	    this.setGameState ('kicking')
	},

	kickCallback: function (triesLeft) {
	    var bh = this
	    this.clearMoveTimer()
	    if (this.page != 'game')
		this.setKickTimer (triesLeft)
	    else {
		this.setGameState ('sendingKick')
		if (this.verbose.messages)
		    console.log("Sending kick request")
		var retry = function() {
		    if (triesLeft > 0)
			bh.setKickTimer (triesLeft - 1)
		    else {
			if (bh.verbose.errors)
			    console.log("Failed to kick; rebuilding page")
			bh.loadGameCards()
		    }
		}
		this.REST_getPlayerGameMoveKick (this.playerID, this.gameID, this.moveNumber)
		    .done (retry)
		    .fail (retry)
	    }
	},

	updateTimerDiv: function (start, end, now) {
	    var timeLeft = end - now, totalTime = end - start
	    var timeLeftFrac = timeLeft / totalTime
	    var redTimeFrac = .5
	    var redness = Math.max (0, Math.min (1, 1 - timeLeftFrac / redTimeFrac))
	    var baseColor = this.timerDiv.attr('style','').css('background-color')
	    var reddenedColor = $.xcolor.gradientlevel (baseColor, "red", redness, 1)
	    this.timerDiv
		.css ("background-color", reddenedColor)
		.width (Math.max (0, 100 * timeLeftFrac) + "%")
            if (this.gameState === 'ready') {
		var nowTime = now.getTime(),
                    endTime = end.getTime(),
                    nChimes = Math.min (this.nTimeoutChimes, Math.floor (totalTime / 2000)),
                    firstChimeTime = endTime - 1000 * nChimes
	        if (nowTime >= firstChimeTime && nowTime < endTime) {
                    var opacity = Math.sqrt (Math.abs ((timeLeft % 1000) / 500 - 1))
		    this.timerPulseElement().css ('opacity', opacity)
                    this.cardCountDiv.css ('opacity', opacity)
                    if (!this.lastChimeTime || nowTime >= this.lastChimeTime + 1000)
                        this.playSound ('timewarning')
                    this.lastChimeTime = firstChimeTime + (1000 * Math.floor ((nowTime - firstChimeTime) / 1000))
	        }
            }
	},

        hideTimer: function() {
            this.timerDiv.width(0)
        },

        timerPulseElement: function() {
	    var pulseElement
	    if (this.currentChoiceNode.menu) {
                var idx = this.selectedMenuItem ? this.selectedMenuItem.n : this.currentChoiceNode.defaultMenuIndex
		pulseElement = this.menuLabel[idx]
	    } else if (this.currentChoiceNode.hasNoChoice)
		pulseElement = $('.choice1,.choice2').find(':visible')
	    else {
		var choiceClass = this.currentChoiceNode.defaultSwipe == 'left' ? 'choice1' : 'choice2'
		pulseElement = $('.'+choiceClass).find(':visible')
	    }
            return pulseElement
        },

	makeSwipeFunction: function (node, dir) {
	    var bh = this
	    return function() {
		bh.lastSwipe = dir

		var child
		if (node.isHistory)
		    child = node.defaultNext
		else if (node.menu)
		    child = bh.selectedMenuItem
		else
		    child = node[dir]

                if (child) {
		    if (node.isHistory)
			bh.resetLastChoice()
		    else
			bh.updateLastChoice (node)

		    var nextNode = child.node
		    bh.setCurrentNode (nextNode)

		    if (nextNode.isFinal)
			bh.makeMove (bh.moveNumber, bh.lastChoice || dir.charAt(0))

		    if (node.nextInChain)  // next card already dealt?
                        bh.showCountAndHints (nextNode)
                    else
			bh.dealCardForNode ({ node: nextNode,
					      showDealAnimation: true,
                                              dealDirection: dir == 'right' ? 'left' : 'right' })

		} else {
		    bh.playSound ('gameover')
		    bh.showPlayPage()
                }
	    }
	},

	resetLastChoice: function() {
	    delete this.lastChoice
	    delete this.lastPriority
	},

        updateLastChoice: function (node) {
	    if (node.choice) {
                var newPriority = node.priority || 0
                if (!(this.lastPriority > newPriority)) {  // gives correct result when this.lastPriority is undefined
		    if ((this.lastPriority || 0) == newPriority
			&& this.lastChoice
			&& node.concat
			&& node.choice)
			this.lastChoice += node.choice
		    else {
			this.lastChoice = node.choice
			this.lastPriority = newPriority
                    }
		}
            }
        },
        
	setCurrentNode: function (node) {
	    this.currentChoiceNode = node
	    this.currentChoiceNodeIndex = node.id
	    this.currentChoiceMoveNumber = node.move
	    this.saveGamePosition()
	    this.showCountAndHints (node)
	    if (node.isHistory)
		this.hideMoods()
	    else {
		this.updateLastChoice (node)
		this.revealMoods()
	    }
	},
        
        hideMoods: function() {
            this.container.addClass ('history')
        },

        revealMoods: function() {
            this.container.removeClass ('history')
        },

	dealCardForNode: function (info) {
            var bh = this

            var node = info.node
	    if (!info.dealingAhead)
		this.setCurrentNode (node)

	    var nextInChain = node.nextInChain
	    var nextCardDealt
	    if (nextInChain) {
		var nextInfo = {}
		$.extend (nextInfo, info)
		nextInfo.node = nextInChain
		nextInfo.dealingAhead = true
		nextCardDealt = bh.dealCardForNode (nextInfo)
	    } else {
		nextCardDealt = $.Deferred()
		nextCardDealt.resolve()
	    }

	    // text can override default cardClass, sfx
	    var text = node.text
	    var sfx, cardClass
	    if (node.isFinal)
		cardClass = 'waitcard'
	    else if (node.isHistory)
		cardClass = 'history'

	    text = text.replace (/<outcome:([^> ]+)>/g, function (match, outcomeVerb) {
		cardClass = 'outcome'
		sfx = outcomeVerb
		return ""
	    })

	    text = text.replace (/<class:([^> ]+)>/g, function (match, className) {
		cardClass = className
		return ""
	    })

	    text = text.replace (/<sfx:([^> ]+)>/g, function (match, sfxName) {
		sfx = sfxName
		return ""
	    })

            // misc text expansions go here...
	    text = text.replace (/<icon:([^> ]+)>/g, function (match, iconName) {
		return '<img src="' + bh.iconPrefix + iconName + bh.iconSuffix + '"></img>'
	    })

	    // create the <span>'s
            var content = text.split(/\n/)
		.filter (function (para) {
		    return /\S/.test(para)
		}).map (function (para) {
		    return $('<span>').html(para)
                })

	    // create the menu, if applicable
	    if (node.menu) {
		var fieldset = $('<fieldset class="cardmenu">')
		this.menuLabel = []
                if (node.isHistory)
                    this.selectedMenuItem = node.menu[node.defaultMenuIndex]
                else
		    delete this.selectedMenuItem
		var menuSelectCallback
		node.menu.forEach (function (item, n) {
		    var id = 'cardmenuitem' + n
                    item.n = n
                    var itemStruck = node.isHistory && n != node.defaultMenuIndex
                    fieldset
			.append ($('<input type="radio" name="cardmenu" id="'+id+'" value="'+n+'">'))
			.append (bh.menuLabel[n] = $('<label for="'+id+'" class="cardmenulabel">'))
                    if (itemStruck)
                        bh.menuLabel[n].html ($('<span class="disabled">').html ($('<strike>').text(item.hint)))
                    else
                        bh.menuLabel[n].text(item.hint)
			.on('click',function() {
                            bh.timerPulseElement().css ('opacity', 1)  // in case something else is pulsing
			    bh.selectedMenuItem = item
			    if (menuSelectCallback)
				menuSelectCallback.call (bh, item, n)
			})
		})
		content.push (fieldset)
                if (!node.isHistory) {
		    if (info.dealingAhead)
			throw "Oops: non-historic menu card is not top of pile"
		    var selectWarning = $('<span class="warnselect">')
			.text("Please select an option")
			.css('visibility','hidden')
		    content.push (selectWarning)
		    bh.throwDisabled = function() { selectWarning.css('visibility','visible'); return true }
		    bh.choiceDiv.hide()
		    menuSelectCallback = function (menuItem, menuIndex) {
			selectWarning.css('visibility','hidden')
			bh.choiceDiv.show()
			delete bh.throwDisabled
		    }
                }
	    }
            
	    // create the <li>
            var cardListItem = $('<li>').append(content)
            if (cardClass)
                cardListItem.addClass (cardClass)
            this.stackList.append (cardListItem)
	    if (this.verbose.stack) {
		console.log ("Card #" + this.cardIndex(cardListItem[0]) + " added: " + cardListItem[0].innerHTML)
		this.logStack()
	    }

	    // create & deal the card
	    var cardDealt = $.Deferred(), allCardsDealt = $.Deferred()

            var card = this.stack.createCard (cardListItem[0])
	    node.card = card

	    card.elem = cardListItem[0]
            card.on ('dragstart', function() {
                cardListItem.addClass ('dragging')
            })
            card.on ('dragend', function() {
                cardListItem.removeClass ('dragging')
            })

	    function addThrowListener (eventName, sfx, callback) {
		card.on (eventName, function () {
		    if (bh.verbose.stack)
			console.log ("Card #" + bh.cardIndex(cardListItem[0]) + " thrown: " + cardListItem[0].innerHTML)
                    cardListItem.removeClass('jiggle').addClass('thrown')
		    bh.playSound (sfx)
                    callback.call (bh)
                    bh.fadeCard (cardListItem, card)
		})
	    }

	    var swipeLeft = bh.makeSwipeFunction (node, (node.isHistory && !node.menu) ? node.defaultSwipe : 'left')
            var swipeRight = bh.makeSwipeFunction (node, (node.isHistory && !node.menu) ? node.defaultSwipe : 'right')

	    addThrowListener ('throwoutleft', 'swipeleft', swipeLeft)
	    addThrowListener ('throwoutright', 'swiperight', swipeRight)

	    if (info.showDealAnimation) {
		card.on ('throwinend', function() {
		    cardDealt.resolve()
		})
		card.throwIn (info.dealDirection == 'left' ? -this.dealXOffset : +this.dealXOffset, -this.dealYOffset)
	    } else
		cardDealt.resolve()

	    nextCardDealt.done (function() {
		cardDealt.done (function() {
		    allCardsDealt.resolve()
		})
	    })

	    // play sound and return promise
	    if (sfx)
		bh.playSound (sfx)

	    return allCardsDealt
	},

	isFinalCard: function (node) {
	    return !(node.menu || node.left || node.right)
	},
        
	cardIndex: function (elem) {
	    return elem.parentNode ? Array.prototype.indexOf.call (elem.parentNode.children, elem) : '???'
	},

	logStack: function() {
	    console.log ($.map (bh.stackList.children(), function (elem, idx) {
		var c = elem.getAttribute('class')
		return (c ? ("("+c+") ") : "") + elem.innerHTML
	    }))
	},

	clearStack: function() {
	    var bh = this
	    $.map (bh.stackList.children(), function (elem, idx) {
		var card = bh.stack.getCard (elem)
		if (!$(elem).hasClass('thrown')) {
		    $(elem).remove()
		    if (card)
			card.destroy()
		}
	    })
	    bh.logStack()
	},
        
        fadeCard: function (listItem, card) {
	    var bh = this
            listItem.find('*').off()
            listItem.fadeOut (this.cardFadeTime, function() {
		if (bh.verbose.stack)
		    console.log ("Card #" + bh.cardIndex(listItem[0]) + " removed after fade: " + listItem.html())
		listItem.remove()
		card.destroy()
		if (bh.verbose.stack)
		    bh.logStack()
	    })
        },
        
        updatePlayerMood: function (mood, time) {
            var bh = this
            this.lastMood = mood
            var date = new Date (time)
            if (!time || !this.lastPlayerMoodTime || date > this.lastPlayerMoodTime) {
                if (this.verbose.messages)
                    console.log ("Updating player mood to " + mood + " for move #" + this.moveNumber + " at time " + time)
		if (time)
                    this.lastPlayerMoodTime = date
		this.playerMood = mood
		this.refreshPlayerMoodImage()
                for (var m = 0; m < this.moods.length; ++m) {
                    var newMood = this.moods[m]
                    this.moodDiv[m].off()
		    if (newMood == mood)
		        this.moodDiv[m]
                        .addClass('selected')
                        .removeClass('unselected')
		    else {
		        this.moodDiv[m]
                            .addClass('unselected')
                            .removeClass('selected')
			    .on('click',
			        ':not(.unclickable)',
			        bh.changeMoodFunction (bh.moveNumber, newMood))
		    }
                }
            }
        },

        updateOpponentMood: function (id, mood, time) {
            var bh = this
            var date = new Date (time)
            if (!this.lastOpponentMoodTime || date > this.lastOpponentMoodTime) {
                this.lastOpponentMoodTime = date
		this.opponentId = id
		this.opponentMood = mood
		this.refreshOpponentMoodImage()
	    }
	},

	refreshMoodImage: function (id, mood, div, callback) {
	    var bh = this
	    // the test for class 'bigtable' is for Moz's benefit...
	    // somehow, the error thrown by facesjs when it can't get a bounding box
	    // (which happens when its containing element is hidden)
	    // is enough to derail JQuery's calling promise, breaking getAvatarConfigPromise.
	    // i know, right? ...ugh.
	    // We refresh the images when we toggle the bigtable class, so it's no biggie.
	    if (mood && !this.container.hasClass('bigtable'))
		this.showMoodImage
            (id, mood, div,
             function() {
                 bh.playerMoodDiv
                     .off ('click')
                     .on ('click', bh.callWithSoundEffect (callback))
             })
	},

	refreshPlayerMoodImage: function() {
	    this.refreshMoodImage (this.playerID, this.playerMood, this.playerMoodDiv, this.showPlayerStatusPage)
	},

	refreshOpponentMoodImage: function() {
	    this.refreshMoodImage (this.opponentId, this.opponentMood, this.opponentMoodDiv, this.showOpponentStatusPage)
	},

	callOrRetry (makePromise, retryCount, minWait, maxWait, validate) {
	    validate = validate || function() { return null }
	    var bh = this
	    var def = $.Deferred()
	    var attempt, retry
	    retry = function (err) {
		if (retryCount > 0) {
		    --retryCount
		    var wait = minWait + Math.random() * (maxWait - minWait)
		    if (bh.verbose.errors)
			console.log ("Call failed (" + err.toString() + "). Retrying in " + Math.round(wait) + "ms")
		    window.setTimeout (attempt, wait)
		} else
		    def.reject (err)
	    }
	    attempt = function() {
		makePromise()
		    .done (function (result) {
			var err = validate (result)
			if (!err)
			    def.resolve (result)
			else
			    retry (err)
		    }).fail (retry)
	    }
	    attempt()
	    return def
	},

	makeMoveOrRetry: function (moveNumber, choice) {
	    var f = this.REST_getPlayerGameMoveChoice.bind (this, this.playerID, this.gameID, moveNumber, choice)
	    return this.callOrRetry (f, this.moveRetryCount, this.moveRetryMinWait, this.moveRetryMaxWait, null)
	},

        makeMove: function (moveNumber, choice) {
	    var bh = this
	    if (bh.moveNumber == moveNumber && this.gameState === 'ready') {
		if (this.verbose.messages)
		    console.log ("Making move #" + moveNumber + ": " + choice)
		bh.setGameState ('sendingMove')
		bh.makeMoveOrRetry (moveNumber, choice)
		    .done (function() { bh.setGameState ('waitingForOther') })
		    .fail (function() {
			if (bh.verbose.errors)
			    console.log("Failed to make move; rebuilding page")
			bh.loadGameCards()
		    })
	    }
        },
        
	makeDefaultMove: function() {
	    var bh = this
	    this.setGameState ('sendingDefaultMove')

            // figure out which node, or summary, to look to for the default move
            // if there's queued-up history, use the root node of the last history item in the queue (i.e. the text for the most recent cards)
            // otherwise, use the child pointed to by the defaultSwipe (if a swipe card), or the defaultMenuIndex (if a menu card)
            var oracle
            if (this.currentChoiceNode.isHistory) {
                var text = this.nodesForMove[this.moveNumber]
		if (text.length)
                    oracle = text[text.length - 1]
	    } else
		oracle = this.currentChoiceNode.defaultNext
            if (oracle)
                this.updateLastChoice (oracle.defaultMove || oracle)
            
            var move = this.lastChoice
	    if (this.verbose.messages)
		console.log ("Making default move #" + this.moveNumber + ": " + move)
	    this.makeMoveOrRetry (this.moveNumber, move)
		.done (bh.startKicking.bind(bh))
		.fail (function() {
                    if (bh.verbose.errors)
		        console.log("Failed to make default move; rebuilding page")
		    bh.loadGameCards()
		})
	},

        changeMoodFunction: function (moveNumber, mood) {
            var bh = this
            return function() {
                bh.playSound (mood)
                bh.updatePlayerMood (mood)  // call to update image, don't provide a timestamp
                bh.moodBar.find('*').addClass('unclickable')
//                console.log ("changeMoodFunction: move=#" + moveNumber + " mood=" + mood)
                bh.REST_getPlayerGameMoveMood (bh.playerID, bh.gameID, moveNumber, mood)
                    .done (function (data) {
                        bh.moodBar.find('*').removeClass('unclickable')
                        bh.updatePlayerMood (mood, data.time)  // call again to update timestamp
                    }).fail (function () {
                        bh.moodBar.find('*').removeClass('unclickable')
                    })
            }
        },

        cardThrowFunction: function (node, direction) {
            var bh = this
            return function() {
		if (bh.verbose.stack) {
		    console.log ("Throwing card #" + bh.cardIndex(node.card.elem) + ": " + node.card.elem.innerHTML)
		    bh.logStack()
		}
                node.card.throwOut (300*direction, 600*(Math.random() - .5))
            }
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
            case "timeout":
                if (msg.data.game == this.gameID) {
		    if (this.verbose.messages)
			console.log ("Received '" + msg.data.message + "' message for move #" + msg.data.move + "; current move #" + this.moveNumber)
                    if (msg.data.move >= this.moveNumber)
                        this.callOrPostpone (this.loadGameCards.bind (this), msg)
		}
                break
            case "mood":
                if (this.gameID == msg.data.game) {
                    if (this.verbose.messages)
			console.log ("Received '" + msg.data.message + "' message for move #" + msg.data.move + " time " + msg.data.time + "; last update at move #" + this.moveNumber + " time " + this.lastOpponentMoodTime)
                    if (msg.data.move >= this.moveNumber && new Date(msg.data.time) > this.lastOpponentMoodTime)
			this.callOrPostpone (function() {
			    this.playSound (msg.data.other.mood, .5)
			    this.updateOpponentMood (msg.data.other.id, msg.data.other.mood, msg.data.time)
			}, msg)
		}
                break
            default:
                if (this.verbose.messages) {
                    console.log ("Unknown message")
                    console.log (msg)
                }
                break
            }
        },

	startGame: function (gameID) {
            this.playSound ('gamestart')
            this.gameID = gameID
            delete this.gameState
            delete this.lastSwipe
	    delete this.lastPlayerMoodTime
	    delete this.lastOpponentMoodTime

            delete this.moveNumber
            delete this.currentChoiceMoveNumber
            delete this.currentChoiceNodeIndex
            delete this.currentChoiceNode
	    this.nodesForMove = {}
            var gamePos = this.gamePosition[this.gameID]
            if (gamePos) {
                this.moveNumber = gamePos.moveNumber
                this.setCurrentChoiceMoveNumber (gamePos.currentChoiceMoveNumber)
                this.currentChoiceNodeIndex = gamePos.currentChoiceNodeIndex
            }

	    this.resetLastChoice()
            this.showGamePage()
	},

        // audio
        startMusic: function (type, volume, promise) {
            if (this.verbose.music)
                console.log('Starting music: '+type+' at volume '+volume)
            this.currentMusicVolume = volume
            var music = new Howl({
                src: ['/audio/' + type + '-music.mp3'],
                loop: true,
                volume: volume,
                onload: function() {
                    if (bh.verbose.music)
                        console.log('Music loaded: '+type)
                    music.play()
                    promise.resolve (music)
                },
                onloaderror: function() {
                    promise.reject()
                }
            });
        },

        changeMusic: function (type, volume) {
            type = type || this.musicType
            volume = (volume || 1) * this.musicVolume
            var bh = this
            var oldPromise = this.musicPromise
            var oldType = this.musicType
            if (this.verbose.music)
                console.log ('Cueing music '+type+' after '+oldType)
            if (!oldType)
                this.startMusic (this.musicType = type, volume, this.musicPromise = $.Deferred())
            else if (oldType == type)
                oldPromise.done (function (oldMusic) {
                    oldMusic.volume (bh.currentMusicVolume = volume)
                })
            else {
                var newPromise = $.Deferred()
                bh.musicType = type
                bh.musicPromise = newPromise
                oldPromise.done (function (oldMusic) {
                    if (bh.verbose.music)
                        console.log ('Music '+oldType+' playing, switching to '+type)
                    function stopAndStart() {
                        if (bh.verbose.music)
                            console.log ('Stopping music '+oldType+', so we can start '+type)
                        oldMusic.stop()
                        bh.startMusic (type, volume, newPromise)
                    }
                    if (bh.currentMusicVolume && bh.musicPromise === newPromise) {
                        if (bh.verbose.music)
                            console.log ('Fading out music '+oldType+', in preparation for '+type)
                        oldMusic.fade (bh.currentMusicVolume, 0, bh.musicFadeDelay)
                        oldMusic.once ('fade', stopAndStart)
                    } else
                        stopAndStart()
                }).fail (function() {
                    bh.startMusic (type, volume, newPromise)
                })
            }
        },

        playSound: function (type, volume) {
            volume = volume || 1
            var sound = new Howl ({
                src: ['/audio/' + type + '.wav'],
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
