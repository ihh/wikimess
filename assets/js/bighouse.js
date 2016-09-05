var BigHouse = (function() {
    var proto = function (config) {
        config = config || {}
        $.extend (this, config)
        this.container = $('#'+this.containerID)
        this.playerName = localStorage.getItem (this.playerNameStorageKey)
        this.socket_onPlayer ($.proxy (this.handlePlayerMessage, this))
        this.showLoginPage()
    }

    $.extend (proto.prototype, {
        // default params/data
        containerID: 'bighouse',
        playerNameStorageKey: 'bighousePlayerName',
        moods: ['happy', 'surprised', 'angry', 'sad'],
        
        // REST interface
        REST_getPlayerId: function (playerName) {
            return $.get('/player/id/' + playerName)
        },

        REST_postPlayer: function (playerName) {
            return $.post('/player/', { name: playerName })
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
            return $('<li>')
                .append(this.makeLink (text, callback))
        },

        // login menu
        showLoginPage: function() {
            this.page = 'login'
            this.container
                .empty()
                .append ($('<form>')
                         .append ($('<label for="player">')
                                  .text('Player name'))
                         .append (this.nameInput = $('<input name="player" type="text">')))
                .append ($('<ul>')
                         .append (this.makeListLink ('Log in', this.doLogin))
                         .append (this.makeListLink ('Create player', this.createPlayer)))
            if (this.playerName)
                this.nameInput.val (this.playerName)
        },

        validatePlayerName: function() {
            this.playerName = this.nameInput.val()
            if (!this.playerName.length) {
                this.showModalMessage ("Please enter a player name")
                return false
            }
            localStorage.setItem (this.playerNameStorageKey, this.playerName)
            return true
        },
        
        doLogin: function (evt) {
            var bh = this
            if (this.validatePlayerName())
                this.REST_getPlayerId (this.playerName)
                .done (function (data) {
                    bh.playerID = data.id
                    bh.showPlayPage()
                })
                .fail (function (err) {
                    if (err.status == 404)
                        bh.showModalMessage ("Player '" + bh.playerName + "' not found")
                    else
                        bh.showModalWebError (err)
                })
        },

        createPlayer: function (evt) {
            var bh = this
            if (this.validatePlayerName())
                this.REST_postPlayer (this.playerName)
                .done (function (data) {
                    console.log (data)
                    bh.playerID = data.id
                    bh.showPlayPage()
                })
                .fail (function (err) {
                    if (err.status == 400)
                        bh.showModalMessage ("Player '" + bh.playerName + "' already exists")
                    else
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
                .append ($('<div>')
                         .text ("Player: " + this.playerName))
                .append (cashDiv = $('<div>'))
                .append ($('<ul>')
                         .append (this.makeListLink ('Play game', this.joinGame))
                         .append (this.makeListLink ('Log out', this.showLoginPage)))
            
            this.REST_getPlayerStats (this.playerID)
                .done (function (data) {
                    cashDiv.text ("Score: $" + data.cash)
                })
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
            this.container
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
        initGame: function() {
            delete this.outcome
        },
        
        showGamePage: function() {
            var bh = this

            if (this.page == 'game') {
                // page is already initialized
            } else {
                this.page = 'game'
                this.container
                    .empty()
                    .append ($('<div>')
                             .append ($('<div>')
                                      .text ("Player: " + this.playerName))
                             .append (this.playerCashDiv = $('<div>'))
                             .append ($('<div>')
                                      .append (this.playerMoodDiv = $('<div>'))
                                      .append (this.playerChangeMoodList = $('<ul>'))))
                    .append ($('<div>')
                             .append (this.opponentNameDiv = $('<div>'))
                             .append (this.opponentMoodDiv = $('<div>')))
                    .append ($('<div>')
                             .append ($('<div id="viewport">')
                                      .append (this.stackList = $('<ul class="stack">')))
                             .append (this.rewardDiv = $('<div>'))
                             .append (this.choiceList = $('<ul>'))
                             .append (this.nextList = $('<ul>')))
                    .append ($('<div>')
                             .append (this.quitLink = this.makeLink ('Quit game', this.showPlayPage)))

                this.stack = gajus.Swing.Stack()
                this.createCardListItem (this.waitSpan = $('<span>'), 'waitcard')
            }

            this.revealChoice()
            this.loadGameCard()
        },

        loadGameCard: function() {
            this.waitSpan.text ("Loading")
            this.choiceList.empty()
            this.socket_getPlayerGame (this.playerID, this.gameID)
                .done (function (data) {
                    if (data.finished) {
                        bh.quitLink.text ("Back to menu")
                        bh.waitSpan.text ("Game Over")
                    } else {
                        bh.moveNumber = data.move
                        bh.playerCash = data.self.cash

                        bh.updatePlayerCash (data.self.cash)
                        bh.updatePlayerMood (data.self.mood)
                        bh.opponentNameDiv.text ("Other player: " + data.other.name)
                        bh.updateOpponentMood (data.other.mood)

                        var makeMoveC = bh.makeMoveFunction (data.move, 'c')
                        var makeMoveD = bh.makeMoveFunction (data.move, 'd')

                        var cardListItem = bh.createCardListItem ($('<span>').html (data.intro), 'verb-' + data.verb)
                        var card = bh.addCard (cardListItem, makeMoveC, makeMoveD)
                        if (bh.outcomeCardListItem)
                            bh.moveCardToTop (bh.outcomeCardListItem)
                        
                        bh.choiceList
                            .append (bh.makeListLink (data.hintc, bh.cardThrowFunction (card, gajus.Swing.Card.DIRECTION_RIGHT)))
                            .append (bh.makeListLink (data.hintd, bh.cardThrowFunction (card, gajus.Swing.Card.DIRECTION_LEFT)))

                        bh.waitSpan.text ("Waiting for other player")
                    }
                })
        },

        createCardListItem: function (cardContent, cardClass) {
            var listItem = $('<li class="in-deck ' + (cardClass || "") + '">')
            listItem.append ($('<div>').append (cardContent))
            this.stackList.append (listItem)
            return listItem
        },
        
        addCard: function (listItem, rightCallback, leftCallback) {
            leftCallback = leftCallback || function() { }
            rightCallback = rightCallback || leftCallback
            var bh = this
            var card = this.stack.createCard (listItem[0])
            card.on ('throwoutright', function () {
                rightCallback.call (bh)
                listItem.prop('disabled',true)
                listItem.fadeOut (500, function() { listItem.remove() })
            })
            card.on ('throwoutleft', function () {
                leftCallback.call (bh)
                listItem.prop('disabled',true)
                listItem.fadeOut (500, function() { listItem.remove() })
            })
            return card
        },

        moveCardToTop: function (listItem) {
            this.stackList.append (listItem)
        },
        
        updatePlayerCash: function (cash) {
            this.playerCashDiv.text ("Player score: $" + cash)
        },

        updatePlayerMood: function (mood) {
            var bh = this
            this.playerMoodDiv.text ("Player mood: " + mood)
            this.playerChangeMoodList.empty()
                .append (this.moods
                         .filter (function (newMood) { return newMood != mood })
                         .map (function (newMood) {
                             return bh.makeListLink ("I'm " + newMood, bh.changeMoodFunction (bh.moveNumber, newMood))
                         }))
        },

        updateOpponentMood: function (mood) {
            this.opponentMoodDiv.text ("Other player mood: " + mood)
        },

        makeMoveFunction: function (moveNumber, choice) {
            var bh = this
            return function() {
                bh.socket_getPlayerGameMoveChoice (bh.playerID, bh.gameID, moveNumber, choice)
                    .done (function (data) {
                        if (data.waiting)
                            bh.choiceList.empty()
                            .append ($('<div>')
                                     .text ("Waiting for other player"))
                    })
            }
        },
        
        changeMoodFunction: function (moveNumber, mood) {
            var bh = this
            return function() {
                this.playerChangeMoodList.find('li').prop('disabled',true)
                this.REST_getPlayerGameMoveMood (this.playerID, this.gameID, moveNumber, mood)
                    .done (function (data) {
                        bh.updatePlayerMood (mood)
                    })
            }
        },

        showOutcome: function() {
            this.updatePlayerCash (this.playerCash + this.outcome.self.reward)
            this.updatePlayerMood (this.outcome.self.mood)
            this.updateOpponentMood (this.outcome.other.mood)
            this.outcomeCardListItem = this.createCardListItem (this.outcome.outro)
            var card = this.addCard (this.outcomeCardListItem, this.revealChoice)
            this.choiceList.hide()
            this.nextList.empty()
                .append (this.makeListLink ("Next", this.cardThrowFunction (card, gajus.Swing.Card.DIRECTION_RIGHT)))
                .show()
            this.loadGameCard()
        },

        revealChoice: function() {
            this.choiceList.show()
            this.nextList.hide()
            delete this.outcomeCardListItem
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
                    this.gameID = msg.data.game
                    this.initGame()
                    this.showGamePage()
                }
                break
            case "move":
                if (this.page == 'game' && this.gameID == msg.data.game) {
                    this.outcome = msg.data.outcome
                    this.moveNumber = parseInt(msg.data.move) + 1  // this is required so that we can change move from the outcome page
                    this.showOutcome()
                }
                break
            case "mood":
                if (this.page == 'game' && this.gameID == msg.data.game) {
                    this.updateOpponentMood (msg.data.other.mood)
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
