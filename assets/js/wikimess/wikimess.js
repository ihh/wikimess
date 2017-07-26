var WikiMess = (function() {
  var proto = function (config) {
    var wm = this
    config = config || {}
    $.extend (this, config)

    this.container = $('#'+this.containerID)
      .addClass("wikimess")

    this.localStorage = { playerLogin: undefined,
                          soundVolume: .5,
                          theme: 'plain' }
    try {
      var ls = JSON.parse (localStorage.getItem (this.localStorageKey))
      $.extend (this.localStorage, ls)
    } catch (err) {
      // do nothing
    }
    $.extend (this, this.localStorage)

    this.socket_onPlayer (this.handlePlayerMessage.bind (this))
    this.socket_onSymbol (this.handleSymbolMessage.bind (this))

    // preload sounds
    this.preloadSounds.forEach (this.loadSound)

    // preload icons
    this.iconPromise = {}
    Object.keys(this.iconFilename).forEach (function (icon) { wm.getIconPromise (wm.iconFilename[icon]) })
    this.tabs.forEach (function (tab) { wm.getIconPromise (tab.icon) })

    // initialize Markdown renderer
    var renderer = new marked.Renderer()
    renderer.link = function (href, title, text) { return text }
    renderer.image = function (href, title, text) { return text }
    this.markedConfig = { breaks: true,
                          sanitize: true,
                          smartLists: true,
                          smartypants: true,
                          renderer: renderer }

    this.randomizeEmptyMessageWarning()
    
    // monitor connection
    io.socket.on('disconnect', function() {
      if (wm.suppressDisconnectWarning)
        location.reload()
      else
        wm.showModalMessage ("You have been disconnected. Attempting to re-establish connection",
			     location.reload.bind (location, true))
    })

    // prevent scrolling/viewport bump on iOS Safari
    document.addEventListener ('touchmove', function(e){
      e.preventDefault()
    }, {passive: false})

    // initialize
    this.themeSelector(this.theme,{silent:true}) ()
    
    this.pushedViews = []

    this.symbolName = {}
    this.playerNameCache = {}
    
    // log in
    if (config.player) {
      this.initPlayerInfo (config.player)
      this.socket_getPlayerSubscribe (this.playerID)
        .then (this.showInitialPage.bind (this))
    } else
      this.showLoginPage()
  }

  $.extend (proto.prototype, {
    // default constants
    containerID: 'wikimess',
    localStorageKey: 'wikimess',
    iconPrefix: '/images/icons/',
    iconSuffix: '.svg',
    blankImageUrl: '/images/1x1blank.png',
    facebookButtonImageUrl: '/images/facebook.png',
    maxPlayerLoginLength: 16,
    maxPlayerNameLength: 32,
    maxRating: 5,
    ratingDelay: 2000,
    autosaveDelay: 5000,
    expansionAnimationDelay: 400,
    maxExpansionAnimationTime: 5000,
    autosuggestDelay: 500,
    unfocusDelay: 1000,
    starColor: 'darkgoldenrod',
    iconFilename: { edit: 'pencil',
                    backspace: 'backspace',
                    document: 'copy',
                    create: 'circle-plus',
                    destroy: 'trash-can',
                    plus: 'circle-plus',
                    minus: 'circle-minus',
                    up: 'up-arrow-button',
                    down: 'down-arrow-button',
                    help: 'help',
                    locked: 'padlock',
                    hide: 'hide',
                    randomize: 'rolling-die',
                    close: 'close',
                    send: 'send',
                    inbox: 'inbox',
                    outbox: 'outbox',
                    drafts: 'scroll-unfurled',
                    message: 'document',
                    follow: 'circle-plus',
                    unfollow: 'trash-can',
                    search: 'magnifying-glass',
                    compose: 'quill',
                    forward: 'forward',
                    reply: 'reply',
                    reload: 'refresh',
                    back: 'back',
                    dummy: 'dummy',
                    emptyStar: 'star-empty',
                    filledStar: 'star-filled',
                    halfStar: 'star-half',
                    menu: 'menu' },
    
    themes: [ {style: 'plain', text: 'Plain', iconColor: 'black', navbarIconColor: 'white', subnavbarIconColor: 'black' },
              {style: 'l33t', text: 'L33t', iconColor: 'green', navbarIconColor: 'darkgreen', subnavbarIconColor: 'darkgreen' } ],

    tabs: [{ name: 'status', method: 'showStatusPage', icon: 'mushroom-house', },
           { name: 'compose', method: 'showComposePage', icon: 'quill-ink' },
           { name: 'mailbox', method: 'showMailboxPage', icon: 'envelope' },
           { name: 'follows', method: 'showFollowsPage', icon: 'backup' },
           { name: 'grammar', method: 'showGrammarEditPage', icon: 'spell-book' },
           { name: 'settings', method: 'showSettingsPage', icon: 'pokecog' }],
    
    verbose: { page: false,
               request: true,
               response: true,
               messages: true,
               timer: false,
               errors: true,
	       stack: false },

    noRhsWarning: 'No definitions',
    newRhsTextGrammar: {root: ['#content goes here.',
                               'Here\'s where you add #content.',
                               '#content. Please edit!',
                               '#Rhubarb, #content.',
                               '#Rhubarb: #content.',
                               '#Content; #rhubarb.',
                               'TODO: #content.',
                               'WRITE ME: #content.',
                               '#Content. Do better if you can.',
                               'Insert #content.',
                               'Placeholder for #content.',
                               'Generic #content.',
                               'Just add #content.',
                               'More #content.',
                               'Yet more #content.',
                               '#Content, #content, #rhubarb...',
                               '#Content, #rhubarb, #content.',
                               '#Content, #rhubarb; #content.',
                               '#Content and #content.',
                               '#Content, laced with #content.',
                               '#Content, with a dash of #content.',
                               '#Content, plus #content.',
                               '#Content. Or, #content.',
                               '#Content, #content.',
                               '#Content. #Content.',
                               '#Content; #content.',
                               '#Content / #content.',
                               '#Content, #content, and #content.',
                               '#Content, #content, #content.'],
                        content: ['#adjective #noun'],
                        rhubarb: ['blah, blah', 'blah', 'rhubarb, rhubarb', 'jaw jaw', 'natter natter', 'wah wah wah'],
                        adjective: ['witty', 'attractive', 'scintillating', 'wonderful', 'amazing', 'engaging', 'brilliant', 'sparkling', 'illuminating', 'sharp', 'dazzling', 'humorous', 'lulzy', 'fascinating', 'radical', 'erudite', 'eloquent', 'hilarious', 'amusing', 'titillating', 'provocative', 'thoughtful', 'literate', 'intelligent', 'clever', 'bold', 'breathtaking', 'beautiful', 'flowery', 'pretty', 'loquacious', 'succinct', 'pithy', 'gracious', 'compassionate', 'warm'],
                        noun: ['prose', 'commentary', 'opinion', 'text', 'content', 'verbiage', 'language', 'output', 'poetry', 'writing', 'insight', 'repartee', 'conversation', 'badinage', 'nonsense']},
    
    emptyMessageWarnings: ["Nothing. I got nothing.",
                           "Nothing. I got nothing for ya.",
                           "Nothing. Really, nothing.",
                           "Nothing will come of nothing.",
                           "Nothing can come of nothing.",
                           "I am the wisest man alive, for I know one thing, and that is that I know nothing.",
                           "I must be made of nothing to feel so much nothing.",
                           "There is no there, there.",
                           "Anything can happen in life, especially nothing.",
                           "If you write a line of zeroes, it is still nothing.",  // This is Ayn Rand. Sorry.
                           "I deserve a spring - I owe nobody nothing.",
                           "And if thou gaze long into an abyss, the abyss will also gaze into thee.",
                           "We become aware of the void as we fill it.",
                           "Nothing, thou elder brother ev’n to shade. Thou hadst a being ere the world was made.",
                           "Where you have nothing, there you should want nothing.",
                           "For we brought nothing into this world; and it is certain we can carry nothing out.",
                           "It is good to say it aloud: 'Nothing has happened.' Once again: 'Nothing has happened.' Does that help?",
                           "We are nothing; less than nothing, and dreams. We are only what might have been..."],
                           
    emptyContentWarning: "Enter the message text here, or pick one of the suggestions below.",
    emptyTemplateWarning: "_The expanded message, as sent to the recipient, will appear here._",
    suppressDisconnectWarning: true,

    preloadSounds: ['error','select','login','logout','gamestart'],

    // REST API
    REST_loginFacebook: function() {
      window.location.replace ('/login/facebook')
    },

    REST_postPlayer: function (playerName, playerPassword) {
      return this.logPost ('/p/new', { name: playerName, password: playerPassword })
    },

    REST_postLogin: function (playerName, playerPassword) {
      return this.logPost ('/login', { name: playerName, password: playerPassword })
    },

    REST_postLogout: function() {
      return this.logPost ('/logout')
    },

    REST_postPlayerSearchPlayersAll: function (playerID, queryText, page) {
      return this.logPost ('/p/search/players/all', { query: queryText, page: page })
    },

    REST_postPlayerSearchPlayersFollowed: function (playerID, queryText) {
      return this.logPost ('/p/search/players/followed', { query: queryText })
    },

    REST_postPlayerSearchSymbolsAll: function (playerID, query, page) {
      return this.logPost ('/p/search/symbols/all', { query: query, page: page })
    },

    REST_postPlayerSearchSymbolsOwned: function (playerID, query) {
      return this.logPost ('/p/search/symbols/owned', { query: query })
    },

    REST_postPlayerConfig: function (playerID, config) {
      return this.logPost ('/p/config', config)
    },

    REST_getPlayerFollow: function (playerID) {
      return this.logGet ('/p/follow')
    },

    REST_getPlayerFollowOther: function (playerID, otherID) {
      return this.logGet ('/p/follow/' + otherID)
    },

    REST_getPlayerUnfollowOther: function (playerID, otherID) {
      return this.logGet ('/p/unfollow/' + otherID)
    },

    REST_getPlayerStatus: function (playerID) {
      return this.logGet ('/p/status')
    },

    REST_getPlayerThread: function (playerID, otherID) {
      return this.logGet ('/p/thread/' + otherID)
    },

    REST_getPlayerId: function (playerID, otherName) {
      return this.logGet ('/p/id/' + otherName)
    },

    REST_postId: function (playerName) {
      return this.logPost ('/id', { name: playerName })
    },

    REST_getPlayerInbox: function (playerID) {
      return this.logGet ('/p/inbox')
    },

    REST_getPlayerInboxCount: function (playerID) {
      return this.logGet ('/p/inbox/count')
    },

    REST_getPlayerOutbox: function (playerID) {
      return this.logGet ('/p/outbox')
    },

    REST_getPlayerMessage: function (playerID, messageID) {
      return this.logGet ('/p/message/' + messageID)
    },

    REST_getPlayerMessageHeader: function (playerID, messageID) {
      return this.logGet ('/p/message/' + messageID + '/header')
    },

    REST_getPlayerMessageSent: function (playerID, messageID) {
      return this.logGet ('/p/message/' + messageID + '/sent')
    },

    REST_postPlayerMessage: function (playerID, message) {
      return this.logPost ('/p/message', message)
    },

    REST_deletePlayerMessage: function (playerID, messageID) {
      return this.logDelete ('/p/message/' + messageID)
    },

    REST_putPlayerMessageRating: function (playerID, messageID, rating) {
      return this.logPut ('/p/message/' + messageID + '/rating',
                          { rating: rating })
    },

    REST_getPlayerDrafts: function (playerID) {
      return this.logGet ('/p/drafts')
    },

    REST_getPlayerDraft: function (playerID, draftID) {
      return this.logGet ('/p/draft/' + draftID)
    },

    REST_postPlayerDraft: function (playerID, draft) {
      return this.logPost ('/p/draft', { draft: draft })
    },

    REST_putPlayerDraft: function (playerID, draftID, draft) {
      return this.logPut ('/p/draft/' + draftID, { draft: draft })
    },

    REST_deletePlayerDraft: function (playerID, draftID) {
      return this.logDelete ('/p/draft/' + draftID)
    },
    
    REST_putPlayerSymbol: function (playerID, symbolID, name, rules) {
      return this.logPut ('/p/symbol/' + symbolID,
                          { name: name, rules: rules })
    },

    REST_deletePlayerSymbol: function (playerID, symbolID) {
      return this.logDelete ('/p/symbol/' + symbolID)
    },

    REST_getPlayerTemplate: function (playerID, templateID) {
      return this.logGet ('/p/template/' + templateID)
    },
    
    REST_getPlayerExpand: function (playerID, symbolID) {
      return this.logGet ('/p/expand/' + symbolID)
    },

    REST_postPlayerExpand: function (playerID, symbolQueries) {
      return this.logPost ('/p/expand', { symbols: symbolQueries })
    },

    REST_getHelpHtml: function() {
      return this.logGet ('/html/grammar-editor-help.html')
    },

    REST_getPlayerSuggestTemplates: function (playerID) {
      return this.logGet ('/p/suggest/templates')
    },

    REST_getPlayerSuggestReply: function (playerID, templateID) {
      return this.logGet ('/p/suggest/reply/' + templateID)
    },

    REST_postPlayerSuggestSymbol: function (playerID, beforeSymbols, afterSymbols, temperature) {
      return this.logPost ('/p/suggest/symbol', { before: beforeSymbols,
                                                  after: afterSymbols,
                                                  temperature: temperature })
    },
    
    // WebSockets interface
    socket_onPlayer: function (callback) {
      io.socket.on ('player', callback)
    },

    socket_onSymbol: function (callback) {
      io.socket.on ('symbol', callback)
    },

    socket_getPlayerSubscribe: function (playerID) {
      return this.socketGetPromise ('/p/subscribe')
    },

    socket_getPlayerUnsubscribe: function (playerID) {
      return this.socketGetPromise ('/p/unsubscribe')
    },
    
    socket_postPlayerSymbolNew: function (playerID, symbol) {
      return this.socketPostPromise ('/p/symbol', symbol)
    },

    socket_getPlayerSymbols: function (playerID) {
      return this.socketGetPromise ('/p/symbols')
    },

    socket_getPlayerSymbol: function (playerID, symbolID) {
      return this.socketGetPromise ('/p/symbol/' + symbolID)
    },

    socket_getPlayerSymname: function (playerID, symbolName) {
      return this.socketGetPromise ('/p/symname/' + symbolName)
    },

    // helpers to log ajax calls
    logGet: function (url) {
      var wm = this
      if (wm.verbose.request)
        console.log ('GET ' + url + ' request')
      return $.get (url)
        .then (function (result) {
          if (wm.verbose.response)
            console.log ('GET ' + url + ' response', result)
          return result
        })
    },

    logPost: function (url, data) {
      var wm = this
      if (wm.verbose.request)
        console.log ('POST ' + url + ' request', data)
      return $.ajax ({ url: url,
                       method: 'POST',
                       contentType: 'application/json',
                       data: JSON.stringify(data) })
        .then (function (result) {
          if (wm.verbose.response)
            console.log ('POST ' + url + ' response', result)
          return result
        })
    },

    logPut: function (url, data) {
      var wm = this
      if (wm.verbose.request)
        console.log ('PUT ' + url + ' request', data)
      return $.ajax ({ url: url,
                       method: 'PUT',
                       contentType: 'application/json',
                       data: JSON.stringify(data) })
        .then (function (result) {
          if (wm.verbose.response)
            console.log ('PUT ' + url + ' response', result)
          return result
        })
    },

    logDelete: function (url) {
      var wm = this
      if (wm.verbose.request)
        console.log ('DELETE ' + url + ' request')
      return $.ajax ({ url: url,
                       method: 'DELETE' })
        .then (function (result) {
          if (wm.verbose.response)
            console.log ('DELETE ' + url + ' response', result)
          return result
        })
    },
    
    // helpers to convert socket callbacks to promises
    socketGetPromise: function (url) {
      var wm = this
      var def = $.Deferred()
      if (wm.verbose.request)
        console.log ('socket GET ' + url + ' request')
      io.socket.get (url, function (resData, jwres) {
        if (jwres.statusCode == 200) {
          if (wm.verbose.response)
            console.log ('socket GET ' + url + ' response', resData)
          def.resolve (resData)
        } else
          def.reject (jwres)
      })
      return def
    },

    socketPostPromise: function (url, data) {
      var wm = this
      var def = $.Deferred()
      if (wm.verbose.request)
        console.log ('socket POST ' + url + ' request', data)
      io.socket.post (url, data, function (resData, jwres) {
        if (wm.verbose.response)
            console.log ('socket POST ' + url + ' response', resData)
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
      var wm = this
      return function (evt) {
        evt.preventDefault()
        evt.stopPropagation()
        if (elementToDisable) {
          if (elementToDisable.hasClass('already-clicked'))
            return;
          elementToDisable.addClass('already-clicked')
        }
        if (sfx && sfx.length)
          wm.selectSound = wm.playSound (sfx)
        callback.call (wm, evt)
      }
    },

    makeSilentLink: function (text, callback) {
      return this.makeLink (text, callback, '', true)
    },

    makeLink: function (text, callback, sfx, allowMultipleClicks) {
      var wm = this
      var link = $('<a href="#">')
          .text (text)
          .attr ('title', text)
      link.on ('click', this.callWithSoundEffect (callback, sfx, !allowMultipleClicks && link))
      return link
    },

    makeListLink: function (text, callback, sfx, allowMultipleClicks) {
      var span = $('<span class="listitem">').html(text)
      span.on ('click', this.callWithSoundEffect (callback, sfx, !allowMultipleClicks && span))
      return span
    },

    setPage: function (page) {
      var wm = this
      if (this.verbose.page)
	console.log ("Changing view from " + this.page + " to " + page)
      
      var def
      if (this.pageExit) {
        var pageExit = this.pageExit
        delete this.pageExit
        def = pageExit()
      } else {
        def = $.Deferred()
        def.resolve()
      }

      return def
        .then (function() {
          wm.page = page
        })
    },

    // login menu
    showLoginPage: function() {
      var wm = this
      return this.setPage ('login')
        .then (function() {
          var sanitizeLogin = wm.sanitizer ('nameInput', wm.sanitizePlayerName)
          wm.container
            .empty()
            .append ($('<div class="inputbar">')
                     .append ($('<form>')
                              .append ($('<label for="player">')
                                       .text('Player name'))
                              .append (wm.nameInput = $('<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="player" type="text">')
                                       .attr('maxlength', wm.maxPlayerLoginLength)
                                       .on('change', sanitizeLogin)
                                       .on('keyup', sanitizeLogin))
                              .append ($('<label for="player">')
                                       .text('Password'))
                              .append (wm.passwordInput = $('<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="password" type="password">'))))
            .append ($('<div class="menubar">')
                     .append ($('<div class="list">')
                              .append (wm.makeListLink ('Log in', wm.doReturnLogin),
                                       wm.makeListLink ('Sign up', wm.createPlayer),
                                       wm.makeListLink ($('<img>').attr('src',wm.facebookButtonImageUrl), wm.REST_loginFacebook)
                                       .addClass("noborder"))))
          if (wm.playerLogin)
            wm.nameInput.val (wm.playerLogin)
        })
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
      return this.doLogin (this.showInitialPage)
    },

    doInitialLogin: function() {
      return this.doLogin (this.showInitialPage)  // replace showInitialPage with login flow
    },

    doLogin: function (showNextPage) {
      var wm = this
      var fail = this.showLoginPage.bind (this)
      this.validatePlayerName
      (function() {
        wm.REST_postLogin (wm.playerLogin, wm.playerPassword)
          .done (function (data) {
	    if (!data.player)
              wm.showModalMessage (data.message, fail)
	    else {
              if (wm.selectSound)
                wm.selectSound.stop()
              wm.initPlayerInfo (data.player)
              wm.socket_getPlayerSubscribe (wm.playerID)
                .then (function() {
                  showNextPage.call(wm)
                })
	    }
          })
          .fail (function (err) {
	    wm.showModalWebError (err, fail)
          })
      }, fail)
    },

    initPlayerInfo: function (player) {
      this.playerInfo = player
      this.playerID = player.id
      this.playerLogin = player.name
      this.playerName = player.displayName

      this.composition = {}
      this.mailboxCache = {}
      this.messageCache = {}
    },

    createPlayer: function() {
      var wm = this
      var fail = this.showLoginPage.bind (this)
      this.validatePlayerName
      (function() {
        wm.REST_postPlayer (wm.playerLogin, wm.playerPassword)
          .done (function (data) {
            if (wm.selectSound)
	      wm.selectSound.stop()
	    wm.doInitialLogin()
          })
          .fail (function (err) {
	    if (err.status == 400)
              wm.showModalMessage ("A player with that name already exists", fail)
	    else
              wm.showModalWebError (err, fail)
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
      this.showModalMessage ((err.responseJSON && err.responseJSON.error) || (err.status && (err.status + " " + err.statusText)) || err, sfx, callback)
    },

    reloadOnFail: function() {
      var wm = this
      return function (err) {
        wm.showModalWebError (err, wm.reloadCurrentTab.bind(wm))
      }
    },
    
    reloadCurrentTab: function() {
      delete this.lastSavePromise  // prevent stalling on error
      this[this.currentTab.method] ()
    },

    showNavBar: function (currentTab) {
      var wm = this
      
      this.container
        .empty()
        .append (this.navbar = $('<div class="navbar">'))

      this.drawNavBar (currentTab)
    },

    redrawNavBar: function() {
      this.navbar.empty()
      this.drawNavBar (this.currentTab.name)
    },

    drawNavBar: function (currentTab) {
      var wm = this
      var navbar = this.navbar

      this.messageCountDiv = $('<div class="messagecount">').hide()
      if (typeof(this.messageCount) === 'undefined')
	this.updateMessageCount()
      else
	this.updateMessageCountDiv()
	
      this.tabs.map (function (tab) {
        var span = $('<span>').addClass('navtab').addClass('nav-'+tab.name)
        wm.getIconPromise(tab.icon)
          .done (function (svg) {
            svg = wm.colorizeIcon (svg, wm.themeInfo.navbarIconColor)
            span.append ($(svg).addClass('navicon'))
	    if (tab.name === 'mailbox')
	      span.append (wm.messageCountDiv)
          })
          .fail (function (err) {
            console.log(err)
          })
        if (tab.name === currentTab) {
          wm.currentTab = tab
          span.addClass('active')
        }
        span.on ('click', wm.callWithSoundEffect (function() {
          wm.pushedViews = []
          wm[tab.method]()
        }))
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

    placeIcon: function(icon,container) {
      this.getIconPromise(icon).done (function (svg) {
        container.html(svg)
      })
    },
    
    colorizeIcon: function(svg,fgColor,bgColor) {
      if (fgColor)
        svg = svg.replace(new RegExp("#fff", 'g'), fgColor)
      if (bgColor)
        svg = svg.replace(new RegExp("#000", 'g'), bgColor)
      return svg
    },

    updateMessageCount: function() {
      var wm = this
      this.REST_getPlayerInboxCount (this.playerID)
	.then (function (result) {
	  wm.messageCount = result.count
	  wm.updateMessageCountDiv()
	})
    },

    updateMessageCountDiv: function() {
      if (this.messageCount)
	this.messageCountDiv.text(this.messageCount).show()
      else
	this.messageCountDiv.hide()
    },

    capitalize: function (text) {
      return text.charAt(0).toUpperCase() + text.substr(1)
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
      var wm = this
      delete this.symbolCache
      delete this.lastPlayerSearch
      delete this.playerSearchResults
      delete this.lastSymbolSearch
      delete this.symbolSearchResults
      delete this.messageCount
      this.socket_getPlayerUnsubscribe (this.playerID)
	.then (function() {
	  wm.REST_postLogout()
	  wm.showLoginPage()
	})
    },
    
    // settings menu
    showSettingsPage: function() {
      var wm = this

      return this.setPage ('settings')
        .then (function() {
          wm.showNavBar ('settings')
          wm.container
            .append ($('<div class="menubar">')
                     .append ($('<div class="list">')
                              .append (wm.makeListLink ('Name', wm.showPlayerConfigPage),
                                       wm.makeListLink ('Bio', wm.showPlayerBioPage),
                                       wm.makeListLink ('Colors', wm.showThemesPage),
                                       wm.makeListLink ('Audio', wm.showAudioPage),
                                       wm.makeListLink ('Log out', wm.doLogout))))
        })
    },

    // settings
    showPlayerConfigPage: function() {
      var wm = this
      return this.pushView ('name')
        .then (function() {
          function saveChanges() {
            delete wm.pageExit
            var newName = wm.nameInput.val()
            var newLogin = wm.loginInput.val()
            if (newLogin.length && newName.length) {
              var update = {}
              if (newLogin !== wm.playerLogin)
                update.name = newLogin
              if (newName !== wm.playerName)
                update.displayName = newName
              if (wm.changePasswordInput.val().length) {
                if (wm.confirmPasswordInput.val() !== wm.changePasswordInput.val())
                  return $.Deferred().reject ("Passwords don't match")
                update.oldPassword = wm.oldPasswordInput.val()
                update.newPassword = wm.changePasswordInput.val()
              }
              return wm.REST_postPlayerConfig (wm.playerID, update)
                .then (function (result) {
                  delete wm.playerNameCache[wm.playerLogin]  // just in case it was cached in a previous login
                  wm.playerLogin = newLogin
                  wm.playerName = newName
                  wm.writeLocalStorage ('playerLogin')
                  if (update.newPassword)
                    window.alert ("Password successfully changed")
                })
            } else
              return $.Deferred().resolve()
          }
          wm.pageExit = saveChanges
          var backBar = wm.popBack (function (backButton) {
            backButton.off()
            wm.nameInput.prop('disabled',true)
            saveChanges()
              .then (function (result) {
                wm.popView()
              }).fail (function (err) {
                wm.showModalWebError (err, wm.popView.bind(wm))
              })
          })
          var sanitizeLogin = wm.sanitizer ('loginInput', wm.sanitizePlayerName)

          var passwordForm = $('<div class="inputbar">')
              .append ($('<form>')
                       .append ($('<span>').text('Old password'),
                                wm.oldPasswordInput = $('<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" type="password">'),
                                $('<span>').text('New password'),
                                wm.changePasswordInput = $('<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" type="password">'),
                                $('<span>').text('New password (confirm)'),
                                wm.confirmPasswordInput = $('<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" type="password">')))
          if (wm.playerInfo.hidePassword)
            passwordForm.hide()

          wm.container
            .append (wm.makePageTitle ('Login info'),
                     $('<div class="menubar">')
                     .append ($('<div class="inputbar">')
                              .append ($('<form>')
                                       .append ($('<span>').text('Login name'))
                                       .append (wm.loginInput = $('<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" type="text">')
                                                .val(wm.playerLogin)
                                                .on('keyup',sanitizeLogin)
                                                .on('change',sanitizeLogin)
                                                .attr('maxlength', wm.maxPlayerLoginLength))),
                              $('<div class="inputbar">')
                              .append ($('<form>')
                                       .append ($('<span>').text('Full name'))
                                       .append (wm.nameInput = $('<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" type="text">')
                                                .val(wm.playerName)
                                                .attr('maxlength', wm.maxPlayerNameLength))),
                              passwordForm))
            .append (backBar)
        })
    },

    // settings
    showPlayerBioPage: function() {
      var wm = this
      return this.pushView ('bio')
        .then (function() {
          function saveChanges() {
            wm.playerInfo.publicBio = wm.publicBioInput.val()
            wm.playerInfo.privateBio = wm.privateBioInput.val()
            return wm.REST_postPlayerConfig (wm.playerID, { noMailUnlessFollowed: wm.playerInfo.noMailUnlessFollowed,
                                                            createsPublicTemplates: wm.playerInfo.createsPublicTemplates,
                                                            gender: wm.playerInfo.gender,
                                                            publicBio: wm.playerInfo.publicBio,
                                                            privateBio: wm.playerInfo.privateBio })
          }
          wm.pageExit = saveChanges
          var backBar = wm.popBack (function (backButton) {
            backButton.off()
            saveChanges()
              .then (function (result) {
                wm.popView()
              }).fail (function (err) {
                wm.showModalWebError (err, wm.popView.bind(wm))
              })
          })
          wm.container
            .append ($('<div class="menubar">')
                     .append ($('<div class="configmenus">')
                              .append (wm.makeConfigMenu ({ id: 'gender',
                                                            opts: [{ text: "I'm a 'they'", value: 'neither' },
                                                                   { text: "I'm a 'she'", value: 'female' },
                                                                   { text: "I'm a 'he'", value: 'male' },
                                                                   { text: "I prefer not to say", value: 'secret' }] }),
                                       wm.makeConfigMenu ({ id: 'noMailUnlessFollowed',
                                                            opts: [{ text: "Anyone can contact me", value: false },
                                                                   { text: "Only people in my address book, please", value: true }] }),
                                       wm.makeConfigMenu ({ id: 'createsPublicTemplates',
                                                            opts: [{ text: "All my mail is public", value: true },
                                                                   { text: "I trust WikiMess security with my secrets", value: false }] })),
                              $('<div class="inputbar">')
                              .append (wm.publicBioInput = $('<textarea autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" class="bio public">')
                                       .attr ('rows', 2)
                                       .attr ('placeholder', 'Public info (shown to all)')
                                       .val(wm.playerInfo.publicBio)),
                              $('<div class="inputbar">')
                              .append (wm.privateBioInput = $('<textarea autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" class="bio private">')
                                       .attr ('rows', 3)
                                       .attr ('placeholder', 'Private info (shown only to people in your address book)')
                                       .val(wm.playerInfo.privateBio))))
            .append (backBar)
        })
    },

    makeConfigMenu: function (config) {
      var wm = this
      var menu = $('<div class="configmenu">')
          .append (config.opts.map (function (opt) {
            var span = $('<div class="option">').text (opt.text)
              .on ('click', function() {
                menu.find('*').removeClass('checked')
                span.addClass('checked')
                wm.playerInfo[config.id] = opt.value
              })
            if ((wm.playerInfo[config.id] || 0) == opt.value)
              span.addClass('checked')
            return span
          }))
      return menu
    },

    showThemesPage: function() {
      var wm = this

      var fieldset
      return this.pushView ('theme')
        .then (function() {
          wm.container
            .append (wm.makePageTitle ("Color themes"))
            .append ($('<div class="menubar">')
                     .append (fieldset = $('<fieldset class="themegroup">')
                              .append ($('<legend>').text("Select theme"))))
            .append (wm.popBack())

          var radio = {}, label = {}, config = { silent: true, reload: true }
          wm.themes.forEach (function (theme) {
            var id = 'theme-' + theme.style
            fieldset.append (radio[theme.style] = $('<input type="radio" name="theme" id="'+id+'" value="'+theme.style+'">'))
	      .append (label[theme.style] = $('<label for="'+id+'" class="'+theme.style+'">')
                       .text(theme.text)
                       .on('click',wm.themeSelector(theme.style,config)))
          })

          wm.themeSelector (wm.theme, { silent: true })()
          radio[wm.theme].prop ('checked', true)
          config.silent = false
        })
    },

    themeSelector: function(style,config) {
      var wm = this
      var theme = wm.themes.find (function(t) { return t.style === style })
      return function() {
	wm.themes.forEach (function (oldTheme) {
          wm.container.removeClass (oldTheme.style)
	})
        wm.container.addClass (theme.style)
        wm.theme = theme.style
        wm.themeInfo = theme
        wm.writeLocalStorage ('theme')
        if (config.reload) {
          wm.redrawPopBack()
          wm.redrawNavBar()
        }
      }
    },

    showAudioPage: function() {
      var wm = this

      return this.pushView ('audio')
        .then (function() {
          var soundInput
          wm.container
            .append (wm.makePageTitle ("Audio settings"))
            .append ($('<div class="menubar">')
                     .append ($('<div class="card">')
                              .append (soundInput = $('<input type="range" value="50" min="0" max="100">'))
                              .append ($('<span>').text("Sound FX volume"))))
            .append (wm.popBack())

          soundInput.val (wm.soundVolume * 100)
          soundInput.on ('change', function() {
            wm.soundVolume = soundInput.val() / 100
            wm.playSound ('select')
            wm.writeLocalStorage ('soundVolume')
          })

          // restore disabled slide events for these controls
          soundInput.on('touchmove',function(e){e.stopPropagation()})
        })
    },

    pushView: function (newPage) {
      var elements = this.container.find(':not(.pushed)').filter(':not(.navbar)')
          .filter (function() { return $(this).parents('.navbar').length === 0})
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
      return this.setPage (newPage)
    },

    popView: function() {
      var wm = this
      var poppedView = this.pushedViews.pop()
      if (this.verbose.page)
	console.log ("Popping " + this.page + " view, returning to " + poppedView.page)
      this.container.find('.pushed').find('*').addBack().addClass('pushed')  // make sure any descendants added after the push are flagged as pushed
      this.container.find(':not(.pushed)').filter(':not(.navbar)')
        .filter (function() { return $(this).parents('.navbar').length === 0})
        .remove()
      poppedView.elements.find('*').addBack().removeClass('pushed').removeClass('already-clicked')
      return this.setPage (poppedView.page)
        .then (function() {
          wm.pageSuspend = poppedView.pageSuspend
          wm.pageResume = poppedView.pageResume
          wm.pageExit = poppedView.pageExit
          if (wm.pageResume)
            wm.pageResume()
        })
    },

    // compose message
    showComposePage: function (config) {
      var wm = this
      config = config || {}
      
      return this.setPage ('compose')
        .then (function() {
          wm.showNavBar ('compose')

          function saveDraft() {
            if (wm.composition.needsSave) {
              delete wm.composition.needsSave
              return wm.finishLastSave()
                .then (function() {
                  var draft = { recipient: wm.composition.recipient && wm.composition.recipient.id,
                                previous: wm.composition.previousMessage,
                                previousTemplate: wm.composition.previousTemplate,
                                template: wm.composition.template,
                                title: wm.composition.title,
                                body: wm.composition.body }
                  if (wm.composition.draft)
                    wm.lastSavePromise = wm.REST_putPlayerDraft (wm.playerID, wm.composition.draft, draft)
                  else
                    wm.lastSavePromise = wm.REST_postPlayerDraft (wm.playerID, draft)
                    .then (function (result) {
                      wm.composition.draft = result.draft.id
                    })
                })
            } else
              return Promise.resolve()
          }
          wm.saveOnPageExit ({ unfocus: wm.saveCurrentEdit.bind(wm),
                               autosave: saveDraft,
                               pageExit: saveDraft })

          wm.playerSearchInput = $('<textarea autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" class="recipient">')
          wm.playerSearchResultsDiv = $('<div class="results">')

          if (config.title)
            wm.composition.title = config.title
          
          function markForSave() { wm.composition.needsSave = true }
          wm.messageTitleInput = $('<textarea autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" class="title">')
            .attr ('placeholder', 'Message subject')
            .val (wm.composition.title)
            .on ('keyup', function() {
              wm.composition.title = wm.messageTitleInput.val()
            }).on ('change', markForSave)

          wm.composition.previousTemplate = config.previousTemplate
          wm.composition.template = config.template || wm.composition.template || {}
          wm.composition.template.content = wm.composition.template.content || []

          wm.clearTimer ('autosuggestTimer')
          function autosuggestKey (before, after) {
            return before.map (function (rhsSym) { return rhsSym.name })
              .concat (['.'],
                       after.map (function (rhsSym) { return rhsSym.name }))
              .join (' ')
          }
          function textareaAutosuggest (input) {
            input.focus()  // in case we were triggered by player hitting 'randomize' button
            var newVal = input.val(), caretPos = input[0].selectionStart, caretEnd = input[0].selectionEnd
            if (newVal !== wm.autosuggestStatus.lastVal)
              if (wm.updateComposeContent (wm.parseRhs (newVal)))
                wm.generateMessageBody()
            if (caretPos === caretEnd && (newVal !== wm.autosuggestStatus.lastVal || caretPos !== wm.autosuggestStatus.lastCaretPos)) {
              wm.autosuggestStatus.lastVal = newVal
              wm.autosuggestStatus.lastCaretPos = caretPos
              var newValBefore = newVal.substr(0,caretPos), newValAfter = newVal.substr(caretPos)
              var symbolSuggestionPromise, getInsertText
              // autocomplete
              var endsWithSymbolRegex = /#(\w*)$/, symbolContinuesRegex = /^\w/;
              var endsWithSymbolMatch = endsWithSymbolRegex.exec(newValBefore)
              if (endsWithSymbolMatch && endsWithSymbolMatch[1].length && !symbolContinuesRegex.exec(newValAfter)) {
                var prefix = endsWithSymbolMatch[1]
                delete wm.autosuggestStatus.lastKey
                wm.autosuggestStatus.temperature = 0
                symbolSuggestionPromise = wm.REST_postPlayerSearchSymbolsOwned (wm.playerID, { name: { startsWith: prefix } })
                getInsertText = function (symbol) {
                  return symbol.name.substr (prefix.length) + ' '
                }
              } else {
                // symbol suggestions
                var beforeSymbols = wm.parseRhs (newValBefore, true).map (function (sym) { return { id: sym.id, name: sym.name } })
                var afterSymbols = wm.parseRhs (newValAfter, true).map (function (sym) { return { id: sym.id, name: sym.name } })
                var key = autosuggestKey (beforeSymbols, afterSymbols)
                if (wm.autosuggestStatus.lastKey !== key) {
                  wm.autosuggestStatus.lastKey = key
                  symbolSuggestionPromise = wm.REST_postPlayerSuggestSymbol (wm.playerID, beforeSymbols, afterSymbols, wm.autosuggestStatus.temperature)
                  getInsertText = function (symbol) { return (endsWithSymbolMatch ? '' : '#') + symbol.name + ' ' }
                }
              }
              if (symbolSuggestionPromise)
                wm.populateSuggestions (symbolSuggestionPromise, function (symbol) {
                  var updatedNewValBefore = newValBefore + getInsertText (symbol)
                  input.val (updatedNewValBefore + newValAfter)
                  wm.setCaretToPos (input, updatedNewValBefore.length)
//                  input.focus()
                  textareaAutosuggest (input)
                })
            }
          }

          function divAutosuggest() {
            var before = wm.composition.template.content
                .filter (function (rhsSym) { return typeof(rhsSym) === 'object' })
                .map (function (sym) { return { id: sym.id, name: sym.name } })
            var key = autosuggestKey (before, [])
            if (wm.autosuggestStatus.lastKey !== key) {
              wm.autosuggestStatus.lastKey = key
              wm.populateSuggestions (wm.REST_postPlayerSuggestSymbol (wm.playerID, before, [], wm.autosuggestStatus.temperature),
                                      function (symbol) {
                                        var spacer = ' '
                                        wm.updateComposeContent (wm.composition.template.content.concat ([spacer,
                                                                                                          { id: symbol.id,
                                                                                                            name: symbol.name }]))
                                        updateComposeDiv()
                                        var generatePromise =
                                            (wm.animationExpansion
                                             ? wm.REST_getPlayerExpand (wm.playerID, symbol.id)
                                             .then (function (result) {
                                               wm.copyModifiers (result.expansion, symbol)
                                               wm.appendToMessageBody ([spacer, result.expansion])
                                             })
                                             : wm.generateMessageBody())
                                        generatePromise.then (divAutosuggest)
                                      })
                .then (function() {
                  if (wm.composition.template.content.length)
                    wm.suggestionDiv.append
                  (wm.makeIconButton ('backspace',
                                      function() {
                                        var newContent = wm.composition.template.content.slice(0)
                                        var nSymPopped = 0
                                        while (newContent.length) {
                                          var poppedSym = newContent.pop()
                                          ++nSymPopped
                                          if (typeof(poppedSym) === 'object'
                                              || poppedSym.match(/\S/))
                                            break
                                        }
                                        wm.updateComposeContent (newContent)
                                        updateComposeDiv()
                                        if (wm.composition.body) {
                                          wm.composition.body.rhs.splice
                                          (wm.composition.template.content.length,
                                           wm.composition.body.rhs.length - wm.composition.template.content.length)
                                          wm.showMessageBody()
                                        } else
                                          wm.generateMessageBody()
                                        divAutosuggest()
                                      }))
                })
            }
          }
          wm.autosuggestStatus = { temperature: 0, refresh: divAutosuggest }

          wm.messageComposeDiv = $('<div class="messagecompose">')
          function updateComposeDiv() {
            wm.populateEditableElement
            (wm.messageComposeDiv,
             { content: function() { return wm.composition.template ? wm.composition.template.content : [] },
               changeCallback: function (input) {
                 wm.composition.needsSave = true
                 wm.autosuggestStatus.temperature = 0
                 wm.setTimer ('autosuggestTimer',
                              wm.autosuggestDelay,
                              textareaAutosuggest.bind (wm, input))
               },
               showCallback: function (input) {
                 delete wm.autosuggestStatus.lastKey
                 delete wm.autosuggestStatus.lastVal
                 wm.autosuggestStatus.temperature = 0
                 wm.autosuggestStatus.refresh = textareaAutosuggest.bind (wm, input)
                 wm.clearTimer ('autosuggestTimer')
                 wm.suggestionDiv
                   .empty()
                   .off ('click')
                   .on ('click', function() { input.focus() })
                 textareaAutosuggest (input)
               },
               hideCallback: function() {
                 delete wm.autosuggestStatus.lastKey
                 wm.autosuggestStatus.temperature = 0
                 wm.autosuggestStatus.refresh = divAutosuggest
                 divAutosuggest()
               },
               alwaysUpdate: true,
               updateCallback: function (newContent) {
                 return wm.updateComposeContent (newContent) ? wm.generateMessageBody() : $.Deferred().resolve()
               },
               parse: wm.parseRhs.bind(wm),
               renderText: wm.makeRhsText.bind(wm),
               renderHtml: wm.makeTemplateSpan.bind(wm)
             })
          }
          updateComposeDiv()
          
          wm.messageBodyDiv = $('<div class="messagebody">')
            .on ('click', wm.stopAnimation.bind(wm))

          delete wm.animationExpansion
          if (config.body && config.body.rhs && config.body.rhs.find (function (x) { return typeof(x) === 'string' && x.match(/\S/) })) {
            wm.composition.body = config.body
            wm.showMessageBody()
          } else if (config.template)
            wm.generateMessageBody()
          else
            wm.showMessageBody()
          
          function send() {
            wm.saveCurrentEdit()
              .then (function() {
                if (!wm.composition.recipient)
                  window.alert ("Please specify a recipient.")
                else if (wm.templateIsEmpty())
                  window.alert ("Please enter some message text.")
                else if (!(wm.composition.body && wm.makeExpansionText(wm.composition.body).match(/\S/)))
                  window.alert ("Message is empty. Please vary the message text, or re-roll to generate a new random message.")
                else if (!(wm.composition.title && wm.composition.title.length))
                  window.alert ("Please give this message a title.")
                else {
                  wm.sendButton.off ('click')
                  delete wm.composition.previousTemplate
                  wm.REST_postPlayerMessage (wm.playerID, { recipient: wm.composition.recipient.id,
                                                            template: wm.composition.template,
                                                            title: wm.composition.title,
                                                            body: wm.composition.body,
                                                            previous: wm.composition.previousMessage,
                                                            draft: wm.composition.draft })
                    .then (function (result) {
                      wm.composition = {}
                      delete wm.mailboxCache.outbox   // TODO: update wm.mailboxCache.outbox
                      return wm.showMailboxPage ({ tab: 'outbox' })
                        .then (function() {
                          // TODO: update wm.mailboxCache.outbox
                        })
                    }).catch (function (err) {
                      wm.showModalWebError (err, wm.reloadCurrentTab.bind(wm))
                    })
                }
              })
          }
                    
          wm.container
            .append (wm.composeDiv = $('<div class="compose">')
                     .append ($('<div class="messageheader">')
                              .append ($('<div class="row">')
                                       .append ($('<span class="label">').text ('To'),
                                                $('<span class="input">').append (wm.playerSearchInput,
                                                                                  wm.playerSearchResultsDiv.hide())),
                                       $('<div class="row">')
                                       .append ($('<span class="label">').text ('Subject'),
                                                $('<span class="input">').append (wm.messageTitleInput))),
                              $('<div class="messageborder">')
                              .append (wm.messageComposeDiv,
                                       wm.suggestionDiv = $('<div class="suggest">'),
                                       wm.messageBodyDiv)),
                     $('<div class="subnavbar">').append
                     (wm.editButton = wm.makeSubNavIcon ('edit', function() {
                       wm.stopAnimation()
                       wm.messageComposeDiv.trigger ('click')
                     }),
                      wm.randomizeButton = wm.makeSubNavIcon ('randomize', function (evt) {
                        evt.stopPropagation()
                        wm.generateMessageBody()
                        delete wm.autosuggestStatus.lastVal
                        delete wm.autosuggestStatus.lastKey
                        wm.autosuggestStatus.temperature++
                        wm.autosuggestStatus.refresh()
                      }),
                      wm.destroyButton = wm.makeSubNavIcon ('destroy', function (evt) {
                        if (window.confirm ('Delete this draft?'))
                          wm.finishLastSave()
                          .then (function() {
                            var def = (wm.composition.draft
                                       ? wm.REST_deletePlayerDraft (wm.playerID, wm.composition.draft)
                                       : $.Deferred().resolve())
                            def.then (function() {
                              wm.showMailboxPage ({ tab: 'drafts' })
                                .then (function() {
                                  // TODO: update wm.mailboxCache.drafts
                                })
                            })
                          })
                      }),
                      wm.sendButton = wm.makeSubNavIcon ('send', send)))

          wm.restoreScrolling (wm.messageComposeDiv)
          wm.restoreScrolling (wm.messageBodyDiv)
          wm.restoreScrolling (wm.suggestionDiv)

          if (config.recipient) {
            wm.composition.recipient = config.recipient
            wm.lastComposePlayerSearchText = config.recipient.name
          }

          wm.playerSearchInput.attr ('placeholder', 'Player name')
            .val (wm.lastComposePlayerSearchText)
          wm.playerSearchInput
            .on ('keyup', wm.doComposePlayerSearch.bind(wm))
            .on ('click', wm.doComposePlayerSearch.bind(wm,true))
            .on ('change', markForSave)
          if (!wm.composition.recipient) {
            delete wm.lastComposePlayerSearchText
            wm.doComposePlayerSearch()
          }
          
          if (config.previousMessage)
            wm.composition.previousMessage = config.previousMessage

          if (config.draft)
            wm.composition.draft = config.draft

          divAutosuggest()
          wm.randomizeButton.show()
          
          if (config.focus)
            wm[config.focus].focus().trigger ('click')
          if (config.click)
            wm[config.click].trigger ('click')

          return true
        })
    },
    
    updateComposeContent: function (newContent) {
      if (JSON.stringify(this.composition.template.content) !== JSON.stringify(newContent)) {
        delete this.composition.template.id
        delete this.composition.previousTemplate
        this.composition.template.content = newContent
        this.autosuggestStatus.temperature = 0
        wm.composition.needsSave = true
        return true
      }
      return false
    },
    
    populateSuggestions: function (symbolSuggestionPromise, symbolSelectCallback) {
      var wm = this
      return symbolSuggestionPromise.then (function (result) {
        wm.suggestionDiv.empty()
          .append ($('<div class="suggestlabel">').text('Suggestions:'),
                   result.symbols.map (function (symbol) {
                     wm.symbolName[symbol.id] = symbol.name
                     return wm.makeSymbolSpan (symbol, function (evt) {
                       evt.stopPropagation()
                       wm.suggestionDiv.empty()
                       symbolSelectCallback (symbol)
                     })
                   }))
      })
    },
    
    clearComposeRecipient: function() {
      var wm = this
      delete wm.composition.recipient
      wm.playerSearchInput.val('')
      wm.doComposePlayerSearch()
    },
    
    doComposePlayerSearch: function (forceNewSearch) {
      var wm = this
      var searchText = this.playerSearchInput.val()
      delete wm.composition.recipient
      if (forceNewSearch || searchText !== this.lastComposePlayerSearchText) {
        this.lastComposePlayerSearchText = searchText
        if (searchText.length)
          this.REST_postPlayerSearchPlayersFollowed (this.playerID, searchText.replace('@',''))
          .then (function (result) {
            wm.showComposePlayerSearchResults (result.players)
          })
        else
          wm.showComposePlayerSearchResults()
      }
    },
    
    showComposePlayerSearchResults: function (results) {
      var wm = this
      this.playerSearchResultsDiv
        .empty()
        .hide()
      if (results) {
        if (results.length)
          this.playerSearchResultsDiv
          .append (results.map (function (player) {
            return wm.makePlayerSpan (player.name,
                                      player.displayName,
                                      function() {
                                        wm.playerSearchResultsDiv.hide()
                                        wm.composition.recipient = player
                                        wm.playerSearchInput.val (wm.lastComposePlayerSearchText = '@' + player.name)
                                      }).addClass('result')
          })).show()
        else
          this.playerSearchResultsDiv
          .html ($('<span class="warning">').text ("No matching players found"))
          .show()
      }
    },

    renderMarkdown: function (markdown, transform) {
      var wm = this
      // this method is pretty hacky...
      // first, intercept whitespace strings and return them unmodified
      if (!markdown.match (/\S/))
        return markdown
      // next, call marked library to convert Markdown to HTML string
      var renderedHtml = marked (markdown, this.markedConfig)
          .replace (/@(\w+)/g, function (match, name) {
            return '<span class="playertag">@<span class="name">' + name + '</span></span>'
          })
      // next, call optional transform method on HTML string (e.g. to put animation styling on #symbols)
      if (transform)
        renderedHtml = transform (renderedHtml)
      // next, convert HTML string to JQuery object, and use JQuery to add player-tag styling
      // and asynchronously resolve player names
      var rendered = $(renderedHtml)
      $(rendered).find('.playertag')
        .each (function (n, playerTag) {
          var playerName = $(playerTag).find('.name').text()
          wm.getPlayerId (playerName)
            .then (function (player) {
              if (player)
                $(playerTag).removeClass('playertag').addClass('playerlink')
                .on ('click', wm.showOtherStatusPage.bind (wm, player))
            })
        })
      return rendered
    },

    getPlayerId: function (name) {
      if (name === wm.playerLogin)
        return $.Deferred().resolve (wm.playerID)
      if (typeof(wm.playerNameCache[name]) !== 'undefined')
        return $.Deferred().resolve (wm.playerNameCache[name])
      return wm.REST_getPlayerId (wm.playerID, name)
        .then (function (result) {
          wm.playerNameCache[name] = result.player
          return result.player
        })
    },

    startAnimatingExpansion: function() {
      this.animationSteps = Math.max (this.animationSteps || 0, this.countSymbolNodes (this.animationExpansion))
      this.extraAnimationSteps = 1
      this.animateExpansion()
    },
    
    animateExpansion: function() {
      var wm = this
      this.clearTimer ('expansionAnimationTimer')
      var markdown = this.renderMarkdown
      (this.makeExpansionText (this.animationExpansion, true)
       .replace (/^\s*$/, wm.emptyMessageWarning),
       function (html) { return wm.linkSymbols (wm.expandVars (html)) })
      
      this.animationDiv.html (markdown)
               
      if (this.deleteFirstSymbolName (this.animationExpansion) || this.extraAnimationSteps-- > 0)
        this.setTimer ('expansionAnimationTimer',
                       Math.min (this.expansionAnimationDelay, Math.ceil (this.maxExpansionAnimationTime / this.animationSteps)),
                       this.animateExpansion.bind(this))
    },

    linkSymbols: function (html) {
      var nSymbols = 0
      return html.replace
      (/#(\w+)\.([a-z]+)/g,
       function (_match, name, className) {
         return '<span class="lhslink ' + className + (nSymbols++ ? '' : ' animating') + '">#<span class="name">' + name + '</span></span>'
       })
    },

    expandVars: function (html, varVal) {
      varVal = varVal || { me: '<span class="var">Sender</span>',
                           you: '<span class="var">Recipient</span>' }
      return html
        .replace (/\$(\w+)\b/ig, function (m, v) { return varVal[v] || m })
    },

    stopAnimation: function() {
      if (this.expansionAnimationTimer) {
        this.animationDiv.html (this.renderMarkdown (this.makeExpansionText (this.animationExpansion), this.expandVars))
        this.clearTimer ('expansionAnimationTimer')
        return true
      }
      return false
    },

    clearTimer: function (timerName) {
      if (this[timerName])
        window.clearTimeout (this[timerName])
      delete this[timerName]
    },
    
    setTimer: function (timerName, delay, callback) {
      var wm = this
      this.clearTimer (timerName)
      this[timerName] = window.setTimeout (function() {
        delete wm[timerName]
        callback()
      }, delay)
    },
    
    makeExpansionText: function (node, leaveSymbolsUnexpanded) {
      var wm = this
      var expansion = ''
      if (node) {
        if (typeof(node) === 'string')
          expansion = node
        else if (node.rhs) {
          if (leaveSymbolsUnexpanded && node.name)
            expansion = '#' + node.name + '.' + (node.limit ? ('limit' + node.limit.type) : 'unexpanded')
          else {
            expansion = node.rhs.map (function (rhsSym) {
              return wm.makeExpansionText (rhsSym, leaveSymbolsUnexpanded)
            }).join('')
            if (!leaveSymbolsUnexpanded || !wm.firstNamedSymbol(node)) {
              if (node.cap)
                expansion = wm.capitalize (expansion)
              if (node.upper)
                expansion = expansion.toUpperCase()
              if (node.plural)
                expansion = wm.pluralForm (expansion)
              if (node.a)
                expansion = wm.indefiniteArticle (expansion)
            }
          }
        }
      }
      return expansion
    },

    copyModifiers: function (target, source) {
      var mods = ['cap', 'upper', 'plural', 'a']
      mods.forEach (function (mod) { target[mod] = source[mod] })
    },
    
    capitalize: function (text) {
      return text
        .replace (/^(\s*)([a-z])/, function (m, g1, g2) { return g1 + g2.toUpperCase() })
        .replace (/([\.\!\?]\s*)([a-z])/g, function (m, g1, g2) { return g1 + g2.toUpperCase() })
    },

    matchCase: function (model, text) {
      return model.match(/[A-Z]/) ? text.toUpperCase() : text
    },
    
    plural: function (num, singular) {
      if (num === 1)
        return '1 ' + singular
      return num + ' ' + this.pluralForm (singular)
    },

    // this list needs beefing up...
    irregularPlural: {
      addendum: 'addenda', alga: 'algae', alumnus: 'alumni', amoeba: 'amoebae', antenna: 'antennae', bacterium: 'bacteria', cactus: 'cacti', curriculum: 'curricula', datum: 'data', fungus: 'fungi', genus: 'genera', larva: 'larvae', memorandum: 'memoranda', stimulus: 'stimuli', syllabus: 'syllabi', vertebra: 'vertebrae',
      echo: 'echoes', embargo: 'embargoes', hero: 'heroes', potato: 'potatoes', tomato: 'tomatoes', torpedo: 'torpedoes', veto: 'vetoes', volcano: 'volcanoes',
      child: 'children', dormouse: 'dormice', foot: 'feet', goose: 'geese', louse: 'lice', man: 'men', mouse: 'mice', ox: 'oxen', tooth: 'teeth', woman: 'women',
      axis: 'axes', analysis: 'analyses', basis: 'bases', crisis: 'crises', diagnosis: 'diagnoses', ellipsis: 'ellipses', emphasis: 'emphases', hypothesis: 'hypotheses', neurosis: 'neuroses', oasis: 'oases', paralysis: 'paralyses', parenthesis: 'parentheses', thesis: 'theses',
      appendix: 'appendices', index: 'indices', matrix: 'matrices',
      barracks: 'barracks', deer: 'deer', fish: 'fish', gallows: 'gallows', means: 'means', offspring: 'offspring', series: 'series', sheep: 'sheep', species: 'species'
    },

    pluralForm: function (singular) {
      var wm = this
      var match
      if ((match = singular.match(/^([\s\S]*)\b(\w+)(\s*)$/)) && wm.irregularPlural[match[2]])
        return match[1] + wm.matchCase (match[2], wm.irregularPlural[match[2]]) + match[3]
      else if (singular.match(/(ch|sh|s|x|z)\s*$/i))
        return singular.replace(/(ch|sh|s|x|z)(\s*)$/i, function (match, ending, spacer) { return ending + wm.matchCase(ending,'es') + spacer })
      else if (singular.match(/[aeiou]y\s*$/i))
        return singular.replace (/(y)(\s*)$/i, function (match, y, spacer) { return wm.matchCase(y,'ys') + spacer })
      else if (singular.match(/y\s*$/i))
        return singular.replace (/(y)(\s*)$/i, function (match, y, spacer) { return wm.matchCase(y,'ies') + spacer })
      else if (singular.match(/fe?\s*$/i))
        return singular.replace (/(fe?)(\s*)$/i, function (match, fe, spacer) { return wm.matchCase(fe,'ves') + spacer })
      else if (singular.match(/o\s*$/i))
        return singular.replace (/(o)(\s*)$/i, function (match, o, spacer) { return wm.matchCase(o,'os') + spacer })
      else if (singular.match(/[a-zA-Z]\s*$/i))
        return singular.replace (/([a-zA-Z])(\s*)$/i, function (match, c, spacer) { return c + wm.matchCase(c,'s') + spacer })
      return singular
    },

    indefiniteArticle: function (nounPhrase) {
      var article = nounPhrase.match(/^[^A-Za-z]*[aeiou]/i) ? 'an' : 'a'
      return article + nounPhrase
    },

    countSymbolNodes: function (node, includeLimitedNodes) {
      var wm = this
      return (typeof(node) === 'string'
              ? 0
              : (node.rhs
                 ? node.rhs.reduce (function (total, child) {
                   return total + wm.countSymbolNodes (child, includeLimitedNodes)
                 }, ((node.id || node.name) && (includeLimitedNodes || !node.limit)) ? 1 : 0)
                 : 0))
    },

    firstNamedSymbol: function (node) {
      var wm = this
      if (typeof(node) === 'object') {
        if (node.name)
          return node
        if (node.rhs)
          for (var n = 0; n < node.rhs.length; ++n) {
            var s = this.firstNamedSymbol (node.rhs[n])
            if (s)
              return s
          }
      }
      return false
    },
    
    deleteFirstSymbolName: function (node) {
      var namedNode = this.firstNamedSymbol (node)
      if (namedNode && namedNode.name) {
        delete namedNode.name
        return true
      }
      return false
    },

    deleteAllSymbolNames: function (node) {
      if (typeof(node) === 'object') {
        if (node.name)
          delete node.name
        if (node.rhs)
          node.rhs.forEach (this.deleteAllSymbolNames.bind (this))
      }
    },

    generateMessageBody: function() {
      var wm = this
      wm.composition.body = {}
      wm.composition.needsSave = true
      
      var templatePromise
      if (wm.composition.previousTemplate)
        templatePromise = wm.REST_getPlayerSuggestReply (wm.playerID, wm.composition.previousTemplate.id)
        .then (function (result) {
          if (result.template)
            wm.composition.template = result.template
          if (!result.more)
            delete wm.composition.previousTemplate
        })
      else
        templatePromise = $.Deferred().resolve()

      return templatePromise.then (function() {
        if (wm.composition.template && wm.composition.template.content) {
          var symbolQueries = wm.composition.template.content.filter (function (rhsSym) {
            return typeof(rhsSym) === 'object'
          })
          return wm.REST_postPlayerExpand (wm.playerID, symbolQueries)
        } else
          return null
      }).then (function (result) {
        if (result) {
          var n = 0
          wm.composition.body = { rhs: wm.composition.template.content.map (function (rhsSym) {
            if (typeof(rhsSym) === 'string')
              return rhsSym
            var expansion = result.expansions[n++]
            if (expansion && typeof(expansion.id) !== 'undefined') {
              rhsSym.id = expansion.id
              wm.symbolName[expansion.id] = expansion.name
              wm.copyModifiers (expansion, rhsSym)
              return expansion
            }
            return rhsSym
          }) }
          wm.showMessageBody ({ animate: true })
        } else
          wm.showMessageBody()
      })
    },

    showMessageBody: function (config) {
      var wm = this
      config = config || {}
      var div = config.div || wm.messageBodyDiv
      var expansion = config.expansion || wm.composition.body
      wm.animationExpansion = _.cloneDeep (expansion)
      wm.animationDiv = div
      wm.randomizeEmptyMessageWarning()
      if (config.animate && wm.countSymbolNodes(expansion,true)) {
        delete wm.animationSteps
        this.startAnimatingExpansion()
      } else {
        wm.deleteAllSymbolNames (wm.animationExpansion)
        wm.animationSteps = 0
        div.html (this.renderMarkdown (wm.makeExpansionText (expansion)
                                       .replace (/^\s*$/, (!config.inEditor && wm.templateIsEmpty()
                                                           ? wm.emptyTemplateWarning
                                                           : wm.emptyMessageWarning)),
                                       this.expandVars))
      }
    },

    randomElement: function (array) {
      return array[Math.floor (Math.random() * array.length)]
    },
    
    randomizeEmptyMessageWarning: function() {
      this.emptyMessageWarning = '_' + this.randomElement (this.emptyMessageWarnings) + '_'
    },

    newRhsText: function() {
      var text = this.expandGrammar (this.newRhsTextGrammar, '#root')
      return text.charAt(0).toUpperCase() + text.substr(1)
    },
    
    expandGrammar: function (grammar, text) {
      var wm = this
      var re = /#(\w+)/, changed
      do {
        changed = false
        text = text.replace (re, function (match, symbol) {
          var rhs = grammar[symbol.toLowerCase()]
          if (rhs) {
            changed = true
            var expansion = wm.randomElement(rhs)
            if (symbol.match (/^[A-Z]/))
              expansion = expansion.replace(/[a-z]/,function(m){return m.toUpperCase()})
            return expansion
          }
          console.log ("Undefined symbol: " + match)
          return match
        })
      } while (changed)
      return text
    },
    
    appendToMessageBody: function (appendedRhs) {
      Array.prototype.push.apply (wm.composition.body.rhs, appendedRhs)
      Array.prototype.push.apply (wm.animationExpansion.rhs, appendedRhs)
      this.randomizeEmptyMessageWarning()
      this.startAnimatingExpansion()
    },

    templateIsEmpty: function() {
      return !wm.composition.template.content
        || !wm.composition.template.content.filter (function (rhsSym) {
          return typeof(rhsSym) === 'object' || rhsSym.match(/\S/)
        }).length
    },

    // initial page
    showInitialPage: function() {
      return this.showStatusPage()
    },
    
    // inbox/outbox/drafts
    showMailboxPage: function (config) {
      var wm = this
      config = config || {}
      
      return this.setPage ('mailbox')
        .then (function() {
          wm.showNavBar ('mailbox')

          wm.subnavButton = {}
          function makeSubNavIcon (tab, callback) {
            return wm.makeSubNavIcon (tab, function() {
              wm.subnavButton[wm.mailboxTab].addClass('inactive')
              wm.subnavButton[wm.mailboxTab = tab].removeClass('inactive')
              callback()
            }).addClass('inactive')
          }
          wm.container
            .append (wm.mailboxDiv = $('<div class="mailbox">'),
                     $('<div class="subnavbar">').append
                     (wm.subnavButton.inbox = makeSubNavIcon ('inbox', function() {
                       wm.showInbox()
                      }),
                      wm.subnavButton.drafts = makeSubNavIcon ('drafts', function() {
                        wm.showDrafts()
                      }),
                      wm.subnavButton.outbox = makeSubNavIcon ('outbox', function() {
                        wm.showOutbox()
                      })))

          wm.restoreScrolling (wm.mailboxDiv)
          wm.mailboxTab = config.tab || wm.lastMailboxTab || 'inbox'
          wm.subnavButton[wm.mailboxTab].removeClass('inactive')
          return wm.refreshMailbox (wm.mailboxTab)
        })
    },

    refreshMailbox: function (tab) {
      switch (tab) {
      case 'outbox': return wm.showOutbox(); break;
      case 'drafts': return wm.showDrafts(); break;
      case 'inbox': default: return wm.showInbox(); break;
      }
    },

    showInbox: function() {
      var wm = this
      var inbox = wm.mailboxCache.inbox
      var inboxPromise = (inbox
                          ? $.Deferred().resolve(inbox)
                          : wm.REST_getPlayerInbox (wm.playerID))
      return inboxPromise.then (function (inbox) {
        wm.mailboxCache.inbox = inbox
        return inbox
      }).then (function (result) {
        wm.populateMailboxDiv ($.extend ({ messages: result.messages },
                                         wm.inboxProps()))
        return result
      })
    },
    
    showOutbox: function() {
      var wm = this
      var outbox = wm.mailboxCache.outbox
      var outboxPromise = (outbox
                           ? $.Deferred().resolve(outbox)
                           : wm.REST_getPlayerOutbox (wm.playerID))
      outboxPromise.then (function (outbox) {
        wm.mailboxCache.outbox = outbox
        return outbox
      }).then (function (result) {
        
        wm.populateMailboxDiv ({ tab: 'outbox',
                                 title: 'Sent messages',
                                 messages: result.messages,
                                 getMethod: 'REST_getPlayerMessageSent',
                                 deleteMethod: 'REST_deletePlayerMessage',
                                 verb: 'Sent',
                                 preposition: 'To',
                                 object: 'recipient',
                                 showMessage: wm.showMessage.bind(wm)
                               })
        return result
      })
    },

    showDrafts: function() {
      var wm = this
      delete wm.mailboxCache.drafts  // TODO: synchronize wm.mailboxCache.drafts with server
      delete wm.messageCache.drafts  // TODO: synchronize wm.mailboxCache.drafts with server
      var drafts = wm.mailboxCache.drafts
      var draftsPromise = (drafts
                           ? $.Deferred().resolve(drafts)
                           : wm.REST_getPlayerDrafts (wm.playerID))
      draftsPromise.then (function (drafts) {
        wm.mailboxCache.drafts = drafts
        return drafts
      }).then (function (result) {
        
        wm.populateMailboxDiv ({ tab: 'drafts',
                                 title: 'Drafts',
                                 messages: result.drafts,
                                 getMethod: 'REST_getPlayerDraft',
                                 deleteMethod: 'REST_deletePlayerDraft',
                                 verb: 'Edited',
                                 preposition: 'To',
                                 object: 'recipient',
                                 showMessage: function (props) {
                                   var draft = props.result.draft
                                   wm.showComposePage ({ recipient: draft.recipient,
                                                         title: draft.title,
                                                         previousMessage: draft.previous,
                                                         previousTemplate: draft.previousTemplate,
                                                         template: draft.template,
                                                         body: draft.body,
                                                         draft: draft.id })
                                 }
                               })
        return result
      })
    },

    inboxProps: function() {
      var wm = this
      
      return { tab: 'inbox',
               title: 'Received messages',
               getMethod: 'REST_getPlayerMessage',
               deleteMethod: 'REST_deletePlayerMessage',
               verb: 'Received',
               preposition: 'From',
               object: 'sender',
               showMessage: function (props) {
                 wm.showMessage (props)
                   .then (function() {
                     var message = props.result.message
                     if (!message.rating && message.sender.id !== wm.playerID) {
                       var stars = new Array(wm.maxRating).fill(1).map (function() {
                         return $('<span class="rating">')
                       })
                       wm.clearTimer ('ratingTimer')
                       function fillStars (rating) {
                         stars.forEach (function (span, n) {
                           span
                             .off('click')
                             .html (wm.makeIconButton (n < rating ? 'filledStar' : 'emptyStar',
                                                       function() {
                                                         fillStars (n + 1)
                                                         wm.setTimer ('ratingTimer',
                                                                      wm.ratingDelay,
                                                                      function() {
                                                                        wm.REST_putPlayerMessageRating (wm.playerID, message.id, n + 1)
                                                                          .then (function() { wm.rateMessageDiv.hide() })
                                                                      })
                                                       }, wm.starColor))
                         })
                       }
                       fillStars(0)

                       wm.rateMessageDiv
                         .html ($('<div>')
                                .append ($('<span class="ratinglabel">').text("Rate this message:"),
                                         stars))
                         .show()
                     }

                     wm.dummyReplyButton.hide()
                     wm.replyButton
                       .on('click', function (evt) {
                         evt.stopPropagation()
                         var replyTitle = message.title
                         if (!replyTitle.match(/^re:/i))
                           replyTitle = 'Re: ' + replyTitle
                         wm.showComposePage
                         ({ recipient: message.sender,
                            title: replyTitle,
                            previousMessage: message.id,
                            previousTemplate: message.template,
                            focus: 'messageTitleInput'
                          }).then (function() {
                            wm.generateMessageBody()
                          })
                       }).show()
                   })
               }}
    },

    updateInbox: function (messageID) {
      var wm = this
      this.updateMessageCount()
      if (wm.mailboxCache.inbox)
        this.REST_getPlayerMessageHeader (this.playerID, messageID)
        .then (function (result) {
          if (!wm.messageHeaderCache[result.message.id]) {
            wm.messageHeaderCache[result.message.id] = result.message
            wm.mailboxCache.inbox.messages.push (result.message)
            if (wm.page === 'inbox')
              wm.mailboxContentsDiv.append (wm.makeMailboxEntryDiv (wm.inboxProps(), result.message))
          }
        })
    },

    populateMailboxDiv: function (props) {
      var wm = this
      wm.lastMailboxTab = props.tab
      wm.messageHeaderCache = {}
      wm.mailboxDiv
        .empty()
        .append ($('<span class="mailboxname">').text (props.title),
                 wm.mailboxContentsDiv = $('<span class="contents">')
                 .append (props.messages.map (wm.makeMailboxEntryDiv.bind (wm, props))))
    },

    makeMailboxEntryDiv: function (props, message) {
      var wm = this
      wm.messageHeaderCache[message.id] = message
      var deleteMessage = function (evt) {
        evt.stopPropagation()
        if (window.confirm ('Delete this message?'))
          wm[props.deleteMethod] (wm.playerID, message.id)
          .then (wm.reloadCurrentTab.bind(wm))
      }
      var div = $('<div class="message">')
          .append ($('<div class="title">').text (message.title || 'Untitled'),
                   $('<span class="buttons">')
                   .append (wm.makeIconButton ('destroy', deleteMessage)),
                   $('<div class="player">').html (message[props.object] ? message[props.object].displayName : $('<span class="placeholder">').text('No recipient')))
          .on ('click', function() {
            wm.messageCache[props.tab] = wm.messageCache[props.tab] || {}
            var cachedMessage = wm.messageCache[props.tab][message.id]
            var messagePromise = (cachedMessage
                                  ? $.Deferred().resolve(cachedMessage)
                                  : (wm[props.getMethod] (wm.playerID, message.id)
                                     .then (function (result) {
                                       wm.messageCache[props.tab][message.id] = result
                                       return result
                                     })))
            messagePromise.then (function (result) {
              if (message.unread) {
                div.removeClass('unread').addClass('read')
                delete message.unread
                --wm.messageCount
                wm.updateMessageCountDiv()
              }
              props.showMessage ($.extend
                                 ({ result: result,
                                    destroy: deleteMessage },
                                  props))
            })
          })
      div.addClass (message.unread ? 'unread' : 'read')
      return div
    },

    showMessage: function (props) {
      var wm = this
      var message = props.result.message
      return wm.pushView ('read')
        .then (function() {
          wm.container
            .append (wm.readMessageDiv = $('<div class="readmessage">'),
                     wm.rateMessageDiv = $('<div class="ratemessage">').hide(),
                     wm.popBack()
                     .append (wm.dummyReplyButton = wm.makeSubNavIcon('dummy'),
                              wm.replyButton = wm.makeSubNavIcon('reply').hide(),
                              wm.forwardButton = wm.makeSubNavIcon ('forward', function (evt) {
                                evt.stopPropagation()
                                wm.REST_getPlayerTemplate (wm.playerID, message.template.id)
                                  .then (function (templateResult) {
                                    return wm.showComposePage
                                    ({ title: message.title,
                                       template: templateResult.template,
                                       body: message.body,
                                       previousMessage: message.id,
                                       focus: 'playerSearchInput' })
                                  })
                              }),
                              wm.destroyButton = wm.makeSubNavIcon('destroy',props.destroy)))

          var other = message[props.object]
          wm.readMessageDiv
            .empty()
            .append ($('<div class="messageheader">')
                     .append ($('<div class="row">')
                              .append ($('<span class="label">').text (props.preposition),
                                       $('<span class="field">').html (wm.makePlayerSpan (other.name,
                                                                                          other.displayName,
                                                                                          function (evt) {
                                                                                            wm.showOtherStatusPage (other)
                                                                                          }))),
                              $('<div class="row">')
                              .append ($('<span class="label">').text ('Subject'),
                                       $('<span class="field">').text (message.title)),
                              $('<div class="row">')
                              .append ($('<span class="label">').text (props.verb),
                                       $('<span class="field">').text (new Date (message.date).toString()))),
                     $('<div class="messagebody messageborder">').html (wm.renderMarkdown (wm.makeExpansionText (message.body),
                                                                                           function (html) {
                                                                                             return wm.expandVars (html, { me: '@' + wm.playerLogin,
                                                                                                                           you: '@' + other.name })
                                                                                           })))
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

    // status
    showStatusPage: function() {
      var wm = this
      return wm.REST_getPlayerStatus (wm.playerID)
        .then (function (status) {
          return wm.setPage ('status')
            .then (function() {
              wm.showNavBar ('status')
              wm.showGameStatusPage (status)
              wm.detailBarDiv
                .prepend (wm.makePageTitle ('Welcome to Wiki Messenger'),
                          $('<div class="follow">').html (wm.makePlayerSpan (wm.playerLogin)))
              return wm.REST_getPlayerSuggestTemplates (wm.playerID)
                .then (function (result) {
                  if (result && result.templates.length)
                    wm.detailBarDiv.append ($('<div class="filler">'),
                                            $('<div class="popular">')
                                            .append ($('<h1>').text("Popular templates"),
                                                     $('<div class="templates">')
                                                     .append (result.templates.map (function (template) {
                                                       return $('<div class="template">')
                                                         .on ('click', function() {
                                                           wm.REST_getPlayerTemplate (wm.playerID, template.id)
                                                             .then (function (templateResult) {
                                                               wm.showComposePage ({ title: template.title,
                                                                                     template: templateResult.template,
                                                                                     focus: 'playerSearchInput' }) }) })
                                                         .append ($('<span class="title">')
                                                                  .text (template.title),
                                                                  $('<span class="by">').text(' by '),
                                                                  wm.makePlayerSpan (template.author.name,
                                                                                     null,
                                                                                     wm.callWithSoundEffect (wm.showOtherStatusPage.bind (wm, template.author)))) }))))
                })
            })
        })
    },

    showOtherStatusPage: function (follow) {
      var wm = this
      if (follow.id === this.playerID)
        return this.showStatusPage()
      return wm.REST_getPlayerThread (wm.playerID, follow.id)
        .then (function (status) {
          return wm.pushView ('otherStatus')
            .then (function() {
              wm.showGameStatusPage (status)
              wm.otherStatusID = follow.id
              wm.makeFollowDiv ({ follow: follow, hideFullName: true })
              if (status.following)
                follow.makeUnfollowButton()
              wm.detailBarDiv.prepend (follow.followDiv)
              wm.container.append (wm.popBack())
            })
        })
    },

    popBack: function (callback) {
      var wm = this
      callback = callback || wm.popView.bind(wm)
      var button
      return (wm.popBackDiv = $('<div class="subnavbar backbar">'))
	.append ($('<span>')
		 .html (button = wm.makeSubNavIcon ('back', function() { callback(button) })))
    },

    redrawPopBack: function (callback) {
      var wm = this
      wm.popBackDiv.remove()
      wm.container.append (wm.popBack())
    },

    makeStars: function (rating) {
      var wm = this
      rating = rating || 0   // in case rating is NaN
      return new Array(this.maxRating).fill(1).map (function (_dummy, n) {
        return $('<span class="star">').html (wm.makeIconButton (rating >= n+1
                                                                 ? 'filledStar'
                                                                 : (rating >= n+.5
                                                                    ? 'halfStar'
                                                                    : 'emptyStar'),
                                                                 null, wm.starColor))
      })
    },

    showGameStatusPage: function (status) {
      var wm = this

      wm.container
        .append (wm.detailBarDiv = $('<div class="detailbar">'))
      wm.restoreScrolling (wm.detailBarDiv)
      
      wm.detailBarDiv.append
      ($('<div class="ratings">')
       .append ($('<div class="ratinginfo">')
                .append ($('<span class="ratinginfolabel">').text ("Messages:"),
                         wm.makeStars (status.sumSenderRatings / status.nSenderRatings),
                         $('<span class="ratinginfocount">').text (" (" + wm.plural (status.nSenderRatings, "rating") + ")")),
                $('<div class="ratinginfo">')
                .append ($('<span class="ratinginfolabel">').text ("Phrases:"),
                         wm.makeStars (status.sumAuthorRatings / status.sumAuthorRatingWeights),
                         $('<span class="ratinginfocount">').text (" (" + wm.plural (status.nAuthorRatings, "rating") + ")"))))

      wm.detailBarDiv.append
      ($('<div class="biofact">')
       .append ($('<span class="biofactlabel">').text('Name: '),
                $('<span class="biofactvalue">').text(status.displayName)))

      var pronouns = { male: 'he/him/his', female: 'she/her/hers', neither: 'they/theirs' }
      if (status.gender !== 'secret')
        wm.detailBarDiv.append
      ($('<div class="biofact">')
       .append ($('<span class="biofactlabel">').text('Pronouns: '),
                $('<span class="biofactvalue">').text(pronouns[status.gender])))

      if (status.publicBio && status.publicBio.length)
        wm.detailBarDiv.append
      ($('<div class="biofact">')
       .append ($('<div class="biotitle">').text('Public info'),
                $('<div class="bio">').text(status.publicBio)))

      if (status.privateBio && status.privateBio.length)
        wm.detailBarDiv.append
      ($('<div class="biofact">')
       .append ($('<div class="biotitle">').text('"Private" info'),
                $('<div class="bio">').text(status.privateBio)))
    },

    // edit
    finishLastSave: function() {
      var lastSavePromise
      if (this.lastSavePromise)
        lastSavePromise = this.lastSavePromise
      else
        lastSavePromise = $.Deferred().resolve()
      return lastSavePromise
    },
    
    saveCurrentEdit: function() {
      var wm = this
      return this.finishLastSave()
        .then (function() {
          var def
          if (wm.saveEditableElement) {
            def = wm.saveEditableElement()
            delete wm.saveEditableElement
          } else
            def = $.Deferred().resolve()
          wm.lastSavePromise = def
          return def
        })
    },

    saveOnPageExit: function (config) {
      var wm = this
      config = config || {}
      var unfocusCallback = typeof(config.unfocus) !== 'undefined' ? config.unfocus : wm.saveCurrentEdit.bind(wm)
      var autosaveCallback = typeof(config.autosave) !== 'undefined' ? config.autosave : unfocusCallback
      var pageExitCallback = typeof(config.pageExit) !== 'undefined' ? config.pageExit : autosaveCallback
      wm.pageExit = function() {
        wm.clearTimer ('autosaveTimer')
	wm.container.off ('click')
        return pageExitCallback()
      }
      function setAutosaveTimer() {
        if (autosaveCallback)
          wm.setTimer ('autosaveTimer',
                       wm.autosaveDelay,
                       function() {
                         autosaveCallback()
                         setAutosaveTimer()
                       })
      }
      setAutosaveTimer()
      wm.container.on ('click', unfocusCallback)
    },

    makeIconButton: function (iconName, callback, color) {
      var button = $('<span>').addClass('button').text(iconName)
      this.getIconPromise (this.iconFilename[iconName])
        .done (function (svg) {
          svg = wm.colorizeIcon (svg, color || wm.themeInfo.iconColor)
          button.html ($(svg))
        })
      if (callback)
        button.on ('click', callback)
      return button
    },

    makeSubNavIcon: function (iconName, callback) {
      return this.makeIconButton (iconName, callback, this.themeInfo.subnavbarIconColor)
    },
    
    makeEditableElement: function (props) {
      var span = $('<'+props.element+'>').addClass(props.className)
      this.populateEditableElement (span, props)
      return span
    },

    populateEditableElement: function (div, props) {
      var wm = this
      var sanitize = props.sanitize || function(x) { return x }
      var parse = props.parse || sanitize
      var renderText = props.renderText || function(x) { return x }
      var renderHtml = props.renderHtml || renderText
      var editCallback = function (evt) {
        evt.stopPropagation()
        div.off ('click')
        wm.saveCurrentEdit()
          .then (function() {
            if (props.locateSpan)
              div = props.locateSpan()
            var oldText = renderText (props.content())
            var divRows = Math.max (Math.round (div.height() / parseFloat(div.css('line-height'))),
                                    oldText.split('\n').length)
            var input = $('<textarea autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" class="editable">').val(oldText)
            if (props.guessHeight)
              input.attr('rows',divRows)
            var changeCallback = props.changeCallback || function (input) { input.val (sanitize (input.val())) }
            function boundChangeCallback() { changeCallback (input) }
            input
              .on('keyup',boundChangeCallback)
              .on('change',boundChangeCallback)
              .on('click',function(evt){evt.stopPropagation()})
              .on ('keydown', function (evt) {
                if (props.keycodeFilter && !props.keycodeFilter (evt.keyCode))
                  evt.preventDefault()
              })

            // reacting to focusout/focusin is problematic for debugging and touchy(heh) on mobile devices, so commented out...
            /*
            input.on ('focusout', function() {
              wm.setTimer ('unfocusTimer', wm.unfocusDelay, wm.saveEditableElement.bind(wm))
            })
            input.on ('focusin', function() {
              wm.clearTimer ('unfocusTimer')
            })
*/

            if (props.maxLength)
              input.attr ('maxlength', props.maxLength)
            wm.saveEditableElement = function() {
              var def
              delete wm.saveEditableElement
              var newText = input.val()
              if (props.alwaysUpdate || newText !== oldText) {
                var newContent = parse (newText)
                def = props.updateCallback (newContent)
              } else
                def = $.Deferred().resolve()
              return def
                .then (function() {
                  wm.populateEditableElement (div, props)
                  if (props.hideCallback)
                    props.hideCallback()
                })
            }
            div.html (input)
            input.focus()
            if (props.showCallback)
              props.showCallback (input)
            boundChangeCallback()
          })
      }
      
      var buttonsDiv = $('<span class="buttons">')
      var contentHtmlDiv = renderHtml (props.content()).addClass ('content')
      div.empty().append (contentHtmlDiv, buttonsDiv)
      
      if (props.otherButtonDivs)
        buttonsDiv.append.apply (buttonsDiv, props.otherButtonDivs())

      if (props.beforeContentDiv)
        contentHtmlDiv.before (props.beforeContentDiv())

      if (!props.isConstant) {
        div.off ('click')
          .on ('click', function (evt) {
          if (props.firstClickCallback && props.firstClickCallback (evt))
            div.off('click').on ('click', editCallback)
          else
            editCallback (evt)
        })
        if (props.destroyCallback)
          buttonsDiv.append (wm.makeIconButton (props.destroyIcon || 'destroy', function (evt) {
            evt.stopPropagation()
            wm.saveCurrentEdit()
              .then (function() {
                
                if (props.confirmDestroy())
                  wm.lastSavePromise = props.destroyCallback()
              })
          }))
      }
    },

    // https://stackoverflow.com/a/499158
    setSelectionRange: function (input, selectionStart, selectionEnd) {
      if (input.setSelectionRange) {
        input.focus()
        input.setSelectionRange (selectionStart, selectionEnd)
      } else if (input.createTextRange) {
        var range = input.createTextRange()
        range.collapse(true)
        range.moveEnd('character', selectionEnd)
        range.moveStart('character', selectionStart)
        range.select()
      }
    },

    setCaretToPos: function (input, pos) {
      this.setSelectionRange(input, pos, pos)
    },
    
    saveSymbol: function (symbol) {
      var wm = this
      return wm.finishLastSave()
        .then (function() {
          wm.lastSavePromise = wm.REST_putPlayerSymbol (wm.playerID, symbol.id, wm.symbolName[symbol.id], symbol.rules)
            .then (function (result) {
              $.extend (wm.symbolName, result.name)
              return result.symbol
            })
          return wm.lastSavePromise
        })
    },

    renameSymbol: function (symbol, newName) {
      var wm = this
      return wm.finishLastSave()
        .then (function() {
          wm.lastSavePromise = wm.REST_putPlayerSymbol (wm.playerID, symbol.id, newName, symbol.rules)
            .then (function (result) {
              wm.updateSymbolCache (result)
            }).fail (function (err) {
              var reload = wm.reloadCurrentTab.bind(wm)
	      if (err.status == 400)
                wm.showModalMessage ("You can't rename #" + wm.symbolName[symbol.id] + " to #" + newName + ", because #" + newName + " already exists", reload)
              else
                wm.showModalWebError (err, reload)
            })
        })
    },

    updateSymbolCache: function (result) {
      var wm = this
      var symbol = result.symbol
      var oldName = this.symbolName[symbol.id]
      $.extend (this.symbolName, result.name)
      if (oldName) {
        if (oldName !== symbol.name) {
          wm.symbolName[symbol.id] = symbol.name
          wm.ruleDiv[symbol.id].remove()
          wm.placeGrammarRuleDiv (symbol)
          wm.referringSymbols(symbol).forEach (function (lhsSymbol) {
            lhsSymbol.rules = lhsSymbol.rules.map (function (rule) {
              return rule.map (function (rhsSym) {
                if (typeof(rhsSym) === 'object' && rhsSym.id === symbol.id)
                  rhsSym.name = symbol.name
                return rhsSym
              })
            })
            if (lhsSymbol.id !== symbol.id)
              wm.populateGrammarRuleDiv (wm.ruleDiv[lhsSymbol.id], lhsSymbol)
          })
        } else if (this.symbolCache[symbol.id]) {
          $.extend (this.symbolCache[symbol.id], symbol)
          if (this.ruleDiv[symbol.id])
            this.populateGrammarRuleDiv (this.ruleDiv[symbol.id], this.symbolCache[symbol.id])
        }
      }
    },

    parseRhs: function (rhs, ignoreText) {
      var wm = this
      var regex = /(([\s\S]*?)#(\w+)|([\s\S]*?)#\((\w+)\+(\w+)\)|[\s\S]+)/g, match
      var parsed = []
      var name2id = this.symbolNameToID()
      while ((match = regex.exec(rhs)))
        (function() {
          var text = match[1], symbol
          if (match[6] && match[6].length) {
            var pre = match[5], post = match[6]
            if (pre.match(/^(a|an|A|AN)$/)) {
              symbol = { name: post, a: pre }
              text = match[4]
            } else if (post.match(/^(s|S)$/)) {
              symbol = { name: pre, plural: post }
              text = match[4]
            }
          } else if (match[3] && match[3].length) {
            text = match[2]
            symbol = { name: match[3] }
          }
          if (text && !ignoreText)
            parsed.push (text)
          if (symbol) {
            if (symbol.name.match(/^[0-9_]*[A-Z][A-Z0-9_]*$/))
              symbol.upper = true
            else if (symbol.name.match(/^[0-9_]*[A-Z]\w*$/))
              symbol.cap = true
            symbol.name = symbol.name.toLowerCase()
            var id = name2id[symbol.name]
            if (id)
              symbol.id = id
            parsed.push (symbol)
          }
        }) ()
      return parsed
    },

    symbolOwnedByPlayer: function (symbol) {
      return symbol.owner && symbol.owner.id === this.playerID
    },

    symbolEditableByPlayer: function (symbol) {
      return (this.symbolOwnedByPlayer(symbol)
              || ((symbol.owner === null
                   || typeof(symbol.owner.id) === 'undefined'
                   || symbol.owner.id === null)
                  && !(symbol.owner && symbol.owner.admin)))
    },

    makeGrammarRhsDiv: function (symbol, ruleDiv, n) {
      var wm = this
      var editable = wm.symbolEditableByPlayer (symbol)
      var span = wm.makeEditableElement ({ element: 'span',
                                           className: 'rhs',
                                           content: function() { return symbol.rules[n] },
                                           guessHeight: true,
                                           isConstant: !editable,
                                           confirmDestroy: function() {
                                             var rhsText = wm.makeRhsText(symbol.rules[n])
                                             // no need to confirm if this expansion is empty
                                             var confirmed = !symbol.rules[n].length
                                             // no need to confirm if this is a duplicate of an adjacent expansion
                                             confirmed = confirmed || 
                                               ((n > 0 && rhsText === wm.makeRhsText(symbol.rules[n-1]))
                                                || (n+1 < symbol.rules.length && rhsText === wm.makeRhsText(symbol.rules[n+1])))
                                             confirmed = confirmed ||
                                               window.confirm('Delete ' + (symbol.rules.length === 1
                                                                           ? 'the only definition'
                                                                           : ('definition '+(n+1)))
                                                              + ' for #' + wm.symbolName[symbol.id] + '?')
                                             return confirmed
                                           },
                                           destroyIcon: 'minus',
                                           destroyCallback: function() {
                                             symbol.rules.splice(n,1)
                                             wm.populateGrammarRuleDiv (ruleDiv, symbol)
                                             return wm.saveSymbol (symbol)
                                           },
                                           updateCallback: function (newRhs) {
                                             symbol.rules[n] = newRhs
                                             return wm.saveSymbol (symbol)
                                               .then (function (newSymbol) {
                                                 return newSymbol.rules[n]
                                               })
                                           },
                                           locateSpan: function() {
                                             return wm.ruleDiv[symbol.id].find('.rhs').eq(n)
                                           },
                                           otherButtonDivs: function() {
                                             return editable ? [wm.makeIconButton ('plus', function(evt) {
                                               evt.stopPropagation()
                                               wm.saveCurrentEdit()
                                                 .then (function() {
                                                   var newRhs = symbol.rules[n]
                                                   symbol.rules.splice (n, 0, newRhs)
                                                   wm.populateGrammarRuleDiv (ruleDiv, symbol)
                                                   wm.selectGrammarRule (symbol)
                                                   wm.saveSymbol (symbol)  // should probably give focus to new RHS instead, here
                                                 })
                                             })] : []
                                           },
                                           parse: wm.parseRhs.bind(wm),
                                           renderText: wm.makeRhsText.bind(wm),
                                           renderHtml: wm.makeRhsSpan.bind(wm)
                                         })
      return span
    },

    populateGrammarRuleDiv: function (ruleDiv, symbol) {
      var wm = this
      var lhs = wm.symbolName[symbol.id]
      var editable = wm.symbolEditableByPlayer (symbol)
      var owned = wm.symbolOwnedByPlayer (symbol)

      function randomize (evt) {
        evt.stopPropagation()
        wm.saveCurrentEdit()
          .then (function() {
            wm.REST_getPlayerExpand (wm.playerID, symbol.id)
              .then (function (result) {
                wm.showingHelp = false
		wm.infoPaneTitle.html (wm.makeSymbolSpan (symbol,
                                                          function (evt) {
                                                            evt.stopPropagation()
                                                            wm.loadGrammarSymbol (symbol)
                                                          }))
		wm.showMessageBody ({ div: wm.infoPaneContent,
                                      expansion: result.expansion,
                                      inEditor: true,
                                      animate: true })
                wm.infoPaneLeftControls
                  .empty()
                  .append ($('<span class="hint">').text('Re-roll'),
                           wm.makeIconButton ('randomize'))
                  .off('click')
                  .on('click',randomize)
                wm.infoPaneRightControls
                  .empty()
                  .append ($('<span class="hint">').text('Add to draft'),
                           wm.makeIconButton ('forward'))
                  .off('click')
                  .on('click', function (evt) {
                    evt.stopPropagation()
                    wm.saveCurrentEdit()
                      .then (function() {
                        if (wm.composition && wm.composition.template && wm.composition.template.content) {
                          wm.composition.template.content.push ({ id: symbol.id })
                          wm.composition.body.rhs = wm.composition.body.rhs.concat (result.expansion.rhs)
                          wm.showComposePage()
                        } else
                          wm.showComposePage
                        ({ template: { content: [ symbol ] },
                           title: wm.symbolName[symbol.id].replace(/_/g,' '),
                           body: { rhs: [ result.expansion ] },
                           focus: 'playerSearchInput' })
                      })
                  })
		wm.infoPane.show()
              })
          })
      }

      function copySymbol (evt) {
        evt.stopPropagation()
        wm.saveCurrentEdit()
          .then (function() {
            if (window.confirm ('Make a copy of #' + wm.symbolName[symbol.id] + '? You will be able to edit the copy.'))
              wm.createNewSymbol ({ symbol: { name: wm.symbolName[symbol.id],
                                              rules: symbol.rules } })
          })
      }

      function unlockSymbol (evt) {
        evt.stopPropagation()
        wm.saveCurrentEdit()
          .then (function() {
            if (window.confirm('Give up your lock on #' + wm.symbolName[symbol.id] + '? Anyone will be able to edit (and lock) the phrase.'))
              wm.lastSavePromise = wm.REST_deletePlayerSymbol (wm.playerID, symbol.id)
          })
      }

      function hideSymbol (evt) {
        evt.stopPropagation()
        wm.saveCurrentEdit()
          .then (function() {
            wm.removeGrammarRule (symbol)
          })
      }

      function menuSelector (name, func) {
        return $('<div class="option">')
          .text (name)
          .on ('click', function (evt) {
            menuDiv.hide()
            wm.modalExitDiv.hide()
            func (evt)
          })
      }
      
      var menuDiv = $('<div class="rulemenu">').hide()
      ruleDiv.empty()
        .append (this.makeEditableElement
                 ({ element: 'div',
                    className: 'lhs',
                    content: function() { return wm.symbolName[symbol.id] },
                    guessHeight: true,
                    renderText: function(lhs) { return '#' + lhs },
                    renderHtml: function(lhs) { return $('<div class="name">').text('#'+lhs) },
                    sanitize: wm.sanitizeHashSymbolName,
                    parse: function(hashLhs) { return hashLhs.substr(1) },
                    keycodeFilter: function (keycode) {
                      return (keycode >= 65 && keycode <= 90)   // a...z
                        || (keycode >= 48 && keycode <= 57)  // 0...9
                        || (keycode === 189)   // -
                        || (keycode === 32)  // space
                        || (keycode === 37 || keycode === 39)  // left, right arrow
                        || (keycode === 8)  // backspace/delete
                    },
                    isConstant: !editable,
                    updateCallback: function (newLhs) {
                      return wm.renameSymbol (symbol, newLhs)
                    },
                    beforeContentDiv: function() {
                      return $('<div class="menubutton">').append (wm.makeIconButton ('menu', function (evt) {
                        evt.stopPropagation()
                        menuDiv.empty()
                          .append (menuSelector ('Show sample text', randomize),
                                   symbol.summary ? null : menuSelector ('Duplicate this phrase', copySymbol),
                                   owned ? menuSelector ('Unlock this phrase', unlockSymbol) : menuSelector ('Hide this phrase', hideSymbol))
                          .show()
                        wm.modalExitDiv.show()
                        wm.infoPane.hide()
                        wm.showingHelp = false
                      }), menuDiv)
                    },
                    otherButtonDivs: function() {
                      var divs = []
                      if (symbol.owner && !symbol.owner.admin) {
                        var ownerSpan = $('<span class="owner">')
                        if (symbol.owner.id)
                          ownerSpan.html (wm.makePlayerSpan (symbol.owner.name,
                                                             null,
                                                             wm.callWithSoundEffect (wm.showOtherStatusPage.bind (wm, symbol.owner))))
                        else
                          ownerSpan.text ('no owner')
                        divs.push (ownerSpan)
                      }
                      return divs
                    },
                  }),
                 (symbol.summary
                  ? $('<div class="summary">').html (wm.renderMarkdown (symbol.summary))
                  : (((symbol.rules.length || !editable)
                      ? []
                      : [$('<span class="rhs">')
                         .append ($('<span class="placeholder">').text (wm.noRhsWarning),
                                  $('<span class="buttons">')
                                  .html (wm.makeIconButton
                                         ('plus', function (evt) {
                                           evt.stopPropagation()
                                           wm.saveCurrentEdit()
                                             .then (function() {
                                               symbol.rules = [[wm.newRhsText()]]
                                               wm.saveSymbol(symbol)
                                                 .then (function() {
                                                   wm.populateGrammarRuleDiv (ruleDiv, symbol)
                                                   wm.selectGrammarRule (symbol)
                                                   // should probably give focus to new RHS here
                                                 })
                                             })
                                         })))])
                     .concat (symbol.rules.map (function (rhs, n) {
                       return wm.makeGrammarRhsDiv (symbol, ruleDiv, n)
                     })))))
    },

    makeRhsText: function (rhs) {
      var wm = this
      return rhs.map (function (rhsSym) {
        return (typeof(rhsSym) === 'object'
                ? ('#' + wm.makeSymbolName(rhsSym))
                : rhsSym)
      }).join('')
    },
    
    makeRhsSpan: function (rhs) {
      var wm = this
      return $('<span>')
        .append (rhs.map (function (rhsSym) {
          return (typeof(rhsSym) === 'object'
                  ? wm.makeSymbolSpan (rhsSym,
                                       function (evt) {
                                         evt.stopPropagation()
                                         wm.loadGrammarSymbol (rhsSym)
                                       })
                  : $('<span>').html (wm.renderMarkdown (rhsSym)))
        }))
    },

    makeTemplateSpan: function (content) {
      var wm = this
      if (!content || !content.filter (function (rhsSym) { return typeof(rhsSym) === 'object' || rhsSym.match(/\S/) }).length)
        return $('<p>').html ($('<span class="placeholder">').text (wm.emptyContentWarning))
      return $('<span>')
        .append (content.map (function (rhsSym) {
          return (typeof(rhsSym) === 'object'
                  ? wm.makeSymbolSpan (rhsSym,
                                       function (evt) {
                                         wm.saveCurrentEdit()
                                           .then (function() {
                                             wm.showGrammarEditPage()
                                               .then (function() {
                                                 wm.loadGrammarSymbol (rhsSym)
                                               })
                                           })
                                       })
                  : $('<span>').html (wm.renderMarkdown (rhsSym)))
        }))
    },

    makePlayerSpan: function (name, displayName, callback) {
      var nameSpan = $('<span class="name">')
      var span = $('<span class="player">').addClass(callback ? 'playerlink' : 'playertag').append ('@', nameSpan)
      nameSpan.text (name)
      if (callback)
        span.on ('click', function (evt) {
          evt.stopPropagation()
          callback (evt)
        })
      if (displayName)
        span = $('<span class="playerwrap">').append (span, $('<span class="displayname">').text ('('+displayName+')'))
      return span
    },

    makeSymbolName: function (sym) {
      var name
      if (sym.name)
        name = sym.name
      else if (typeof(sym.id) !== 'undefined')
        name = wm.symbolName[sym.id]
      if (sym.upper)
        name = name.toUpperCase()
      else if (sym.cap)
        name = name.replace (/([a-z])/, function (c) { return c.toUpperCase() })
      if (sym.a)
        name = '(' + sym.a + '+' + name + ')'
      else if (sym.plural)
        name = '(' + name + '+' + sym.plural + ')'
      return name
    },

    makeSymbolSpan: function (sym, callback) {
      var span = $('<span class="lhslink">').append ('#', $('<span class="name">').text (this.makeSymbolName(sym) + ' '))
      if (callback)
        span.on ('click', callback)
      return span
    },

    sanitizeHashSymbolName: function (text) {
      return '#' + text.replace(/\s/g,'_').replace(/\W/g,'')
    },

    sanitizeSymbolName: function (text) {
      return text.replace(/\s/g,'_').replace(/\W/g,'')
    },

    sanitizePlayerName: function (text) {
      return text.replace(/\s/g,'_').replace(/\W/g,'')
    },

    sanitizer: function (elementName, sanitizeMethod, prefix) {
      var boundSanitizeMethod = sanitizeMethod.bind(wm)
      return function() {
        var element = wm[elementName]
        var newVal = element.val()
        var saneVal = boundSanitizeMethod(newVal)
        if (saneVal !== newVal)
          element.val (saneVal)
      }
    },
    
    loadGrammarSymbol: function (symbol) {
      var wm = this
      wm.saveCurrentEdit()
        .then (function() {
          wm.symbolCache = wm.symbolCache || {}
          if (symbol.id) {
            if (wm.symbolCache[symbol.id])
              wm.scrollGrammarTo (wm.symbolCache[symbol.id])
            else
              wm.socket_getPlayerSymbol (wm.playerID, symbol.id)
                .then (wm.symbolLoaded.bind (wm))
          } else
              wm.socket_getPlayerSymname (wm.playerID, symbol.name)
            .then (wm.symbolLoaded.bind (wm))
        })
    },

    symbolLoaded: function (result) {
      var wm = this
      if (wm.symbolCache[result.symbol.id])
        wm.removeGrammarRule (result.symbol)
      $.extend (wm.symbolName, result.name)
      wm.symbolCache[result.symbol.id] = result.symbol
      wm.placeGrammarRuleDiv (result.symbol)
      wm.scrollGrammarTo (result.symbol)
    },
    
    removeGrammarRule: function (symbol) {
      this.ruleDiv[symbol.id].remove()
      delete this.ruleDiv[symbol.id]
      delete this.symbolCache[symbol.id]
    },

    makeGrammarRuleDiv: function (symbol) {
      if (Object.keys(this.ruleDiv).length === 0 && this.emptyGrammarSpan)
        this.emptyGrammarSpan.remove()  // remove the placerholder message

      var ruleDiv = $('<div class="rule">')
      this.populateGrammarRuleDiv (ruleDiv, symbol)
      this.ruleDiv[symbol.id] = ruleDiv
      return ruleDiv
    },

    placeGrammarRuleDiv: function (symbol) {
      var ruleDiv = this.makeGrammarRuleDiv (symbol)
      var syms = this.cachedSymbols()
      var name = wm.symbolName[symbol.id]
      var nextSym = syms.find (function (s) { return wm.symbolName[s.id] > name })
      if (typeof(nextSym) === 'undefined')
        this.grammarBarDiv.append (ruleDiv)
      else
        ruleDiv.insertBefore (this.ruleDiv[nextSym.id])
      this.scrollGrammarTo (symbol)
    },

    scrollGrammarTo: function (symbol) {
      var ruleDiv = this.ruleDiv[symbol.id]
      this.grammarBarDiv.animate ({
        // Scroll parent to the new element. This arcane formula can probably be simplified
        scrollTop: this.grammarBarDiv.scrollTop() + ruleDiv.position().top - this.grammarBarDiv.position().top
      })
      this.selectGrammarRule (symbol)
    },

    selectGrammarRule: function (symbol) {
      var wm = this
      $('.selected').removeClass('selected')
      wm.ruleDiv[symbol.id].addClass('selected')
    },
    
    cachedSymbols: function() {
      var wm = this
      return Object.keys(this.symbolCache).map (function (id) {
        return wm.symbolCache[id]
      }).sort (function (a, b) { return wm.symbolName[a.id] < wm.symbolName[b.id] ? -1 : +1 })
    },

    symbolNameToID: function() {
      var wm = this
      var name2id = {}
      Object.keys(this.symbolName).forEach (function (id) {
        name2id[wm.symbolName[id]] = parseInt (id)
      })
      return name2id
    },

    getSymbol: function (symbolName) {
      var wm = this
      return this.symbolCache[Object.keys(this.symbolName).find (function (id) { return wm.symbolName[id] === symbolName })]
    },
    
    lhsRefersTo: function (lhsSymbol, rhsSymbol) {
      return lhsSymbol.rules.find (function (rhs) {
        return rhs.find (function (rhsSym) {
          return typeof(rhsSym) === 'object' && rhsSym.id === rhsSymbol.id
        })
      })
    },

    referringSymbols: function (rhsSymbol) {
      var wm = this
      return this.cachedSymbols().filter (function (lhsSymbol) {
        return wm.lhsRefersTo (lhsSymbol, rhsSymbol)
      })
    },

    showGrammarEditPage: function() {
      var wm = this
      return this.setPage ('grammar')
        .then (function() {
          wm.showNavBar ('grammar')

          var def
          if (wm.symbolCache)
            def = $.Deferred().resolve()
          else
            def = wm.socket_getPlayerSymbols (wm.playerID)
              .then (function (result) {
                wm.symbolCache = {}
                result.symbols.forEach (function (symbol) {
                  wm.symbolCache[symbol.id] = symbol
                })
                $.extend (wm.symbolName, result.name)
              })

          def.then (function() {
            
            wm.saveOnPageExit ({ autosave: null,
                                 pageExit: wm.saveCurrentEdit.bind(wm) })

            wm.grammarBarDiv = $('<div class="grammarbar">')

            wm.infoPane = $('<div class="grammarinfopane">')
            wm.infoPaneContent = $('<div class="content">')
            wm.infoPaneTitle = $('<div class="title">')
            wm.infoPane.append ($('<span class="closebutton">').html
                                (wm.makeIconButton ('close', function() {
                                  wm.infoPane.hide()
                                  wm.showingHelp = false
                                })),
                                wm.infoPaneTitle,
		                wm.infoPaneContent,
                                wm.infoPaneLeftControls = $('<span class="leftcontrols">'),
		                wm.infoPaneRightControls = $('<span class="rightcontrols">'))

            wm.showingHelp = false

            var sanitizer = wm.sanitizer ('searchInput', wm.sanitizeSymbolName)
            wm.searchInput = $('<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">')
              .on ('keyup', sanitizer)
              .on ('change', sanitizer)
            wm.symbolSearchResultsDiv = $('<div class="results">')
            
            var searchButton = $('<span>')

            wm.container
	      .append ($('<div class="search">')
                       .append ($('<div class="query">')
                                .append (searchButton, wm.searchInput)),
                       wm.symbolSearchDiv = $('<div class="symbolsearch">')
                       .append ($('<div class="searchtitle">')
                                .append ($('<span>').text("Search results"),
                                         $('<span class="closebutton">').html
                                         (wm.makeIconButton ('close',
                                                             wm.clearSymbolSearch.bind(wm)))),
                                wm.symbolSearchResultsDiv)
                       .hide(),
                       wm.grammarBarDiv.append ($('<div class="grammartitle">').text ('Phrase book')),
                       wm.infoPane.hide(),
                       $('<div class="subnavbar">').append
                       ($('<span class="newlhs">').html
                        (wm.makeSubNavIcon ('document', function() { wm.createNewSymbol ({ symbol: { rules: [[wm.newRhsText()]] } }) })),
                        $('<span class="help">').html
                        (wm.makeSubNavIcon ('help', function() {
                          if (wm.showingHelp) {
                            wm.infoPane.hide()
                            wm.showingHelp = false
                          } else
		            wm.REST_getHelpHtml().then (function (helpHtml) {
		              wm.saveCurrentEdit()
                                .then (function() {
                                  wm.showingHelp = true
		                  wm.infoPaneTitle.text ('Help')
		                  wm.infoPaneContent.html (helpHtml)
                                  var icons = wm.infoPaneContent.find('.helpicon')
                                  icons.each (function (n) {
                                    var iconSpan = icons.slice(n,n+1), iconName = iconSpan.attr('icon')
                                    wm.getIconPromise(wm.iconFilename[iconName])
                                      .done (function (svg) {
                                        svg = wm.colorizeIcon (svg, wm.themeInfo.iconColor)
                                        iconSpan.append ($(svg))
                                      })
                                  })
                                  wm.infoPaneRightControls.empty()
                                  wm.infoPaneLeftControls.empty()
		                  wm.infoPane.show()
                                })
		            })
                        }))))

            wm.searchInput.attr ('placeholder', 'Search phrases')
            wm.placeIcon (wm.iconFilename.search, searchButton)
            searchButton.addClass('button')
              .on ('click', wm.doSymbolSearch.bind(wm))
            wm.searchInput.on ('keyup', function(event) {
              wm.doSymbolSearch()
            })
            wm.showSymbolSearchResults()

            wm.restoreScrolling (wm.symbolSearchResultsDiv)
            wm.restoreScrolling (wm.grammarBarDiv)
            wm.restoreScrolling (wm.infoPaneContent)

            wm.ruleDiv = {}
            wm.grammarBarDiv
              .append (wm.cachedSymbols().map (wm.makeGrammarRuleDiv.bind (wm)))
            if (Object.keys(wm.ruleDiv).length === 0)
              wm.grammarBarDiv.append (wm.emptyGrammarSpan = $('<span class="emptygrammar">').text ('Search existing phrases, or add a new one.'))

            wm.container.append (wm.modalExitDiv = $('<div class="modalexit">')
                                 .on ('click', function() {
                                   $('.rulemenu').hide()
                                   wm.modalExitDiv.hide()
                                 }).hide())
          })
        })
    },

    clearSymbolSearch: function() {
      this.searchInput.val('')
      this.doSymbolSearch()
    },
    
    doSymbolSearch: function() {
      var wm = this
      var searchText = this.searchInput.val()
      if (searchText !== this.lastSymbolSearch) {
        this.lastSymbolSearch = searchText
        delete this.symbolSearchResults
        this.REST_postPlayerSearchSymbolsAll (this.playerID, searchText)
          .then (function (ret) {
            wm.symbolSearchResults = ret
            wm.showSymbolSearchResults()
          })
      }
    },

    continueSymbolSearch: function() {
      var wm = this
      if (this.searchInput.val() === this.lastSymbolSearch) {
        this.REST_postPlayerSearchSymbolsAll (this.playerID, this.lastSymbolSearch, this.symbolSearchResults.page + 1)
          .then (function (ret) {
            wm.symbolSearchResults.symbols = wm.symbolSearchResults.symbols.concat (ret.symbols)
            wm.symbolSearchResults.more = ret.more
            wm.symbolSearchResults.page = ret.page
            wm.showSymbolSearchResults()
          })
      } else
        this.doSymbolSearch()
    },

    showSymbolSearchResults: function() {
      this.searchInput.val (this.lastSymbolSearch || '')
      this.symbolSearchResults = this.symbolSearchResults || { results: [] }
      this.symbolSearchResultsDiv.empty()
      this.symbolSearchDiv.hide()
      if (this.lastSymbolSearch && this.lastSymbolSearch.length) {
        this.symbolSearchDiv.show()
        this.symbolSearchResultsDiv
          .append (this.makeSymbolDivs (this.symbolSearchResults.symbols,
                                        "There are no phrases matching '" + this.lastSymbolSearch + "'."),
                   this.endSearchResultsDiv = $('<div class="endresults">'))
        var more = $('<span>')
        this.endSearchResultsDiv.append(more)
        if (this.symbolSearchResults.more)
          more.addClass('more').text('More')
          .on ('click', function (evt) {
            evt.preventDefault()
            more.remove()
            wm.continueSymbolSearch()
          })
        else if (this.symbolSearchResults.symbols.length)
          more.text('All matching phrases shown')
      }
    },

    makeSymbolDivs: function (symbols, emptyMessage) {
      var wm = this
      return symbols.length
        ? symbols.map (function (symbol) {
          return $('<div class="symbol">')
            .append (wm.makeSymbolSpan (symbol,
                                        function (evt) {
                                          evt.stopPropagation()
                                          wm.loadGrammarSymbol (symbol)
                                        }))
        })
      : $('<span>').text (emptyMessage)
    },

    createNewSymbol: function (symbolInfo) {
      var wm = this
      wm.saveCurrentEdit()
        .then (function() {
          return wm.socket_postPlayerSymbolNew (wm.playerID, symbolInfo)
        }).then (function (result) {
          result.symbol.owner.name = wm.playerLogin
          wm.symbolCache[result.symbol.id] = result.symbol
          $.extend (wm.symbolName, result.name)
          wm.placeGrammarRuleDiv (result.symbol)
        })
    },
    
    // follows
    showFollowsPage: function() {
      var wm = this
      
      return this.setPage ('follows')
        .then (function() {
          wm.showNavBar ('follows')

          wm.searchInput = $('<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">')
          wm.playerSearchResultsDiv = $('<div class="results">')
          wm.endSearchResultsDiv = $('<div class="endresults">')
          var searchButton = $('<span>')
          wm.container
            .append (wm.whoBarDiv = $('<div class="whobar">')
                     .append ($('<div class="search">')
                              .append ($('<div class="query">')
                                       .append (searchButton, wm.searchInput),
                                       wm.playerSearchDiv = $('<div class="followsection">')
                                       .append (wm.playerSearchResultsDiv,
                                                wm.endSearchResultsDiv))))
          wm.searchInput.attr ('placeholder', 'Search players')
          wm.placeIcon (wm.iconFilename.search, searchButton)
          searchButton.addClass('button')
            .on ('click', wm.doPlayerSearch.bind(wm))
          wm.searchInput.on ('keyup', function(event) {
              wm.doPlayerSearch()
          })
          
          wm.restoreScrolling (wm.whoBarDiv)

          wm.followsById = {}
          wm.whoBarDiv.append (wm.addressBookDiv = $('<div>'))

          wm.showPlayerSearchResults()
          wm.updateAddressBook()
        })
    },

    updateAddressBook: function() {
      var wm = this
      wm.REST_getPlayerFollow (wm.playerID)
	.done (function (data) {
          wm.addressBookDiv
            .empty()
            .append ($('<div class="followsection">')
                     .append ($('<div class="title">').text("Address book"))
                     .append (wm.makeFollowDivs (data.followed, "Your address book is empty.")))
          var following = {}
          data.followed.map (function (follow) {
            following[follow.id] = true
          })
	}).fail (wm.reloadOnFail())
    },
    
    makeFollowDiv: function (info) {
      var follow = info.follow
      var callback = info.callback
      var followClass = 'followcontrol-' + follow.id, followSelector = '.' + followClass
      var buttonDiv = $('<span class="followcontrol">').addClass(followClass)
      var composeDiv =  $('<span class="followcontrol">')
          .html (wm.makeIconButton ('compose',
                                    function (evt) {
                                      evt.stopPropagation()
                                      wm.showComposePage ({ recipient: follow,
                                                            click: 'messageBodyDiv' })
                                    }))
      var doFollow, doUnfollow
      function makeUnfollowButton() {
        $(followSelector).add(buttonDiv)
          .off()
          .html (wm.makeIconButton ('unfollow',
                                    wm.callWithSoundEffect (doUnfollow, null, $(followSelector).add(buttonDiv))))
	  .removeClass('already-clicked')
      }
      function makeFollowButton() {
        $(followSelector).add(buttonDiv)
          .off()
          .html (wm.makeIconButton ('follow',
                                    wm.callWithSoundEffect (doFollow, null, $(followSelector).add(buttonDiv))))
	  .removeClass('already-clicked')
      }
      doFollow = function() {
        wm.REST_getPlayerFollowOther (wm.playerID, follow.id)
          .then (function() {
	    follow.setFollowing(true)
	    follow.makeUnfollowButton()
            wm.updateAddressBook()
	  })
      }
      doUnfollow = function() {
        wm.REST_getPlayerUnfollowOther (wm.playerID, follow.id)
          .then (function() {
	    follow.setFollowing(false)
	    follow.makeFollowButton()
            wm.updateAddressBook()
	  })
      }
      if (follow.following)
        makeUnfollowButton()
      else
        makeFollowButton()
      var nameDiv = wm.makePlayerSpan (follow.name, info.hideFullName ? null : follow.displayName, callback)
      var followDiv = $('<div class="follow">')
          .append (nameDiv)
      if (follow.reachable)
        followDiv.append (composeDiv)
      if (follow.id !== this.playerID)
        followDiv.append (buttonDiv)
      if (callback)
        followDiv.on ('click', callback)
      $.extend (follow, { followDiv: followDiv,
                          nameDiv: nameDiv,
                          buttonDiv: buttonDiv,
                          setFollowing: function(flag) { follow.following = flag },
                          makeFollowButton: makeFollowButton,
                          makeUnfollowButton: makeUnfollowButton })
    },

    makeFollowDivs: function (followList, emptyMessage) {
      var wm = this
      return followList.length
        ? followList.map (function (follow) {
          wm.followsById[follow.id] = wm.followsById[follow.id] || []
          wm.followsById[follow.id].push (follow)
          wm.makeFollowDiv ({ follow: follow,
                              callback: wm.callWithSoundEffect (wm.showOtherStatusPage.bind (wm, follow)) })
          follow.setFollowing = function (flag) {
            wm.followsById[follow.id].forEach (function (f) { f.following = flag })
          }
          return follow.followDiv
        })
      : $('<span>').text (emptyMessage)
    },

    clearPlayerSearch: function() {
      this.searchInput.val('')
      this.doPlayerSearch()
    },

    doPlayerSearch: function() {
      var wm = this
      var searchText = this.searchInput.val()
      if (searchText !== this.lastPlayerSearch) {
        this.lastPlayerSearch = searchText
        delete this.playerSearchResults
        this.REST_postPlayerSearchPlayersAll (this.playerID, searchText.replace('@',''))
          .then (function (ret) {
            wm.playerSearchResults = ret
            wm.showPlayerSearchResults()
          })
      }
    },

    continuePlayerSearch: function() {
      var wm = this
      if (this.searchInput.val() === this.lastPlayerSearch) {
        this.REST_postPlayerSearchPlayersAll (this.playerID, this.lastPlayerSearch, this.playerSearchResults.page + 1)
          .then (function (ret) {
            wm.playerSearchResults.players = wm.playerSearchResults.players.concat (ret.players)
            wm.playerSearchResults.more = ret.more
            wm.playerSearchResults.page = ret.page
            wm.showPlayerSearchResults()
          })
      } else
        this.doPlayerSearch()
    },

    showPlayerSearchResults: function() {
      this.searchInput.val (this.lastPlayerSearch || '')
      this.playerSearchResults = this.playerSearchResults || { results: [] }
      this.playerSearchResultsDiv.empty()
      this.endSearchResultsDiv.empty()
      this.playerSearchDiv.hide()
      if (this.lastPlayerSearch && this.lastPlayerSearch.length) {
        this.playerSearchDiv.show()
        this.playerSearchResultsDiv
          .append ($('<div class="searchtitle">')
                   .append ($('<span>').text("Search results"),
                            $('<span class="closebutton">').html
                            (wm.makeIconButton ('close', wm.clearPlayerSearch.bind(wm)))),
                   this.makeFollowDivs (this.playerSearchResults.players, "There are no players matching '" + this.lastPlayerSearch + "'."))
        var more = $('<span>')
        this.endSearchResultsDiv.append(more)
        if (this.playerSearchResults.more)
          more.addClass('more').text('More')
          .on ('click', function (evt) {
            evt.preventDefault()
            more.remove()
            wm.continuePlayerSearch()
          })
        else if (this.playerSearchResults.players.length)
          more.text('All matching players shown')
      }
    },
    
    // socket message handlers
    handlePlayerMessage: function (msg) {
      var wm = this
      if (this.verbose.messages)
        console.log (msg)
      switch (msg.data.message) {
      case 'incoming':
        // incoming message
        this.updateInbox (msg.data.id)
        break
      default:
        if (this.verbose.messages) {
          console.log ("Unknown message")
          console.log (msg)
        }
        break
      }
    },

    handleSymbolMessage: function (msg) {
      if (this.verbose.messages)
        console.log (msg)
      switch (msg.data.message) {
      case "update":
        // Symbol updated
        this.updateSymbolCache (msg.data)
        break
      default:
        if (this.verbose.messages) {
          console.log ("Unknown message")
          console.log (msg)
        }
        break
      }
    },

    // audio
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

    loadSound: function (type) {
      this.soundCache = this.soundCache || {}
      this.soundCache[type] = new Howl ({ src: ['/audio/' + type + '.wav'] })
      return this.soundCache[type]
    },
    
  })

  // end of module
  return proto
}) ()
