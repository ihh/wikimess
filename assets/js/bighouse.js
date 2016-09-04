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
        // default params
        containerID: 'bighouse',
        playerNameStorageKey: 'bighousePlayerName',
        
        // REST interface
        REST_getPlayerId: function (name) {
            return $.get('/player/id/' + name)
        },

        REST_postPlayer: function (name) {
            return $.post('/player/', { name: name })
        },

        REST_getPlayerCancel: function (id) {
            return $.get ('/player/' + id + '/cancel')
        },

        // WebSockets interface
        socket_onPlayer: function (callback) {
            io.socket.on ('player', callback)
        },

        socket_getPlayerJoin: function (id, callback) {
            io.socket.get ('/player/' + id + '/join', callback)
        },

        // helpers
        makeListLink: function (text, callback) {
            var cb = $.proxy (callback, this)
            return $('<li>')
                .append($('<a href="#">')
                        .text (text)
                        .on ('click', function (evt) {
                            evt.preventDefault()
                            cb(evt)
                        }))
        },
        
        // login menu
        showLoginPage: function() {
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
            this.container
                .empty()
                .append ($('<span>')
                         .text ("Player " + this.playerName))
                .append ($('<ul>')
                         .append (this.makeListLink ('Play game', this.joinGame))
                         .append (this.makeListLink ('Log out', this.showLoginPage)))
        },

        // join game
        joinGame: function() {
            var bh = this
            this.socket_getPlayerJoin (this.playerID,
                                       function (resData, jwres) {
                                           if (resData.waiting)
                                               bh.showWaitingToJoinPage()
                                       })
        },

        showWaitingToJoinPage: function() {
            var bh = this
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
        
        // socket message handler
        handlePlayerMessage: function (msg) {
            switch (msg.data.message) {
            case "join":
                // if on 'play menu' page or 'waiting to join' page, show game page
                var gameID = msg.data.game
                break
            case "move":
                // if on 'game' page or 'waiting for other player' page (for this game), show outcome page
                var gameID = msg.data.game
                break
            default:
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
