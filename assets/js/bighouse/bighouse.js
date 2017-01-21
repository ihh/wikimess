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
    this.iconPromise = {}
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
    iconPrefix: '/images/icons/',
    iconSuffix: '.svg',
    blankImageUrl: '/images/1x1blank.png',
    facebookButtonImageUrl: '/images/facebook.png',
    maxNameLength: 16,
    moods: ['happy', 'surprised', 'sad', 'angry'],
    musicFadeDelay: 800,
    cardFadeTime: 500,
    jiggleDelay: 5000,
    avatarSize: 128,
    cardDelimiter: ';;',
    nTimeoutChimes: 3,
    moveRetryCount: 3,
    moveRetryMinWait: 10,
    moveRetryMaxWait: 500,
    kickRetryCount: 10,
    kickRetryMinWait: 1000,
    kickRetryMaxWait: 2000,
    minCardDisplayTimeInSeconds: 15,
    allowedStateTransition: { start: { loading: true },
			      loading: { gameOver: true, ready: true, waitingForOther: true },
			      ready: { sendingMove: true, sendingDefaultMove: true, loading: true },
			      waitingForOther: { kicking: true, loading: true },
			      sendingMove: { waitingForOther: true, loading: true },
			      sendingDefaultMove: { kicking: true, loading: true },
			      kicking: { loading: true, sendingKick: true },
			      sendingKick: { kicking: true, loading: true },
			      gameOver: { } },

    swingDir: { left: -1,
		right: +1 },

    defaultBackHint: "Back",
    defaultNextHint: "Next",
    defaultWaitText: "<wait>",
    defaultAbsentText: "Time passes...",
    
    themes: [ {style: 'plain', text: 'Plain'},
              {style: 'cardroom', text: 'Card room'} ],

    navIcons: { view: 'binoculars',
                settings: 'cog',
                status: 'swap-bag',
                follows: 'relationship-bounds',
                games: 'card-random' },

    eventButtonText: { locked: 'Locked',
		       start: 'Start',
		       resetting: 'Locked',
		       starting: 'Starting',
		       ready: 'Go',
		       waiting: 'Waiting',
		       finished: 'Go' },
    
    verbose: { page: false,
               gameState: true,
               moveNumber: true,
               messages: true,
               timer: false,
               errors: true,
               music: false,
	       stack: false },

    // uncomment to remove time limit for debugging purposes (or to cheat)
