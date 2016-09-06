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
		    .on ('click', bh.uploadMoodPhotoFunction (mood))
		bh.moodBar.append (div)
                bh.moodDiv.push (div)
            })
        },

	makeMoodImage: function (id, mood) {
	    return $('<img>')
		.attr ('width', '100%')
		.attr ('height', '100%')
		.attr ('src', bh.REST_urlPlayerAvatar (id, mood))
	},

	uploadMoodPhotoFunction: function (mood) {
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
				console.log ("Success")
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