//    disableMoveTimer: true,
    
    globalMenuCount: 0,
    
    // REST interface
    REST_loginFacebook: function() {
      window.location.replace ('/login/facebook')
    },

    REST_postPlayer: function (playerName, playerPassword) {
      return $.post('/player/new', { name: playerName, password: playerPassword })
    },

    REST_postLogin: function (playerName, playerPassword) {
      return $.post('/login', { name: playerName, password: playerPassword })
    },

    REST_getLogout: function() {
      return $.post('/logout')
    },
    
    REST_getPlayerJoin: function (playerID, eventID) {
      return $.get ('/player/' + playerID + '/join/' + eventID)
    },

    REST_getPlayerJoinBot: function (playerID, eventID) {
      return $.get ('/player/' + playerID + '/join/' + eventID + '/bot')
    },

    REST_getPlayerGames: function (playerID, eventID) {
      return $.get ('/player/' + playerID + '/games')
    },

    REST_getPlayerFollow: function (playerID) {
      return $.get ('/player/' + playerID + '/follow')
    },

    REST_getPlayerFollowOther: function (playerID, otherID) {
      return $.get ('/player/' + playerID + '/follow/' + otherID)
    },

    REST_getPlayerUnfollowOther: function (playerID, otherID) {
      return $.get ('/player/' + playerID + '/unfollow/' + otherID)
    },

    REST_getPlayerStatus: function (playerID) {
      return $.get ('/player/' + playerID + '/status')
    },

    REST_getPlayerGameStatusSelf: function (playerID, gameID) {
      return $.get ('/player/' + playerID + '/game/' + gameID + '/status/self')
    },

    REST_getPlayerGameStatusOther: function (playerID, gameID) {
      return $.get ('/player/' + playerID + '/game/' + gameID + '/status/other')
    },

    REST_putPlayerGameMove: function (playerID, gameID, move, choice) {
      return $.ajax ({ url: '/player/' + playerID + '/game/' + gameID + '/move/' + move,
                       type: 'PUT',
                       cache: false,
                       contentType: 'application/json',
                       data: JSON.stringify ({ move: choice })
                     })
    },

    REST_getPlayerGameMoveKick: function (playerID, gameID, moveNumber) {
      return $.get ('/player/' + playerID + '/game/' + gameID + '/move/' + moveNumber + '/kick')
    },

    REST_getPlayerGameMoveMood: function (playerID, gameID, move, mood) {
      return $.get ('/player/' + playerID + '/game/' + gameID + '/move/' + move + '/mood/' + mood)
    },

    REST_getPlayerGameMoveQuit: function (playerID, gameID, moveNumber) {
      return $.get ('/player/' + playerID + '/game/' + gameID + '/move/' + moveNumber + '/quit')
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

    REST_postPlayerLocationTrade: function (playerID, locationID, itemName, itemCount) {
      return $.post('/player/' + playerID + '/location/' + locationID + '/trade', { name: itemName, count: itemCount })
    },

    // WebSockets interface
    socket_onPlayer: function (callback) {
      io.socket.on ('player', callback)
    },

    socket_getPlayerHome: function (playerID) {
      return this.socketGetPromise ('/player/' + playerID + '/home')
    },

    socket_getPlayerLocation: function (playerID, location) {
      return this.socketGetPromise ('/player/' + playerID + '/location/' + location)
    },

    socket_getPlayerGameHistory: function (playerID, gameID, move) {
      var url = '/player/' + playerID + '/game/' + gameID + '/history'
      if (typeof(move) !== 'undefined')
	url += '/' + move
      return this.socketGetPromise (url)
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

    callWithSoundEffect: function (callback, sfx, elementToDisable) {
      sfx = sfx || 'select'
      var bh = this
      return function (evt) {
        if (sfx.length)
          bh.selectSound = bh.playSound (sfx)
        evt.preventDefault()
	if (elementToDisable)
	  elementToDisable.off()
        callback.call (bh, evt)
      }
    },

    makeSilentLink: function (text, callback) {
      return this.makeLink (text, callback, '')
    },

    makeLink: function (text, callback, sfx) {
      var bh = this
      sfx = sfx || 'select'
      var link = $('<a href="#">')
          .text (text)
          .attr ('title', text)
      link.on ('click', bh.callWithSoundEffect (callback, sfx, link))
      return link
    },

    makeListLink: function (text, callback, sfx) {
      sfx = sfx || 'select'
      var li = $('<li>')
          .append ($('<span>')
                   .html(text))
      li.on('click', this.callWithSoundEffect (callback, sfx, li))
      return li
    },

    setPage: function (page) {
      if (this.pageExit)
        this.pageExit()
      
      if (this.verbose.page)
	console.log ("Changing view from " + this.page + " to " + page)
      this.page = page
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
    
    validatePlayerName: function (success, failure) {
      this.playerLogin = this.nameInput.val()
      this.playerPassword = this.passwordInput.val()
      this.playerLogin = this.playerLogin.replace(/^\s*/,'').replace(/\s*$/,'')
      if (!/\S/.test(this.playerLogin)) {
        this.showModalMessage ("Please enter a player login name", failure)
	return
      }
      if (!/\S/.test(this.playerPassword)) {
        this.showModalMessage ("Please enter a password", failure)
        return
      }
      this.writeLocalStorage ('playerLogin')
      success()
    },

    writeLocalStorage: function (key) {
      this.localStorage[key] = this[key]
      try {
	localStorage.setItem (this.localStorageKey,
			      JSON.stringify (this.localStorage))
      } catch (err) {
	console.log ('localStorage write error: ', err)
      }
    },

    doReturnLogin: function() {
      return this.doLogin (this.showPlayPage)
    },

    doInitialLogin: function() {
      return this.doLogin (this.showInitialUploadPage)
    },

    doLogin: function (showNextPage) {
      var bh = this
      var fail = this.showLoginPage.bind (this)
      this.validatePlayerName
      (function() {
        bh.REST_postLogin (bh.playerLogin, bh.playerPassword)
          .done (function (data) {
	    if (!data.player)
              bh.showModalMessage (data.message, fail)
	    else {
              bh.selectSound.stop()
              bh.playSound ('login')
	      bh.playerID = data.player.id
              bh.playerName = data.player.name
              showNextPage.call(bh)
	    }
          })
          .fail (function (err) {
	    bh.showModalWebError (err, fail)
          })
      }, fail)
    },

    createPlayer: function() {
      var bh = this
      var fail = this.showLoginPage.bind (this)
      this.validatePlayerName
      (function() {
        bh.REST_postPlayer (bh.playerLogin, bh.playerPassword)
          .done (function (data) {
	    bh.selectSound.stop()
	    bh.playSound ('login')
	    bh.doInitialLogin()
          })
          .fail (function (err) {
	    if (err.status == 400)
              bh.showModalMessage ("A player with that name already exists", fail)
	    else
              bh.showModalWebError (err, fail)
          })
      }, fail)
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
      this.showModalMessage ((err.responseJSON && err.responseJSON.error) || (err.status + " " + err.statusText), sfx, callback)
    },
    
    // play page
    showPlayPage: function() {
      var bh = this

      this.clearMoveTimer()
      this.changeMusic('menu')
      this.setPage ('play')

      this.eraseEventInfo()

      this.showNavBar ('view')
      this.container
        .append (this.locBarDiv = $('<div class="locbar">'))

      this.restoreScrolling (this.locBarDiv)

      var promise
      if (this.playerLocation)
        promise = this.socket_getPlayerLocation (this.playerID, this.playerLocation)
      else
        promise = this.socket_getPlayerHome (this.playerID)

      promise.done (function (data) {
	if (bh.verbose.messages)
          console.log(data)

        bh.playerLocation = data.id
        
        bh.locBarDiv
          .append ($('<div class="location">')
                   .append ($('<div class="title">')
                            .text (data.title))
                   .append ($('<div class="description">')
                            .text (data.description)))

	bh.addEvents (data.events)

        data.items.forEach (function (item) {
          var div = $('<div class="trade">')
          var tradeRows = $('<div class="traderows">')
          
          function addTradeRow (verb, count) {
            var button
            if (item[verb]) {
              var possible = (verb === 'buy'
                              ? item[verb].reduce (function (affordable, unit) {
                                return affordable && unit.affordable
                              }, true)
                              : item.owned)
              tradeRows.append ($('<div class="traderow">')
                                .append (bh.makeCostDiv (item[verb]))
                                .append (button = $('<div class="button">')
					 .attr ('name', verb + '-' + item.name)
                                         .text (bh.capitalize (item.verb ? item.verb[verb] : verb))))
              function fail() {
		bh.showModalMessage (verb === 'buy' ? "You can't afford that!" : "You have none to sell.", bh.showPlayPage.bind(bh))
              }
              if (possible)
                button.on ('click', function() {
                  button.off()
		  bh.selectSound = bh.playSound ('select')
                  bh.REST_postPlayerLocationTrade (bh.playerID, bh.playerLocation, item.name, count)
                    .done (function (result) {
                      if (result.success)
                        bh.showPlayPage()
                      else
			fail()
                    })
                    .fail (function (err) {
		      bh.showModalWebError (err, bh.showPlayPage.bind(bh))
                    })
                })
              else
                button.on ('click', fail)
            }
          }

          addTradeRow ('buy', +1)
          addTradeRow ('sell', -1)
          
          div.append ($('<div class="title">')
                      .text (bh.capitalize (item.noun)))

          var iconSpan = $('<div class="bigicon">')
          bh.getIconPromise (item.icon)
            .done (function (svg) {
              svg = bh.colorizeIcon (svg, item.color)
              iconSpan.append ($(svg))
            })
            .fail (function (err) {
              console.log(err)
            })
          div.append (iconSpan)
          div.append (tradeRows)

          if (item.hint)
            div.append ($('<div class="hint">')
                        .text (item.hint))

          if (item.owned)
            div.append ($('<div class="owned">')
                        .text ("You own " + item.owned + " of these."))

          bh.locBarDiv.append (div)
        })
        
        data.links.forEach (function (link) {
          var div = $('<div class="link">')
              .append ($('<div class="title">')
                       .text (link.title))
          if (link.hint)
            div.append ($('<div class="hint">')
                        .text (link.hint))
          var button = $('<div class="button">')
          var costDiv = bh.makeCostDiv (link.cost)
          if (link.locked) {
            button.text("Locked")
            div.append ($('<div class="lock">')
                        .text (link.locked))
          } else
            button.attr('name','link-'+link.id).text("Go").on('click', function() {
              bh.playerLocation = link.id
              bh.selectSound = bh.playSound ('select')
              bh.showPlayPage()
            })
          div.append (costDiv, button)
          bh.locBarDiv.append (div)
        })
      })
    },

    makeCostDiv: function (cost) {
      var costDiv = $('<div class="cost">')
      if (cost) {
        cost.forEach (function (unit) {
          costDiv.append (bh.makeIconPrice (unit))
        })
      }
      return costDiv
    },
    
    makeIconPrice: function (price) {
      var bh = this
      var div = $('<div class="iconprice">')
      this.getIconPromise (price.icon)
        .done (function (svg) {
          svg = bh.colorizeIcon (svg, price.color)
          div.append ($(svg).addClass('icon'))
          if (price.amount != 1)
            div.append ($('<div class="price">')
                        .text (price.amount))
        })
        .fail (function (err) {
          console.log(err)
        })
      return div
    },

    eraseEventInfo: function() {
      delete this.lastStartedEventId
      delete this.eventsById
      delete this.currentEvents
    },

    initEventTimer: function() {
      var bh = this
      var pageAnimationTimer = window.setInterval (function() {
	bh.currentEvents.forEach (function (event) {
          bh.updateEventTimer (event)
	})
      }, 100)

      bh.pageExit = function() {
	bh.eraseEventInfo()
	window.clearInterval (pageAnimationTimer)
      }
    },

    addEvents: function (events) {
      var bh = this
      bh.eventsById = {}
      bh.currentEvents = []
      events.map (function (event) {
	bh.addEvent (event)
      })
      bh.initEventTimer()
    },

    addEvent: function (event) {
      this.eventsById[event.id] = event
      this.currentEvents.push (event)
      var div = $('<div class="event">')
          .append ($('<div class="title">')
                   .text (event.title))

      event.lockDiv = $('<div class="lock">')
      event.button = $('<div class="button">').attr('name','event-'+event.id)

      event.missedDiv = $('<div class="missed">')
      event.timerDiv = $('<div class="timer">')
      event.turnDiv = $('<div class="turn">')
        .append (event.missedDiv, event.timerDiv)

      event.costDiv = this.makeCostDiv (event.cost)
      event.tradeRows = $('<div class="traderows">')
        .append ($('<div class="traderow">')
                 .append (event.costDiv, event.button))
      
      div.append (event.turnDiv, event.lockDiv, event.tradeRows)
      if (event.hint)
        div.append ($('<div class="hint">')
                    .text (event.hint))

      this.locBarDiv.append (div)

      this.updateEventButton (event)
    },

    updateEventFromJoinMessage: function (data) {
      var eventId = data.event.id
      if (this.lastStartedEventId && this.lastStartedEventId == eventId) {
        if (this.selectSound)
          this.selectSound.stop()
        this.startGame (data.event.game.id)

      } else if (this.eventsById) {
	var event = this.eventsById[eventId]
	if (event) {
	  event.game = data.event.game
	  this.updateEventState (event, data.event.state)
	} else if (this.page === 'activeGames')
	  this.addEvent (data.event)
      }
    },

    updateEventFromMoveMessage: function (data) {
      var eventId = data.event
      if (this.eventsById) {
	var event = this.eventsById[eventId]
	if (event) {
	  event.game.missed = data.missed
	  if (data.nextDeadline)
	    event.game.deadline = data.nextDeadline
	  else
	    delete event.game.deadline
	  this.updateEventState (event, data.finished ? 'finished' : 'ready')
	}
      }
    },

    updateEventState: function (event, state) {
      event.state = state
      this.updateEventButton (event)
    },

    updateEventButton: function (event) {
      var bh = this
      var button = event.button
      button
	.text (this.eventButtonText[event.state])
	.off()

      switch (event.state) {
      case 'locked':
        event.costDiv.show()
        event.lockDiv.text (event.locked)
        break;

      case 'start':
        event.costDiv.show()
        button.on('click', function() {
          button.off()
	  bh.selectSound = bh.playSound ('select')
          event.costDiv.hide()
	  bh.lastStartedEventId = event.id
          bh.REST_getPlayerJoin (bh.playerID, event.id)
            .done (function (data) {
              if (data.waiting) {
                event.invited = data.invited
		bh.updateEventState (event, 'starting')
              } else {
                event.game = data.game
		bh.updateEventState (event, 'ready')
              }
              bh.updateEventTimer (event)
            }).fail (function (err) {
              bh.showModalWebError (err, bh.showPlayPage.bind(bh))
            })
        })
        break;

      case 'resetting':
      case 'starting':
        event.costDiv.hide()
        break;

      case 'ready':
      case 'waiting':
      case 'finished':
        event.costDiv.hide()
        button.on('click', function() {
          bh.startGame (event.game.id)
        })
        break;

      default:
        console.log("unknown event state")
        break;
      }

      this.updateEventTimer (event)
    },

    updateEventTimer: function (event) {
      var now = new Date()
      
      if (event.game) {
        event.timerDiv.text (event.game.deadline
			     ? this.shortTimerText ((new Date(event.game.deadline) - now) / 1000)
			     : '')
	event.missedDiv.text (event.game.missed
			      ? ("Missed " + this.plural(event.game.missed,"turn"))
			      : '')
      } else if (event.invited && event.state === 'starting') {
        var timeToWait = (new Date(event.invited) - now) / 1000
        if (timeToWait <= 0 && !event.invitedBot) {
          event.invitedBot = true
          this.REST_getPlayerJoinBot (this.playerID, event.id)
            .fail (function() { delete event.invitedBot })
        }
        event.timerDiv.text (this.shortTimerText (timeToWait))
      } else if (event.reset && event.state == 'resetting') {
        var timeToWait = (new Date(event.reset) - now) / 1000
	if (timeToWait <= 0)
	  this.updateEventState (event, 'start')
	else
          event.timerDiv.text (this.shortTimerText (timeToWait))
      } else
        event.timerDiv.empty()
    },
    
    showNavBar: function (currentTab) {
      var bh = this
      
      var tabs = [{ name: 'view', method: 'showPlayPage' },
                  { name: 'status', method: 'showStatusPage' },
                  { name: 'games', method: 'showActiveGamesPage' },
                  { name: 'follows', method: 'showFollowsPage' },
                  { name: 'settings', method: 'showSettingsPage' }]

      var navbar
      this.container
        .empty()
        .append (navbar = $('<div class="navbar">'))

      tabs.map (function (tab) {
        var span = $('<span>').addClass(tab.name)
        bh.getIconPromise(bh.navIcons[tab.name])
          .done (function (svg) {
            span.append ($(svg).addClass('navicon'))
          })
          .fail (function (err) {
            console.log(err)
          })
        if (tab.name === currentTab)
          span.addClass('active')
        else
          span.on ('click', bh.callWithSoundEffect (bh[tab.method]))
        navbar.append (span)
      })
    },

    getIconPromise: function(icon) {
      if (!this.iconPromise[icon])
        this.iconPromise[icon] = $.ajax ({ url: this.iconPrefix + icon + this.iconSuffix,
                                           method: 'GET',
                                           dataType: 'text' })
      return this.iconPromise[icon]
    },

    colorizeIcon: function(svg,fgColor,bgColor) {
      if (fgColor)
        svg = svg.replace(new RegExp("#fff", 'g'), fgColor)
      if (bgColor)
        svg = svg.replace(new RegExp("#000", 'g'), bgColor)
      return svg
    },
    
    capitalize: function (text) {
      return text.charAt(0).toUpperCase() + text.substr(1)
    },
    
    shortTimerText: function (secs) {
      secs = Math.floor (secs)
      if (secs <= 0)
        return ""
      else if (secs < 60)
        return secs + "s"
      else {
        var mins = Math.floor (secs / 60)
        if (mins < 60)
          return mins + "m " + (secs % 60) + "s"
        else {
          var hours = Math.floor (mins / 60)
          if (hours < 24)
            return hours + "h " + (mins % 60) + "m"
          else {
            var days = Math.floor (hours / 24)
            return days + "d " + (hours % 24) + "h"
          }
        }
      }
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
      delete this.playerLocation
      this.gamePosition = {}
      this.REST_getLogout()
      this.showLoginPage()
    },
    
    // settings menu
    showSettingsPage: function() {
      var bh = this

      this.setPage ('settings')
      this.showNavBar ('settings')
      this.container
        .append ($('<div class="menubar">')
                 .append ($('<ul>')
                          .append (this.makeListLink ('Character settings', this.showSettingsUploadPage))
                          .append (this.makeListLink ('Audio settings', this.showAudioPage))
                          .append (this.makeListLink ('Themes', this.showThemesPage))
                          .append (this.makeListLink ('Log out', this.doLogout))))
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
      this.pushedViews.push ({ elements: elements,
                               page: page,
                               suspend: this.pageSuspend,
                               resume: this.pageResume,
                               exit: this.pageExit })
      if (this.pageSuspend)
        this.pageSuspend()
      this.pageSuspend = this.pageResume = this.pageExit = undefined
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
      this.pageSuspend = poppedView.pageSuspend
      this.pageResume = poppedView.pageResume
      this.pageExit = poppedView.pageExit
      if (this.pageResume)
        this.pageResume()
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
      var pageAnimationTimer = window.setInterval (function() {
        var fs = faceSets[Math.floor(faceSets.length*Math.random())]
        var newMoods = bh.moods.filter (function(m) { return m != fs.mood })
        fs.update (fs.mood = newMoods[Math.floor(newMoods.length*Math.random())])
      }, 100)
      this.pageExit = function() {
        window.clearInterval (pageAnimationTimer)
      }
      
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
      var fail = this.pickAvatarPage.bind (this, config)
      if (!this.currentFaceSet)
        this.showModalMessage ("You have not selected an avatar", fail)
      else
        this.REST_putPlayerAvatarConfig (this.playerID, this.currentFaceSet)
        .done (function() {
          config.showNextPage.call (bh)
	}).fail (function (err) {
          bh.showModalWebError (err, fail)
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
	bh.moods.forEach (function (m) { div.removeClass('mood-'+m) })
	div.addClass('mood-'+mood)
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
	    bh.showModalWebError (err, bh.exitConfirmUpload.bind(bh))
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
      this.showNavBar ('games')

      this.eraseEventInfo()

      this.container
        .append (this.locBarDiv = $('<div class="locbar">')
		 .append ($('<span>')
			  .text('This page shows all your currently active games.')))

      this.restoreScrolling (this.locBarDiv)

      this.REST_getPlayerGames (this.playerID)
	.done (function (data) {
	  if (bh.verbose.messages)
	    console.log (data)
	  bh.addEvents (data)
	}).fail (function (err) {
          bh.showModalWebError (err, bh.showPlayPage.bind(bh))
        })
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

    clearMoveTimer: function() {
      if (this.moveTimer) {
	window.clearTimeout (this.moveTimer)
	delete this.moveTimer
      }
    },

    quitGame: function() {
      var bh = this
      this.REST_getPlayerGameMoveQuit (this.playerID, this.gameID, this.moveNumber)
	.done (function() {
	  bh.exitGamePage()
	})
	.fail (function() {
	  bh.exitGamePage()
	})
    },

    exitGamePage: function() {
      delete this.gameID
      this.clearMoveTimer()
      this.showPlayPage()
    },

    // game status
    showStatusPage: function() {
      this.setPage ('status')
      this.showNavBar ('status')
      this.showGameStatusPage (this.playerName, this.REST_getPlayerStatus, this.setPage)
    },

    showPlayerStatusPage: function() {
      this.pushGameStatusPage (this.playerName, this.REST_getPlayerGameStatusSelf)
    },
    
    showOpponentStatusPage: function() {
      this.pushGameStatusPage (this.opponentName, this.REST_getPlayerGameStatusOther)
    },

    pushGameStatusPage: function (name, getMethod) {
      var bh = this
      this.pushView ('status')
      var detail
      this.container
        .append (this.makePageTitle (name))
      this.showGameStatusPage (name, getMethod)
      this.container
	.append ($('<div class="menubar">')
		 .append ($('<span>')
			  .html (this.makeLink ('Back', this.popView))))
    },

    showGameStatusPage: function (name, getMethod) {
      this.container
        .append (detail = $('<div class="detailbar">'))

      this.restoreScrolling (detail)

      getMethod.call (this, this.playerID, this.gameID)
	.done (function (status) {
	  if (bh.verbose.messages)
	    console.log (status)
          bh.addStatusElements (status.element, detail)
	})
        .fail (function (err) {
          console.log(err)
        })
    },

    addStatusElements: function (elements, div) {
      var bh = this
      elements.forEach (function (elt) {
	switch (elt.type) {
	case 'div':
          var child = $('<div class="statusdiv">')
          div.append (child)
          bh.addStatusElements (elt.element, child)
	case 'header':
	  div.append ($('<h1>').text(elt.label))
	  break
	case 'icon':
	  div.append (bh.makeStatusIcon (elt))
	  break
	case 'meter':
	  div.append (bh.makeMeter (elt.label, elt.level, elt.min, elt.max, elt.color))
	  break
	default:
	  break
	}
      })
    },
    
    makeStatusIcon: function (element) {
      var bh = this
      var span = $('<span class="icon">')
      this.getIconPromise(element.icon)
        .done (function (svg) {
          svg = bh.colorizeIcon (svg, element.color)
          span.append ($(svg).addClass('navicon'))
        })
        .fail (function (err) {
          console.log(err)
        })
      return $('<div class="statusline">')
        .append (span)
        .append ($('<span class="text">').text(element.label))
    },

    makeMeter: function(label,level,min,max,color) {
      color = color || 'blue'
      return $('<div class="meterline">')
	.append ($('<div class="meterlabel">')
		 .append ($('<div class="metertext">').text(label))
		 .append ($('<div class="meternumber">')
			  .text ('(' + Math.round(level) + '/' + Math.round(max) + ')')))
	.append ($('<div class="meter '+color+'">')
		 .append ($('<span>')
			  .css('width',(100*level/max) + '%')))
    },

    // follows
    showFollowsPage: function() {
      var bh = this
      
      this.setPage ('follows')
      this.showNavBar ('follows')

      this.eraseEventInfo()

      this.container
        .append (this.locBarDiv = $('<div class="locbar">')
		 .append ($('<span>')
			  .text('This page shows the players you are currently following.')))

      this.restoreScrolling (this.locBarDiv)

      this.REST_getPlayerFollow (this.playerID)
	.done (function (data) {
	  if (bh.verbose.messages)
	    console.log (data)
          // TODO: write me
	}).fail (function (err) {
          bh.showModalWebError (err, bh.showPlayPage.bind(bh))
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
			  .width("100%")))

      var throwOutConfidence = function (offset, element) {
        return Math.min(Math.abs(offset) / element.offsetWidth, 1)
      }
      var isThrowOut = function (offset, element, throwOutConfidence) {
        return throwOutConfidence > .25 && !(bh.throwDisabled && bh.throwDisabled())
      }
      this.stack = gajus.Swing.Stack ({ throwOutConfidence: throwOutConfidence,
					throwOutDistance: this.throwXOffset,
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
                          .html (this.makeLink ('Back', this.exitGamePage))))
	.append ($('<div class="leftmood">')
		 .append (this.playerMoodDiv = $('<div class="moodcontainer">')))
        .append ($('<div class="rightmood">')
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
	.on ('click', this.showHistoryAlert.bind(this))
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

      var historyStart = this.currentExpansionNode ? this.currentExpansionNode.node.move : undefined
      this.socket_getPlayerGameHistory (this.playerID, this.gameID, historyStart)
	.done (function (data) {

	  if (bh.verbose.messages) {
	    console.log("Received game state from server")
	    console.log(data)
          }

          delete this.throwDisabled

          bh.moveNumber = data.move
          bh.opponentName = data.other.name
          bh.opponentID = data.other.id
          
          var newRootForMove = {}, nextRoot
	  data.history.slice(0).reverse().forEach (function (hist, h) {
	    if (!hist.text.length)
	      hist.text = [{}]

	    // process the grammar received from the server, use IDs to connect node objects
	    function hookup (link, move) {
	      if (link) {
		if (typeof(link.id) !== 'undefined') {
		  if (typeof(link.move) === 'undefined')
		    link.move = move
		  link.node = hist.text[link.id] || {}
		} else
		  link.node = {}
	      }
	    }
	    hist.text.forEach (function (node, n) {
	      node.id = n
	      node.self = hist.self
	      node.other = hist.other
	      node.move = hist.moveNumber
	      node.finish = node.wait && h == 0 && data.finished

	      if (node.next)
		node.left = node.right = node.next
	      hookup (node.left, hist.moveNumber)
	      hookup (node.right, hist.moveNumber)
	      if (node.menu)
		node.menu.forEach (function (item) {
		  hookup (item, hist.moveNumber)
		})
	      if (node.sequence)
		node.sequence.forEach (function (item) {
		  hookup (item, hist.moveNumber)
		})
	    })

	    // process the moves received from the server, convert them to expansion trees
	    var root
	    if (hist.move) {
	      function convertJsonMoveToExpansion (moveNode, parentExpansion, nextPop) {
		var node = hist.text[moveNode.id] || {}
		var expansion = { creator: 'convertJsonMoveToExpansion',
				  isHistory: true,
				  node: node,
				  label: moveNode.label,
				  action: moveNode.action,
				  parent: parentExpansion }
		if (moveNode.children) {
		  var revChildren = moveNode.children.slice(0).reverse()
		  expansion.children = revChildren.map (function (child) {
		    var childExpansion = convertJsonMoveToExpansion (child, expansion, nextPop)
		    nextPop = childExpansion
		    return childExpansion
		  }).reverse()
		  expansion.next = expansion.children[0]
		} else if (bh.nodeExpansionIsPredictable(node) || typeof(moveNode.action) !== 'undefined')
		  expansion.next = nextPop
		else
		  expansion.nextPop = nextPop
		return expansion
	      }
	      root = convertJsonMoveToExpansion (hist.move, undefined, nextRoot)
	      // add pointers from expansion tails back to head nodes
	      var head = root
	      while (head)
		head = bh.expansionTail(head).next  // this will automatically add the pointers back to head
	    } else if (bh.currentExpansionNode && hist.moveNumber == bh.currentChoiceNode().move)
	      root = bighouseLabel.getExpansionRoot (bh.currentExpansionNode)
	    else
	      root = { creator: 'loadGameCards',
		       node: hist.text[0],
		       label: hist.text[0].label }
	    newRootForMove[hist.moveNumber] = root
	    nextRoot = root
	    bh.getNextExpansionTail (root)  // expand new tree up to the first visible node
	  })

	  if (bh.currentExpansionNode) {
	    var currentMove = bh.currentChoiceNode().move
	    var currentRoot = bighouseLabel.getExpansionRoot (bh.currentExpansionNode)
	    if (currentRoot !== newRootForMove[currentMove]) {
	      // we were part-way through a move when we got sent a fully-expanded move from the server.
	      // hopefully, this was because we timed out, and sent a default move to the server,
	      // in which case we are part-way through what the server just sent back to us.
	      // however, it may also have been because we got kicked, in which case there are
	      // no guarantees that what the server just sent us is consistent with our partial expansion.
	      // either way, try to align our current partially-expanded tree with what we just got from the server,
	      // and find the most recent point of departure.
	      var serverNode = newRootForMove[currentMove]
	      var ourNode = currentRoot
	      while (true) {
		if (ourNode === bh.currentExpansionNode || ourNode.action !== serverNode.action)
		  break
		if (ourNode.next) {
		  ourNode = ourNode.next
		  serverNode = serverNode.next
		} else {
		  // at this point we've crawled the entire tree without finding our node OR any mismatches
		  // this shouldn't happen
		  console.log("ERROR: failed to find current node when crawling current tree")
		  serverNode = newRootForMove[currentMove]
		}
	      }
	      bh.currentExpansionNode = serverNode
	    }
	  } else {
	    // we don't have any partly-expanded move, so just start at the beginning
	    bh.currentExpansionNode = bh.getNextExpansionTail (nextRoot)
	  }
	  $.extend (bh.rootForMove, newRootForMove)  // merge the old move history with the newly received moves
	  bh.saveGamePosition()

          if (isStart)
	    bh.initStatusBar()
	  bh.opponentNameDiv.text (bh.opponentName)
	  bh.updatePlayerMood (data.self.mood, data.startline)
	  bh.updateOpponentMood (bh.opponentID, data.other.mood, data.startline)

	  // set up the deck
	  var node = bh.currentExpansionNode.node
	  var tossCurrent = node.wait && bh.currentExpansionNode.next
	  bh.clearStack()
          
	  var nextState = data.finished ? 'gameOver' : (data.waiting ? 'ready' : 'waitingForOther')
	  bh.dealCardForNode ({ expansion: bh.currentExpansionNode,
				showDealAnimation: isStart,
				firstDealAfterCardsLoaded: true,
				dealDirection: bh.lastSwipe == 'left' ? 'right' : 'left' })
	    .done (function() {
	      bh.initMoveTimer (data, bh.setGameStateCallback(nextState))
	      if (tossCurrent)
		bh.throwCard (bh.currentExpansionNode.card)
	    })

	}).fail (function (err) {
          console.log(err)
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

    saveGamePosition: function() {
      this.gamePosition[this.gameID] = { currentExpansionNode: this.currentExpansionNode,
                                         moveNumber: this.moveNumber }
    },

    initMoveTimer: function (data, callback) {
      this.startline = new Date()
      if (data.deadline)
	this.deadline = new Date(data.deadline)
      else {
	delete this.deadline
        this.hideTimer()
      }
      this.setMoveTimer (this.timerCallback, 10)
      callback()
    },

    newTopCard: function (expansion) {
      // set card class
      var card = expansion.card
      $(card.elem).addClass ('topcard')

      // call node-specific setup (routines that depend on whether node is a swipe card or a menu card)
      expansion.topCardCallback()

      // show hints
      var node = expansion.node
      var isFinal = this.expansionIsFinal(expansion)
      var leftHint = isFinal ? this.defaultBackHint : ((node.left && node.left.hint) || this.defaultNextHint)
      var rightHint = isFinal ? this.defaultBackHint : ((node.right && node.right.hint) || this.defaultNextHint)

      leftHint = "← " + leftHint
      rightHint = rightHint + " →"

      // strike if we're history, or if option is not visible
      var leftStruck, rightStruck
      if (bh.nodeIsAsymmetric(expansion.node))
	if (typeof(expansion.action) !== 'undefined') {
	  if (expansion.action === 'left')
	    rightStruck = true
	  else
	    leftStruck = true
	} else {
	  leftStruck = !bighouseLabel.evalUsable (expansion, node.left) || !bighouseLabel.evalVisible (expansion, node.left)
	  rightStruck = !bighouseLabel.evalUsable (expansion, node.right) || !bighouseLabel.evalVisible (expansion, node.right)
	}

      function makeHint (choiceClass, struck, hint, dir) {
	return $('<div class="'+choiceClass+'">')
	  .append ($('<div class="hint">')
		   .append (struck
			    ? $('<span class="disabled">').append ($('<strike>').text(hint))
			    : bh.makeSilentLink (hint,
						 bh.nodeThrowFunction (expansion, dir))))
      }
      
      this.choiceDiv.empty()
	.append (makeHint ('choice1', leftStruck, leftHint, this.swingDir.left))
	.append (makeHint ('choice2', rightStruck, rightHint, this.swingDir.right))
    },

    plural: function(n,singular,plural) {
      plural = plural || (singular + 's')
      n = typeof(n) === 'undefined' ? 0 : n
      return n + ' ' + (n == 1 ? singular : plural)
    },

    setMoveTimer: function (callback, delay) {
      if (this.verbose.timer)
	console.log ("Setting move timer for " + Math.round(delay) + "ms")
      if (!this.disableMoveTimer)
	this.moveTimer = window.setTimeout (callback.bind(this), delay)
    },

    timerCallback: function() {
      var bh = this
      this.clearMoveTimer()

      var now = new Date(), nowTime = now.getTime()
      var jiggleTime = this.startline.getTime() + this.jiggleDelay
      if (this.currentExpansionNode && nowTime >= jiggleTime) {
	var card = this.currentExpansionNode.card
	if (card) {
	  var elem = $(card.elem)
          if (!elem.hasClass('thrown') && !elem.hasClass('waitcard'))
	    elem.addClass('jiggle')
	}
      }

      if (this.deadline) {
	this.updateTimerDiv (this.startline, this.deadline, now)
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
	} else
	  this.setMoveTimer (this.timerCallback, 10)
      } else
	this.setMoveTimer (this.timerCallback, 200)
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
          if (!this.lastChimeTime || nowTime >= this.lastChimeTime + 1000)
            this.playSound ('timewarning')
          this.lastChimeTime = firstChimeTime + (1000 * Math.floor ((nowTime - firstChimeTime) / 1000))
	}
      }
    },

    timerPulseElement: function() {
      var pulseElement
      var expansion = this.currentExpansionNode
      if (expansion.node && expansion.node.menu && !expansion.node.auto) {
        var idx = this.nextRandomAction(expansion)
	pulseElement = expansion.menuSpan[idx]
      } else if (this.nodeExpansionIsPredictable (this.currentChoiceNode()))
	pulseElement = $('.choice1,.choice2').find(':visible')
      else {
	var choiceClass = this.nextRandomAction(expansion) === 'left' ? 'choice1' : 'choice2'
	pulseElement = $('.'+choiceClass).find(':visible')
      }
      return pulseElement
    },

    hideTimer: function() {
      this.timerDiv.width(0)
    },

    getExpansionText: function (expansion) {
      var node = expansion.node
      var text = node.text || (node.wait ? this.defaultWaitText : '')

      text = text.replace(/^\+\+/,'')
      text = text.replace(/\+\+$/,'')

      text = text.replace (/<([Ll])abel:(\S+?)([ ,;]?|[,;]&)>/g, function (match, uc, label, sep) {
	var joined = (sep === ''
		      ? bighouseLabel.sumExpansionLabels (expansion, label)
		      : (sep === ''
			 ? bighouseLabel.flatExpansionLabels(expansion,label).join(sep)
			 : bighouseLabel.listExpansionLabels (expansion, label, sep.charAt(0), sep.length > 1)))
	return uc === 'L' ? bighouseLabel.capitalize(joined) : joined
      })

      text = text.replace (/<move>/g, function() {
	return bighouseLabel.sumExpansionLabels (expansion, 'move')
      })

      text = text.replace (/\[\[(.*?)\]\]/g, function (expr) {
	return bighouseLabel.evalExpansionExpr (expansion, expr, '')
      })

      return text
    },

    nodeIsLeaf: function (node) {
      return !(node.left || node.right || node.menu || node.sequence)
    },

    nodeHasNext: function (node) {
      return node.left === node.right && !node.menu
    },

    nodeIsAsymmetric: function (node) {
      return node.left && node.right && !(node.menu || node.next)
    },
    
    nodeExpansionIsPredictable: function (node) {
      return this.nodeIsLeaf(node) || this.nodeHasNext(node) || node.auto
    },

    makeSequenceExpansion: function (expansion) {
      var bh = this
      var node = expansion.node
      var children = node.sequence
          .map (function (seqNode) {
            return { creator: 'makeSequenceExpansion',
                     node: seqNode.node,
		     parent: expansion }
          })
      var nextPop = expansion.nextPop
      for (var n = children.length - 1; n >= 0; --n) {
	children[n].nextPop = nextPop
	nextPop = children[n]
      }
      expansion.children = children
      expansion.next = expansion.children[0]
      delete expansion.nextPop
      return children
    },

    getNextExpansion: function (expansion, action) {
      var bh = this
      var node = expansion.node

      if (node.menu && node.auto)
	for (action = 0; action < node.menu.length - 1; ++action)
	  if (bighouseLabel.evalVisible (expansion, node.menu[action])
              && bighouseLabel.evalUsable (expansion, node.menu[action]))
	    break
      
      if (typeof(action) === 'undefined')
	action = expansion.action
      else {
	if (typeof(expansion.action) !== 'undefined' && expansion.action !== action)
	console.log("ERROR: tried to change the action of an already-expanded parse tree node (from " + expansion.action + " to " + action + ")")
	expansion.action = action
      }

      var childExpansion
      if (expansion.next)  // already expanded?
	childExpansion = expansion.next
      else if (node.sequence) {
	var children = bh.makeSequenceExpansion(expansion)
	childExpansion = children[0]
      } else if ((node.left && node.right) || node.menu) {
	var childLink = bh.linkForAction (node, action)
	childExpansion = { creator: 'getNextExpansion',
			   node: childLink.node,
			   parent: expansion,
			   nextPop: expansion.nextPop }
	expansion.children = [childExpansion]
	expansion.next = childExpansion
	delete expansion.nextPop
      } else {
	childExpansion = expansion.nextPop
	expansion.next = childExpansion
	delete expansion.nextPop
      }

      // expand ahead if next expansion is predictable
      // this allows the caller to skip invisible-but-predictable expansions
      // it also allows the viewer to queue up predictable future cards
      if (childExpansion && this.nodeExpansionIsPredictable(childExpansion.node))
	this.getNextExpansion (childExpansion)

      return childExpansion
    },

    expansionTail: function (head) {
      var tail = head
      if (tail) {
	var text = ''
	do {
	  text = tail.node.text || text
	  var append = false
	  if (tail !== bh.currentExpansionNode && (!tail.node.wait || tail.next) && this.nodeExpansionIsPredictable (tail.node)) {
	    var next = tail.next
	    if (next && (text === '' || !next.node.wait)) {
	      var nextText = next.node.text
	      append = text.match(/\+\+$/) || text === ''
		|| !nextText || nextText === '' || nextText.match(/^\+\+/)
	      if (append)
		tail = next
	    }
	  }
	} while (append)
	tail.head = head
      }
      return tail
    },
    
    getNextExpansionTail: function (expansion, action) {
      return this.expansionTail (this.getNextExpansion (expansion, action))
    },

    makeSwipeFunction: function (expansion, dir) {
      var bh = this
      var node = expansion.node
      return function() {
	bh.lastSwipe = dir
	bh.choiceDiv.empty()

	var action = node.menu ? expansion.selectedItem : dir
	var nextExpansion = bh.getNextExpansionTail (expansion, action)

	bh.currentExpansionNode = nextExpansion
	bh.saveGamePosition()

        if (nextExpansion) {
	  var nextNode = nextExpansion.node
	  function makeMove() {
	    if (bh.expansionIsFinal(nextExpansion))
	      bh.makeMove (bh.moveNumber)
	  }

	  bh.dealCardForNode ({ expansion: nextExpansion,
				showDealAnimation: true,
                                dealDirection: dir == 'right' ? 'left' : 'right' })
	    .done (makeMove)

	} else {
	  if (bh.gameState === 'gameOver') {
	    bh.playSound ('gameover')
	    bh.quitGame()
	  } else
	    bh.exitGamePage()
        }
      }
    },

    updateGameView: function() {
      var expansion = this.currentExpansionNode
      var node = expansion.node
      this.newTopCard (expansion)
      this.refreshPlayerMoodImage()
      this.refreshOpponentMoodImage()
      if (typeof(expansion.action) !== 'undefined')
	this.hideMoods()
      else
	this.revealMoods()
    },

    currentChoiceNode: function() {
      return this.currentExpansionNode.node
    },
    
    hideMoods: function() {
      this.container.addClass ('history')
    },

    revealMoods: function() {
      this.container.removeClass ('history')
    },

    expansionIsFinal: function(expansion) {
      return this.nodeIsLeaf(expansion.node) && !expansion.nextPop && !expansion.next
    },

    expandRandomly: function (expansion) {
      var bh = this
      while (expansion) {
	var action = typeof(expansion.action) !== 'undefined' ? expansion.action : bh.nextRandomAction(expansion)
	expansion = bh.getNextExpansion (expansion, action)
      }
    },

    nextRandomAction: function (expansion) {
      var action
      if (typeof(expansion.action) !== 'undefined')
        action = expansion.action
      else if (typeof(expansion.selectedItem) !== 'undefined')
        action = expansion.selectedItem
      else if (typeof(expansion.nextRandomAction) !== 'undefined')
        action = expansion.nextRandomAction
      else if (expansion.node.menu)
	action = Math.floor (Math.random() * expansion.node.menu.length)
      else
	action = Math.random() < .5 ? 'left' : 'right'
      expansion.nextRandomAction = action
      return action
    },

    linkForAction: function(node,action) {
      return node.next || (node.menu ? node.menu[action] : node[action])
    },

    dealCardForNode: function (info) {
      var bh = this

      var expansion = info.expansion
      if (expansion.dealt) {
	bh.updateGameView()
	var dummyDef = $.Deferred()
	dummyDef.resolve()
	return dummyDef
      }
      expansion.dealt = true

      // deal any cards after this one first, to ensure card stack finishes with this one on top
      var nextCardDealt
      if (expansion.next) {
	var nextInfo = {}
	$.extend (nextInfo, info)
	nextInfo.expansion = bh.expansionTail (expansion.next)
	nextInfo.dealingAhead = true
	nextCardDealt = bh.dealCardForNode (nextInfo)
      } else {
	nextCardDealt = $.Deferred()
	nextCardDealt.resolve()
      }
      
      // concatenate text from the chain of expansion nodes that will be used to make this card
      var text = '', head = expansion.head
      while (head) {
        if (!(info.dealingAhead && head.node.wait && head.next))  // don't include <wait> text from future wait cards that we're going to skip
	  text += bh.getExpansionText (head)
	if (head === expansion)
	  break
	else
	  head = head.next
      }
      if (text === '')
	text = bh.defaultAbsentText

      // text can override default cardClass, sfx
      var node = expansion.node
      var sfx, cardClass, newMood
      if (node.wait)
	cardClass = 'waitcard'
      else if (expansion.isHistory)
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

      // misc text replacements go here...
      text = text.replace (/<icon:([^> ]+)>/g, function (match, iconName) {
	return '<img src="' + bh.iconPrefix + iconName + bh.iconSuffix + '"></img>'
      })

      text = text.replace (/<self>/g, function() {
	return bh.playerName
      })

      text = text.replace (/<other>/g, function() {
	return bh.opponentName
      })

      text = text.replace (/<wait>/g, function() {
	return node.finish
	  ? "Game over"
	  : ((expansion.isHistory && !info.firstDealAfterCardsLoaded)
	     ? "Time passes..."
	     : ("Waiting for " + bh.opponentName + "..."))
      })

      text = text.replace (/<mood:(happy|sad|angry|surprised)>/g, function (match, mood) {
	newMood = mood
	return ''
      })

      var avatarRegExp = new RegExp ('<(happy|sad|angry|surprised|say)(|self|other)>(.*?)<\/\\1\\2>', 'g')
      text = text.replace (avatarRegExp, function (match) { return '\n' + match + '\n' })
      
      // create the <span>'s
      var avatarCallbacks = []
      var content = text.split(/\n/)
	  .filter (function (para) {
	    return /\S/.test(para)
	  }).map (function (para) {
            var span = $('<span>')
            avatarRegExp.lastIndex = 0
            var avatarMatch = avatarRegExp.exec (para)
            if (avatarMatch) {
              var mood = avatarMatch[1], role = avatarMatch[2], content = avatarMatch[3]
              var isOther = (role === 'other')
              if (mood === 'say') mood = isOther ? bh.opponentMood : bh.playerMood
              var moodDiv = $('<div>').addClass('avatar')
              span.addClass (isOther ? 'rightballoon' : 'leftballoon')
                .append (moodDiv)
                .append (content)
              avatarCallbacks.push (function() {
                bh.getAvatarConfigPromise(isOther ? bh.opponentID : bh.playerID)
                  .done (function (avatarConfig) {
                    var config = {}
                    $.extend (true, config, avatarConfig)
                    bh.showFace (config, mood, moodDiv)
                  })
              })
            } else
	      span.html(para)
            return span
          })

      // create the menu, if applicable
      if (node.menu && !node.auto) {
	var fieldset = $('<fieldset class="cardmenu">')
	expansion.menuSpan = []
	expansion.menuInput = []
	var menuSelectCallback
	node.menu.forEach (function (item, n) {
	  var id = 'cardmenuitem' + (bh.globalMenuCount++)
          item.n = n
	  if (bighouseLabel.evalVisible (expansion, item)) {
            var radioInput = $('<input type="radio" name="cardmenu" id="'+id+'" value="'+n+'">')
	    var span = $('<span>')
	    var label = $('<label for="'+id+'" class="cardmenulabel">').append (span)
	    expansion.menuInput.push (radioInput)
	    expansion.menuSpan.push (span)
            var itemStruck = (typeof(expansion.action) !== 'undefined' && n != expansion.action)
                || !bighouseLabel.evalUsable (expansion, item)
            fieldset
	      .append (radioInput)
	      .append (label)
            if (itemStruck) {
              radioInput.attr('disabled',true)
              span.html ($('<strike>').text(item.hint)).addClass('disabled')
            } else {
              span.text(item.hint)
	      label.on('click',function() {
		expansion.selectedItem = n
		if (menuSelectCallback)
		  menuSelectCallback.call (bh, item, n)
	      })
	    }
	  }
	})
	content.push (fieldset)

	var selectWarning = $('<span class="warnselect">')
	    .text("Please select an option")
	    .css('visibility','hidden')
	content.push (selectWarning)
	menuSelectCallback = function (menuItem, menuIndex) {
	  selectWarning.css('visibility','hidden')
	  bh.choiceDiv.show()
	  delete bh.throwDisabled
        }

        // create the function that will be called when the menu card reaches the top of the pack
        expansion.topCardCallback = function() {
          bh.choiceDiv.hide()
          bh.throwDisabled = function() { selectWarning.css('visibility','visible'); return true }
          if (typeof(expansion.action) !== 'undefined')
            expansion.selectedItem = expansion.action
	  if (typeof(expansion.selectedItem) !== 'undefined') {
	    expansion.menuInput[expansion.selectedItem].prop('checked',true)
	    menuSelectCallback()
	  }
        }
      } else  // not a menu card (or an auto-menu)
        expansion.topCardCallback = function() {
	  delete bh.throwDisabled
	  bh.choiceDiv.show()
        }

      // if a mood change was specified, tack it onto the end of the top-card callback
      if (newMood) {
	var cb = expansion.topCardCallback
	expansion.topCardCallback = function() {
	  cb()
	  bh.changeMoodFunction (node.move, newMood) ()
	}
      }
      
      // create the <li> that sits in the card stack (styled as a card)
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
      expansion.card = card

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
          cardListItem
	    .removeClass('jiggle')
	    .removeClass('topcard')
	    .addClass('thrown')
	  bh.playSound (sfx)
          callback.call (bh)
          bh.fadeCard (cardListItem, card)
	})
      }

      var swipeLeft = bh.makeSwipeFunction (expansion, (!node.menu && expansion.action) || 'left')
      var swipeRight = bh.makeSwipeFunction (expansion, (!node.menu && expansion.action) || 'right')

      addThrowListener ('throwoutleft', 'swipeleft', swipeLeft)
      addThrowListener ('throwoutright', 'swiperight', swipeRight)

      if (info.showDealAnimation) {
	card.on ('throwinend', function() {
	  cardListItem.attr('style','')
	  cardDealt.resolve()
	})
	card.throwIn (info.dealDirection == 'left' ? -this.dealXOffset() : +this.dealXOffset(), this.dealYOffset())
      } else
	cardDealt.resolve()

      avatarCallbacks.forEach (function (f) { f() })
      
      if (!info.dealingAhead)
	cardDealt.done (function() {
	  bh.updateGameView()
	})

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

    dealXOffset: function() {
      return $(document).width() * 2/3
    },

    dealYOffset: function() {
      return -$(document).height() / 4
    },

    throwXOffset: function() {
      return $(document).width() * 2/3
    },

    throwYOffset: function() {
      return $(document).height() / 4
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
    },
    
    fadeCard: function (listItem, card) {
      var bh = this
      listItem.find('*').off()
      card.destroy()
      listItem.fadeOut (this.cardFadeTime, function() {
	if (bh.verbose.stack)
	  console.log ("Card removed after fade: " + listItem.html())
	listItem.remove()
	if (bh.verbose.stack)
	  bh.logStack()
      })
    },
    
    updatePlayerMood: function (mood, time) {
      var bh = this
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
	this.opponentID = id
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
         div.off ('click')
           .on ('click', bh.callWithSoundEffect (callback))
       })
    },

    showHistoryAlert: function() {
      this.showModalMessage ("You are currently viewing old (expired) cards. Swipe through to current cards to access mood and status buttons.", this.gameState === 'gameOver' ? function(){} : this.loadGameCards.bind(this))
    },

    refreshPlayerMoodImage: function() {
      if (this.playerMoodDiv) {
	var mood = this.currentExpansionNode.isHistory ? this.currentChoiceNode().self.mood : this.playerMood
	var click = this.currentExpansionNode.isHistory ? this.showHistoryAlert : this.showPlayerStatusPage
	this.refreshMoodImage (this.playerID, mood, this.playerMoodDiv, click)
      }
    },

    refreshOpponentMoodImage: function() {
      if (this.opponentMoodDiv) {
	var mood = this.currentExpansionNode.isHistory ? this.currentChoiceNode().other.mood : this.opponentMood
	var click = this.currentExpansionNode.isHistory ? this.showHistoryAlert : this.showOpponentStatusPage
	this.refreshMoodImage (this.opponentID, mood, this.opponentMoodDiv, click)
      }
    },

    callOrRetry: function (makePromise, retryCount, minWait, maxWait, validate) {
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

    makeMoveOrRetry: function (moveNumber) {
      actions = {}
      var f = this.REST_putPlayerGameMove.bind (this, this.playerID, this.gameID, moveNumber, this.jsonMove(moveNumber))
      return this.callOrRetry (f, this.moveRetryCount, this.moveRetryMinWait, this.moveRetryMaxWait, null)
    },

    makeMove: function (moveNumber) {
      var bh = this
      if (bh.moveNumber == moveNumber && this.gameState === 'ready') {
	if (this.verbose.messages)
	  console.log ("Making move #" + moveNumber + ": " + JSON.stringify(this.jsonMove(moveNumber)))
	bh.setGameState ('sendingMove')
	bh.makeMoveOrRetry (moveNumber)
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

      // expand the remaining parse tree randomly
      bh.expandRandomly (bh.currentExpansionNode)

      if (this.verbose.messages)
	console.log ("Making default move #" + this.moveNumber + ": " + JSON.stringify(this.jsonMove(this.moveNumber)))
      this.makeMoveOrRetry (this.moveNumber)
	.done (bh.startKicking.bind(bh))
	.fail (function() {
          if (bh.verbose.errors)
	    console.log("Failed to make default move; rebuilding page")
	  bh.loadGameCards()
	})
    },

    jsonMove: function(moveNumber) {
      return this.jsonExpansion (this.rootForMove[moveNumber])
    },

    jsonExpansion: function(expansion) {
      var bh = this
      var jm = { action: expansion.action }
      if (expansion.node) {
        var node = expansion.node
	jm.id = node.id
        jm.label = bighouseLabel.evalLabel (expansion, node.label, node.labelexpr)
      }
      if (expansion.children && expansion.children.length)
	jm.children = expansion.children.map (function (child) { return bh.jsonExpansion(child) })
      return jm
    },

    changeMoodFunction: function (moveNumber, mood) {
      var bh = this
      return function() {
        bh.playSound (mood)
        bh.updatePlayerMood (mood)  // call to update image, don't provide a timestamp
        bh.moodBar.find('*').addClass('unclickable')
        bh.REST_getPlayerGameMoveMood (bh.playerID, bh.gameID, moveNumber, mood)
          .done (function (data) {
            bh.moodBar.find('*').removeClass('unclickable')
            bh.updatePlayerMood (mood, data.time)  // call again to update timestamp
          }).fail (function () {
            bh.moodBar.find('*').removeClass('unclickable')
          })
      }
    },

    nodeThrowFunction: function (expansion, direction) {
      return function() {
	this.throwCard (expansion.card, direction)
      }
    },

    throwCard: function (card, direction) {
      var bh = this
      direction = direction || this.swingDir[this.lastSwipe] || (Math.random() < .5 ? -1 : +1)
      if (bh.verbose.stack) {
	console.log ("Throwing card #" + bh.cardIndex(card.elem) + ": " + card.elem.innerHTML)
	bh.logStack()
      }
      card.throwOut (direction * this.throwXOffset(), this.throwYOffset())
    },
    
    // socket message handler
    handlePlayerMessage: function (msg) {
      if (this.verbose.messages)
        console.log (msg)
      switch (msg.data.message) {
      case "join":
        if (this.page === 'play' || this.page === 'activeGames') {
	  if (this.verbose.messages)
	    console.log ("Received '" + msg.data.message + "' message for game #" + msg.data.event.game.id)
          this.updateEventFromJoinMessage (msg.data)
        }
        break
      case "move":
      case "timeout":
        if (this.gameID == msg.data.game) {
	  if (this.verbose.messages)
	    console.log ("Received '" + msg.data.message + "' message for move #" + msg.data.move + "; current move #" + this.moveNumber)
          if (msg.data.move >= this.moveNumber)
            this.callOrPostpone (this.loadGameCards.bind (this), msg)
	} else if (this.page === 'play' || this.page === 'activeGames')
          this.updateEventFromMoveMessage (msg.data)
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
      delete this.playerMoodDiv
      delete this.opponentMoodDiv

      delete this.moveNumber
      delete this.currentExpansionNode
      this.rootForMove = {}
      var gamePos = this.gamePosition[this.gameID]
      if (gamePos) {
        this.moveNumber = gamePos.moveNumber
        this.currentExpansionNode = gamePos.currentExpansionNode
	this.clearViewCache (this.currentExpansionNode)
      }

      this.showGamePage()
    },

    clearViewCache: function (expansion) {
      if (expansion) {
        delete expansion.dealt
        delete expansion.card
	this.clearViewCache (expansion.next)
      }
    },

    // audio
    startMusic: function (type, volume, promise) {
      var bh = this
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
