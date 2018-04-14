var WikiMess = (function() {
  var proto = function (config) {
    var wm = this
    
    config = config || {}
    $.extend (this, config)

    this.ParseTree = window.parseTree

    this.container = $('<div class="wikimess">')
    this.pageContainer = $('#'+this.containerID)
      .addClass("wikimess-page")
      .html (this.container)

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
    this.tabs.forEach (function (tab) {
      wm.getIconPromise (tab.icon)
      wm.iconFilename[tab.name + '-tab'] = tab.icon
    })

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
    if (wm.reloadOnDisconnect)
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
        .then (this.showInitialPage.bind (this, config))
    } else if (config.action && config.action !== 'login')
      this.continueAsGuest (config)
    else
      this.showLoginPage()
  }

  // config, defaults
  var symChar = parseTree.symChar, symCharHtml = parseTree.symCharHtml
  var playerChar = parseTree.playerChar
  var varChar = parseTree.varChar, funcChar = parseTree.funcChar, assignChar = parseTree.assignChar
  var leftBraceChar = parseTree.leftBraceChar, rightBraceChar = parseTree.rightBraceChar
  var leftSquareBraceChar = parseTree.leftSquareBraceChar, rightSquareBraceChar = parseTree.rightSquareBraceChar
  $.extend (proto.prototype, {
    // default constants
    containerID: 'wikimess',
    localStorageKey: 'wikimess',
    iconPrefix: '/images/icons/',
    iconSuffix: '.svg',
    blankImageUrl: '/images/1x1blank.png',
    facebookButtonImageUrl: '/images/facebook.png',
    twitterButtonImageUrl: '/images/twitter.png',
    twitterIntentPath: 'https://twitter.com/intent/tweet',
    twitterUsername: 'wikimessage',
    facebookIntentPath: 'https://www.facebook.com/sharer/sharer.php',
    anonGuest: 'Anonymous guest',
    maxPlayerLoginLength: 16,
    maxPlayerNameLength: 32,
    maxRating: 5,
    ratingDelay: 2000,
    autosaveDelay: 5000,
    expansionAnimationDelay: 400,
    maxExpansionAnimationTime: 5000,
    symbolSearchResultsPerPage: 10,
    autosuggestDelay: 500,
    unfocusDelay: 1000,
    menuPopupDelay: 500,
    starColor: 'darkgoldenrod',
    scrollButtonDelta: 2/3,  // proportion of visible page to scroll when scroll buttons pressed
    cardScrollTime: 2000,
    iconFilename: { edit: 'quill',
                    backspace: 'backspace',
                    'new': 'copy',
                    create: 'circle-plus',
                    'copy to clipboard': 'clipboard-copy',
                    'delete': 'trash-can',
                    plus: 'circle-plus',
                    minus: 'circle-minus',
                    up: 'up-arrow-button',
                    down: 'down-arrow-button',
                    help: 'help',
                    locked: 'padlock',
                    hide: 'hide',
                    're-roll': 'rolling-die',
                    close: 'close',
                    send: 'send',
                    share: 'share',
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
                    menu: 'menu',
                    minimize: 'minimize',
                    maximize: 'maximize' },
    
    themes: [ {style: 'plain', text: 'Plain', iconColor: 'black', navbarIconColor: 'white', subnavbarIconColor: 'black' },
              {style: 'l33t', text: 'L33t', iconColor: 'green', navbarIconColor: 'green', subnavbarIconColor: 'darkgreen' } ],

    tabs: [{ name: 'compose', method: 'showComposePage', label: 'composer', icon: 'quill-ink' },
           { name: 'status', method: 'showStatusPage', label: 'news', icon: 'raven', },
           { name: 'mailbox', method: 'showMailboxPage', label: 'mail', icon: 'envelope' },
           { name: 'follows', method: 'showFollowsPage', label: 'people', icon: 'backup' },
           { name: 'grammar', method: 'showGrammarEditPage', label: 'thesaurus', icon: 'spell-book' },
           { name: 'settings', method: 'showSettingsPage', label: 'settings', icon: 'pokecog' }],
    
    verbose: { page: false,
               request: true,
               response: true,
               messages: true,
               timer: false,
               errors: true,
	       stack: false },

    noRhsWarning: 'No definitions',
    newRhsTextGrammar: {root: ['#content goes here.',
                               "Here's where you add #content.",
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
                           
    exampleSymbolNames: ['alabaster', 'breach', 'cat', 'delicious', 'evanescent', 'fracas', 'ghost_story', 'hobgoblin', 'iridescent', 'jocular', 'keen', 'language', 'menace', 'numberless', 'osculate', 'pagan', 'quack', 'rhubarb', 'sausage', 'trumpet', 'unacceptable', 'vacillation', 'wacky', 'xenophobia', 'yellow', 'zeal'],
    exampleSymbolDelay: 200,
    
    emptyContentWarning: "Enter text here, or pick from the suggestions below. Add '" + symChar + "' before a word to insert a random synonym for that word, e.g. '" + symChar + "cat' or '" + symChar + "osculate'.",
    emptyTemplateWarning: "_The message will appear here._",
    reloadOnDisconnect: false,
    suppressDisconnectWarning: true,

    preloadSounds: ['error','select','login','logout','gamestart'],

    // REST API
    REST_loginFacebook: function() {
      window.location.replace ('/login/facebook')
    },

    REST_loginTwitter: function() {
      window.location.replace ('/login/twitter')
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

    REST_postPlayerSearchSymbolsAll: function (playerID, query, nPerPage, page) {
      return this.logPost ('/p/search/symbols/all', { query: query, n: nPerPage, page: page })
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

    REST_getPlayerPublic: function (playerID) {
      return this.logGet ('/p/public')
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

    REST_getPlayerMessagePublic: function (playerID, messageID) {
      return this.logGet ('/p/message/' + messageID + '/public')
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

    REST_getPlayerSymbolRevisions: function (playerID, symbolID) {
      return this.logGet ('/p/symbol/' + symbolID + '/revisions')
    },

    REST_getPlayerSymbolRevisionsPage: function (playerID, symbolID, page) {
      return this.logGet ('/p/symbol/' + symbolID + '/revisions/' + page)
    },

    REST_getPlayerSymbolDiff: function (playerID, symbolID, revisionID) {
      return this.logGet ('/p/symbol/' + symbolID + '/diff/' + revisionID)
    },

    REST_getPlayerTemplate: function (playerID, templateID) {
      return this.logGet ('/p/template/' + templateID)
    },

    REST_getPlayerSymbolLinks: function (playerID, symbolID) {
      return this.logGet ('/p/symbol/' + symbolID + '/links')
    },
    
    REST_getPlayerExpand: function (playerID, symbolID) {
      return this.logGet ('/p/expand/' + symbolID)
    },

    REST_postPlayerExpand: function (playerID, symbolQueries) {
      return this.logPost ('/p/expand', { symbols: symbolQueries })
    },

    REST_getWelcomeHtml: function() {
      return this.logGet ('/html/welcome-guest.html')
    },

    REST_getComposeHelpHtml: function() {
      return this.logGet ('/html/message-compose-help.html')
    },

    REST_getGrammarHelpHtml: function() {
      return this.logGet ('/html/grammar-editor-help.html')
    },

    REST_getPlayerSuggestTemplates: function (playerID) {
      return this.logGet ('/p/suggest/templates')
    },

    REST_getPlayerSuggestReply: function (playerID, templateID, tags) {
      return this.logGet ('/p/suggest/reply/' + templateID + (tags ? ('?tags=' + encodeURIComponent(tags)) : ''))
    },

    REST_postPlayerSuggestSymbol: function (playerID, beforeSymbols, afterSymbols, temperature) {
      return this.logPost ('/p/suggest/symbol', { before: beforeSymbols,
                                                  after: afterSymbols,
                                                  temperature: temperature })
    },
    
    REST_makeSymbolUrl: function (symname) {
      return window.location.origin + '/define/' + symname
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
      var before
      if (wm.verbose.request) {
        console.log ('GET ' + url + ' request')
	before = new Date()
      }
      return $.get (url)
        .then (function (result) {
          if (wm.verbose.response) {
	    var after = new Date()
            console.log ('GET ' + url + ' response (' + (after-before) + ' ms)')
	    console.log (result) // for some reason, if url contains substrings like '%20i' (which happens when query params with spaces next to 'i' characters are passed through) then console.log will try to evaluate this as a number or something, UNLESS we split this into two console.log calls. Thanks, JavaScript!
	  }
          return result
        })
    },

    logPost: function (url, data) {
      var wm = this
      var before
      if (wm.verbose.request) {
        console.log ('POST ' + url + ' request', data)
	before = new Date()
      }
      return $.ajax ({ url: url,
                       method: 'POST',
                       contentType: 'application/json',
                       data: JSON.stringify(data) })
        .then (function (result) {
          if (wm.verbose.response) {
	    var after = new Date()
            console.log ('POST ' + url + ' response (' + (after-before) + ' ms)', result)
	  }
          return result
        })
    },

    logPut: function (url, data) {
      var wm = this
      var before
      if (wm.verbose.request) {
        console.log ('PUT ' + url + ' request', data)
	before = new Date()
      }
      return $.ajax ({ url: url,
                       method: 'PUT',
                       contentType: 'application/json',
                       data: JSON.stringify(data) })
        .then (function (result) {
          if (wm.verbose.response) {
	    var after = new Date()
            console.log ('PUT ' + url + ' response (' + (after-before) + ' ms)', result)
	  }
          return result
        })
    },

    logDelete: function (url) {
      var wm = this
      var before
      if (wm.verbose.request) {
        console.log ('DELETE ' + url + ' request')
	before = new Date()
      }
      return $.ajax ({ url: url,
                       method: 'DELETE' })
        .then (function (result) {
          if (wm.verbose.response) {
	    var after = new Date()
            console.log ('DELETE ' + url + ' response (' + (after-before) + ' ms)', result)
	  }
          return result
        })
    },
    
    // helpers to convert socket callbacks to promises
    socketGetPromise: function (url) {
      var wm = this
      var def = $.Deferred()
      var before
      if (wm.verbose.request) {
        console.log ('socket GET ' + url + ' request')
	before = new Date()
      }
      io.socket.get (url, function (resData, jwres) {
        if (jwres.statusCode == 200) {
          if (wm.verbose.response) {
	    var after = new Date()
            console.log ('socket GET ' + url + ' response (' + (after-before) + ' ms)', resData)
	  }
          def.resolve (resData)
        } else
          def.reject (jwres)
      })
      return def
    },

    socketPostPromise: function (url, data) {
      var wm = this
      var def = $.Deferred()
      var before
      if (wm.verbose.request) {
        console.log ('socket POST ' + url + ' request', data)
	before = new Date()
      }
      io.socket.post (url, data, function (resData, jwres) {
        if (wm.verbose.response) {
	  var after = new Date()
          console.log ('socket POST ' + url + ' response (' + (after-before) + ' ms', resData)
	}
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
    
    openLink: function (url) {
      var newWin = window.open (url)

      if (!newWin || newWin.closed || typeof newWin.closed=='undefined')
        window.location.assign (url)
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

    makeImageLink: function (src, callback, sfx, allowMultipleClicks) {
      var img = $('<img>').attr('src', src)
      return this.makeLink (img, callback, sfx, allowMultipleClicks)
    },

    makeListLink: function (html, callback, sfx, allowMultipleClicks) {
      var span = $('<span class="listitem">').html (html)
      return this.makeLink (span, callback, sfx, allowMultipleClicks)
    },

    makeLink: function (element, callback, sfx, allowMultipleClicks) {
      var wm = this
      element.on ('click', this.callWithSoundEffect (callback, sfx, !allowMultipleClicks && element))
      return element
    },

    setPage: function (page) {
      var wm = this
      if (this.verbose.page)
	console.log ("Changing view from " + this.page + " to " + page)

      if (wm.modalExitDiv) {
        wm.modalExitDiv.remove()
        delete wm.modalExitDiv
      }
      
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
                                       $('<span class="listitem noborder">')
                                       .append (wm.makeImageLink (wm.facebookButtonImageUrl, wm.REST_loginFacebook),
                                                wm.makeImageLink (wm.twitterButtonImageUrl, wm.REST_loginTwitter)),
                                       wm.makeListLink ('Play as Guest', wm.continueAsGuest))))
          if (wm.playerLogin)
            wm.nameInput.val (wm.playerLogin)
        })
    },

    stripLeadingAndTrailingWhitespace: function (text) {
      return text.replace(/^\s*/,'').replace(/\s*$/,'')
    },
    
    validatePlayerName: function (success, failure) {
      this.playerLogin = this.nameInput.val()
      this.playerPassword = this.passwordInput.val()
      this.playerLogin = this.stripLeadingAndTrailingWhitespace (this.playerLogin)
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
      return this.doLogin (this.showInitialPage)  // replace showInitialPage with signup flow
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
              return wm.socket_getPlayerSubscribe (wm.playerID)
                .then (function() {
                  showNextPage.call(wm)
                }).fail (function (err) {
                  console.error('subscribe failed', err)
                  showNextPage.call(wm)
                })
	    }
          })
          .fail (function (err) {
	    wm.showModalWebError (err, fail)
          })
      }, fail)
    },

    continueAsGuest: function (config) {
      this.initPlayerInfo ({ id: null,
                             name: '',
                             displayName: '' })
      this.showInitialPage (config)
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
        .append ($('<div class="navlabelspace">'),
                 this.navbar = $('<div class="navbar">'))

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
	
      this.tabs.forEach (function (tab) {
        var span = $('<span>').addClass('navtab').addClass('nav-'+tab.name)
	var isMailbox = (tab.name === 'mailbox')
	var isFollows = (tab.name === 'follows')
        if ((isMailbox || isFollows) && wm.playerID === null)
          return
        wm.getIconPromise(tab.icon)
          .done (function (svg) {
            svg = wm.colorizeIcon (svg, wm.themeInfo.navbarIconColor)
            span.append ($('<div>').addClass('navlabel').text(tab.label || tab.name),
                         $(svg).addClass('navicon'))
	    if (isMailbox)
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
      if (this.playerID)
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
      delete this.lastMailboxTab
      if (this.playerID)
        this.socket_getPlayerUnsubscribe (this.playerID)
	  .then (function() {
	    return wm.REST_postLogout().then (function() {
	      wm.continueAsGuest()
            })
	  }).fail (function (err) {
            console.error('unsubscribe failed', err)
	    return wm.REST_postLogout().then (function() {
	      wm.continueAsGuest()
            })
          })
      else
        this.showLoginPage()
    },
    
    // settings menu
    showSettingsPage: function() {
      var wm = this

      return this.setPage ('settings')
        .then (function() {
          wm.showNavBar ('settings')
          var menuDiv = $('<div class="list">')
              .append (wm.makeListLink ('Log' + (wm.playerID ? ' out' : 'in / Signup'), wm.doLogout))
          if (wm.playerID)
            menuDiv.append (wm.makeListLink ('Name', wm.showPlayerConfigPage),
                            wm.makeListLink ('Bio', wm.showPlayerBioPage))
          menuDiv.append (wm.makeListLink ('Colors', wm.showThemesPage),
                          wm.makeListLink ('Audio', wm.showAudioPage))
          wm.container
            .append ($('<div class="menubar">').html (menuDiv))
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
          wm.pageContainer.removeClass (oldTheme.style)
	})
        wm.container.addClass (theme.style)
        wm.pageContainer.addClass (theme.style)
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
                     .append ($('<div class="menubutton">')
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
      var elements = this.container.find(':not(.pushed)').filter(':not(.navbar,.navlabelspace)')
          .filter (function() { return $(this).parents('.navbar,.navlabelspace').length === 0})
      if (this.verbose.page)
	console.log ("Pushing " + this.page + " view, going to " + newPage)
      var page = this.page
      this.pushedViews.push ({ elements: elements,
                               page: page,
                               suspend: this.pageSuspend,
                               resume: this.pageResume,
                               exit: this.pageExit,
			       modalExitDiv: this.modalExitDiv })
      if (this.modalExitDiv) {
	this.modalExitDiv.hide()
	delete this.modalExitDiv
      }
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
      this.container.find(':not(.pushed)').filter(':not(.navbar,.navlabelspace)')
        .filter (function() { return $(this).parents('.navbar,.navlabelspace').length === 0})
        .remove()
      poppedView.elements.find('*').addBack().removeClass('pushed').removeClass('already-clicked')
      return this.setPage (poppedView.page)
        .then (function() {
          wm.pageSuspend = poppedView.pageSuspend
          wm.pageResume = poppedView.pageResume
          wm.pageExit = poppedView.pageExit
	  wm.modalExitDiv = poppedView.modalExitDiv
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
                  if (wm.playerID) {
                    var draft = { recipient: wm.composition.recipient && wm.composition.recipient.id,
                                  previous: wm.composition.previousMessage,
                                  previousTemplate: wm.composition.previousTemplate,
                                  tags: wm.composition.tags,
                                  previousTags: wm.composition.previousTags,
                                  template: wm.composition.template,
                                  title: wm.composition.title,
                                  body: wm.composition.body }
                    if (wm.composition.draft)
                      wm.promiseSave (wm.REST_putPlayerDraft (wm.playerID, wm.composition.draft, draft))
                    else
                      wm.promiseSave (wm.REST_postPlayerDraft (wm.playerID, draft))
                      .then (function (result) {
                        wm.composition.draft = result.draft.id
                      })
                  }
                })
            } else
              return Promise.resolve()
          }
          wm.saveOnPageExit ({ unfocus: wm.saveCurrentEdit.bind(wm),
                               autosave: saveDraft,
                               pageExit: saveDraft })

          wm.playerSearchInput = $('<textarea autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" class="recipient">')
          wm.playerSearchResultsDiv = $('<div class="results">')
          
          function markForSave() { wm.composition.needsSave = true }

          function makeMessageHeaderInput (className, placeholderText, compositionAttrName, controlName, lowercase) {
            if (typeof(config[compositionAttrName]) !== 'undefined')
              wm.composition[compositionAttrName] = config[compositionAttrName]
	    else if (wm.composition.template && typeof(wm.composition.template[compositionAttrName]) !== 'undefined')
              wm.composition[compositionAttrName] = wm.composition.template[compositionAttrName]
	    if (wm.composition[compositionAttrName])
	      wm.composition[compositionAttrName] = wm.stripLeadingAndTrailingWhitespace (wm.composition[compositionAttrName])
            wm[controlName] = $('<textarea autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">')
              .addClass (className)
              .attr ('placeholder', placeholderText)
              .val (wm.composition[compositionAttrName])
              .on ('keyup', function() {
                var text = wm[controlName].val()
                if (lowercase) {
                  text = text.toLowerCase()
                  wm[controlName].val (text)
                }
                wm.composition[compositionAttrName] = text
              }).on ('change', markForSave)
          }

          wm.composition.previousTemplate = config.previousTemplate || wm.composition.previousTemplate
          if (config.template) {
            wm.composition.template = config.template
            delete wm.composition.randomTemplate
          }
          wm.composition.template = wm.composition.template || {}
          wm.composition.template = config.template || wm.composition.template || {}
          wm.composition.template.content = wm.composition.template.content || []

          makeMessageHeaderInput ('title', 'Untitled', 'title', 'messageTitleInput')
          makeMessageHeaderInput ('prevtags', 'No past tags', 'previousTags', 'messagePrevTagsInput', true)
          makeMessageHeaderInput ('tags', 'No future tags', 'tags', 'messageTagsInput', true)
 
          wm.clearTimer ('autosuggestTimer')
          function autosuggestKey (before, after) {
            return before.map (function (rhsSym) { return rhsSym.name })
              .concat (['.'],
                       after.map (function (rhsSym) { return rhsSym.name }))
              .join (' ')
          }

          // autosuggest for textarea (typing with keyboard)
          wm.textareaAutosuggest = function (input) {
            input.focus()  // in case we were triggered by player hitting 're-roll' button
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
              var endsWithSymbolRegex = new RegExp('\\'+symChar+'([A-Za-z_]\\w*)$'), symbolContinuesRegex = /^\w/;
              var endsWithSymbolMatch = endsWithSymbolRegex.exec(newValBefore)
              if (endsWithSymbolMatch && endsWithSymbolMatch[1].length && !symbolContinuesRegex.exec(newValAfter)) {
                var prefix = endsWithSymbolMatch[1]
                delete wm.autosuggestStatus.lastKey
                wm.autosuggestStatus.temperature = 0
                symbolSuggestionPromise = wm.REST_postPlayerSearchSymbolsOwned (wm.playerID, { name: { startsWith: prefix } })
                getInsertText = function (symbol) {
                  return symbol.name.substr (prefix.length)
                }
              } else {
                // symbol suggestions
                var beforeSymbols = wm.ParseTree.getSymbolNodes (wm.parseRhs (newValBefore)).map (function (sym) { return { id: sym.id, name: sym.name } })
                var afterSymbols = wm.ParseTree.getSymbolNodes (wm.parseRhs (newValAfter)).map (function (sym) { return { id: sym.id, name: sym.name } })
                var key = autosuggestKey (beforeSymbols, afterSymbols)
                if (wm.autosuggestStatus.lastKey !== key) {
                  wm.autosuggestStatus.lastKey = key
                  symbolSuggestionPromise = wm.REST_postPlayerSuggestSymbol (wm.playerID, beforeSymbols, afterSymbols, wm.autosuggestStatus.temperature)
                  getInsertText = function (symbol) { return (endsWithSymbolMatch ? '' : symChar) + symbol.name }
                }
              }
              if (symbolSuggestionPromise) {
                wm.populateSuggestions (symbolSuggestionPromise, function (symbol, wrappedFuncs) {
                  var insertText = getInsertText (symbol)
                  if (wrappedFuncs) {
                    if (wrappedFuncs.length === 1 && wrappedFuncs[0] === 'uc')
                      insertText = insertText.toUpperCase()
                    else if (wrappedFuncs.length === 1 && wrappedFuncs[0] === 'cap')
                      insertText = wm.ParseTree.capitalize (insertText)
                    else
                      wrappedFuncs.forEach (function (func) {
                        insertText = funcChar + func + leftBraceChar + insertText + rightBraceChar
                      })
                  }
                  insertText += ' '
                  // recompute newValBefore & newValAfter, in case caret has changed
                  var newVal = input.val(), caretPos = input[0].selectionStart, caretEnd = input[0].selectionEnd
                  var newValBefore = newVal.substr(0,caretPos), newValAfter = newVal.substr(caretPos)
                  var updatedNewValBefore = newValBefore + insertText
                  input.val (updatedNewValBefore + newValAfter)
                  wm.setCaretToPos (input[0], updatedNewValBefore.length)
                  input.focus()
                  wm.textareaAutosuggest (input)
                })
              }
            }
          }

          // autosuggest for div (point-and-click)
          function wrapNode (node, wrappedFuncs) {
            if (wrappedFuncs)
              wrappedFuncs.forEach (function (func) {
                node = { type: 'func', funcname: func, args: [node] }
              })
            return node
          }
          wm.divAutosuggest = function() {
            var before = wm.ParseTree.getSymbolNodes (wm.composition.template.content)
                .map (function (sym) { return { id: sym.id, name: sym.name } })
            var key = autosuggestKey (before, [])
            if (wm.autosuggestStatus.lastKey !== key) {
              wm.autosuggestStatus.lastKey = key
              wm.populateSuggestions (wm.REST_postPlayerSuggestSymbol (wm.playerID, before, [], wm.autosuggestStatus.temperature),
                                      function (symbol, wrappedFuncs) {
                                        // prepend a space only if we're nonempty & don't already end in a space
                                        var content = wm.composition.template.content, lastTok = content.length && content[content.length-1]
                                        var spacer = (lastTok && !(typeof(lastTok) === 'string' && lastTok.match(/\s$/))) ? [' '] : []
                                        wm.updateComposeContent (content.concat (spacer.concat ([wrapNode ({ type: 'sym',
                                                                                                             id: symbol.id,
                                                                                                             name: symbol.name },
                                                                                                           wrappedFuncs)])))
                                        wm.updateComposeDiv()
                                        var generatePromise =
                                            (wm.animationExpansion
                                             ? wm.REST_getPlayerExpand (wm.playerID, symbol.id)
                                             .then (function (result) {
                                               wm.appendToMessageBody (spacer.concat (wrapNode (result.expansion, wrappedFuncs)))
                                             })
                                             : wm.generateMessageBody())
                                        generatePromise.then (wm.divAutosuggest)
                                      })
                .then (function() {
                  if (wm.composition.template.content.length) {
                    function backspace() {
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
                      wm.updateComposeDiv()
                      if (wm.composition.body) {
                        wm.composition.body.rhs.splice
                        (wm.composition.template.content.length,
                         wm.composition.body.rhs.length - wm.composition.template.content.length)
                        wm.showMessageBody()
                      } else
                        wm.generateMessageBody()
                      wm.divAutosuggest()
                    }
                    wm.suggestionDiv.append (wm.makeIconButton ('backspace', backspace))
                  }
                })
            }
          }
          wm.autosuggestStatus = { temperature: 0, refresh: wm.divAutosuggest }

          // build the editable element for the "Template text", i.e. wm.composition.template
          wm.messageComposeDiv = $('<div class="messagecompose">')
          wm.updateComposeDiv()
          
          // tweet
          function tweetIntent (info) {
            if (info.url) {
              wm.openLink (wm.twitterIntentPath
                           + '?text=' + encodeURIComponent((info.title ? (info.title + ': ') : '') + info.text)
                           + '&url=' + encodeURIComponent(info.url)
                           + '&via=' + wm.twitterUsername)
            }
          }

          // facebook
          function facebookIntent (info) {
            if (info.url) {
              wm.openLink (wm.facebookIntentPath
                           + '?u=' + encodeURIComponent(info.url))
            }
          }

          // copy to clipboard
          function copyToClipboard (info) {
            wm.stopAnimation()
            var range = document.createRange()
            range.selectNode (wm.messageBodyDiv[0])
            window.getSelection().removeAllRanges()
            window.getSelection().addRange (range)
            document.execCommand ("copy")
            window.alert ('Message copied to clipboard')
            wm.sharePane.hide()
          }
          
          // send message with callback to share method (e.g. tweet intent)
          function makeSendFunction (config) {
            config = config || {}
            var shareCallback = config.callback
            var preserveMessage = config.preserve
            var confirm = config.confirm
            return function (evt) {
              if (evt) {
                evt.stopPropagation()
                evt.preventDefault()
              }
              wm.saveCurrentEdit()
                .then (function() {
                  var sent = false
                  if (!confirm || window.confirm ('Send message?')) {
                    var expansionText, expansionTextMatch
                    if (wm.templateIsEmpty())
                      window.alert ("Please enter some input text.")
                    else if (!(wm.composition.body && (expansionTextMatch = (expansionText = wm.ParseTree.makeExpansionText(wm.composition.body)).match(/\S/))))
                      window.alert ("Expanded text is empty. Please vary the input text, or re-roll to generate a new random expanded text.")
                    else if (wm.composition.isPrivate && !wm.composition.recipient)
                      window.alert ("Please select the direct message recipient, or make it public.")
                    else {
                      sent = true
                      wm.shareButton.off ('click')
                      delete wm.composition.previousTemplate
                      wm.REST_postPlayerMessage (wm.playerID, { recipient: wm.composition.isPrivate ? wm.composition.recipient.id : null,
                                                                template: wm.composition.template,
                                                                title: wm.composition.title,
                                                                body: wm.composition.body,
                                                                previous: wm.composition.previousMessage,
                                                                tags: wm.composition.tags,
                                                                previousTags: wm.composition.previousTags,
                                                                draft: wm.composition.draft,
                                                                isPublic: wm.playerID === null || (wm.playerInfo && wm.playerInfo.createsPublicTemplates) })
                        .then (function (result) {
                          if (shareCallback)
                            shareCallback ({ url: (result.message && result.message.path
                                                   ? (window.location.origin + result.message.path)
                                                   : undefined),
                                             title: wm.composition.title,
                                             text: wm.ParseTree.makeExpansionText (wm.composition.body,
                                                                                   false,
                                                                                   wm.compositionVarVal()) })
                        }).then (function() {
                          if (preserveMessage) {
                            wm.sharePane.hide()
                            wm.shareButton.on ('click', toggleSharePane)
                          } else {
                            wm.composition = {}  // delete the composition after sending
                            delete wm.mailboxCache.outbox   // TODO: update wm.mailboxCache.outbox
                            return (wm.playerID
                                    ? wm.showMailboxPage ({ tab: 'outbox' })
                                    .then (function() {
                                      // TODO: update wm.mailboxCache.outbox
                                    })
                                    : wm.showStatusPage())
                          }
                        }).catch (function (err) {
                          wm.showModalWebError (err, wm.reloadCurrentTab.bind(wm))
                        })
                      }
                  }
                  if (!sent) {
                    wm.currentCardDiv.remove()
                    wm.dealCard()
                  }
                })
            }
          }

          function toggleSharePane() {
            wm.showingHelp = false
            wm.infoPane.hide()
	    wm.sharePane.toggle()
          }
          
          function updateSharePane() {
            wm.sharePane
              .empty()
              .append (wm.makeImageLink (wm.facebookButtonImageUrl, makeSendFunction ({ callback: facebookIntent }), undefined, true).addClass('big-button'),
                       wm.makeImageLink (wm.twitterButtonImageUrl, makeSendFunction ({ callback: tweetIntent }), undefined, true).addClass('big-button'),
                       wm.makeIconButton ((wm.playerID && wm.composition && wm.composition.isPrivate) ? 'mailbox-tab' : 'status-tab', wm.sendMessage = makeSendFunction()).addClass('big-button'),
                       wm.makeIconButton ('copy to clipboard', copyToClipboard).addClass('big-button'))
          }
          
          // build the actual compose page UI
          wm.initInfoPane()
          var pubTab, privTab
          var titleRow, tagsRow, prevTagsRow, templateRow, suggestRow, revealButton, hideButton
          wm.makeHeaderToggler = function (container) {
            wm.headerToggler = wm.addToggler ({ elements: [ titleRow, tagsRow, prevTagsRow, templateRow, wm.messageComposeDiv, suggestRow, wm.suggestionDiv ],
                                                container: container,
                                                hidden: !wm.headerToggler || wm.headerToggler.hidden,
                                                hideIcon: 'up',
                                                showIcon: 'down' })
          }

          wm.container
            .append (wm.composeDiv = $('<div class="compose">')
                     .append (wm.messageHeaderDiv = $('<div class="messageheader">')
                              .append (wm.messagePrivacyDiv = $('<div class="privrow">')
                                       .append (pubTab = $('<div class="privtab">').text('Public')
                                                .on('click',function(){
                                                  wm.messagePrivacyDiv.children().removeClass('active')
                                                  wm.messageHeaderDiv.children().removeClass('direct')
                                                  pubTab.addClass('active')
                                                  wm.messageRecipientDiv.hide()
                                                  wm.composition.isPrivate = false
                                                  updateSharePane()
                                                }),
                                                privTab = $('<div class="privtab">').text('Direct')
                                                .on('click',function(){
                                                  wm.messagePrivacyDiv.children().removeClass('active')
                                                  wm.messageHeaderDiv.children().removeClass('direct').addClass('direct')
                                                  privTab.addClass('active')
                                                  wm.messageRecipientDiv.show()
                                                  wm.composition.isPrivate = true
                                                  updateSharePane()
                                                })),
                                       wm.messageRecipientDiv = $('<div class="row">')
                                       .append ($('<span class="label">').text ('To'),
                                                $('<span class="input">').append (wm.playerSearchInput,
                                                                                  wm.playerSearchResultsDiv.hide())),
                                       titleRow = $('<div class="row">')
                                       .append ($('<span class="label">').text ('Subject'),
                                                $('<span class="input">').append (wm.messageTitleInput)),
                                       $('<div class="tagrow">')
                                       .append (prevTagsRow = $('<div class="tagcol">')
                                                .append ($('<span class="label">').text ('Past tags'),
                                                         $('<span class="input">').append (wm.messagePrevTagsInput)),
                                                tagsRow = $('<div class="tagcol">')
                                                .append ($('<span class="label">').text ('Future tags'),
                                                         $('<span class="input">').append (wm.messageTagsInput))),
                                       templateRow = $('<div class="sectiontitle composesectiontitle">')
                                       .text('Template text:'),
                                       wm.messageComposeDiv,
                                       suggestRow = $('<div class="sectiontitle suggestsectiontitle">')
                                       .text('Suggestions:'),
                                       wm.suggestionDiv = $('<div class="suggest">')),
                              $('<div class="messageborder">')
                              .append (wm.stackDiv = $('<div class="stack">'))),
                     wm.infoPane,
                     $('<div class="subnavbar">').append
                     (wm.editButton = wm.makeSubNavIcon ('edit', function() {
                       wm.stopAnimation()
                       wm.headerToggler.showFunction()
                       wm.messageComposeDiv.trigger ('click')
                     }),
                      wm.randomizeButton = wm.makeSubNavIcon ('re-roll', function (evt) {
                        evt.stopPropagation()
                        wm.currentCard.throwOut (-wm.throwXOffset(), wm.throwYOffset())
                        delete wm.autosuggestStatus.lastVal
                        delete wm.autosuggestStatus.lastKey
                        wm.autosuggestStatus.temperature++
                        wm.autosuggestStatus.refresh()
                      }),
                      wm.destroyButton = wm.makeSubNavIcon ('delete', function (evt) {
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
                      $('<div class="sharepanecontainer">')
                      .append (wm.sharePane = $('<div class="sharepane">').hide(),
                               wm.shareButton = wm.makeSubNavIcon ('send', toggleSharePane).addClass('sharepanebutton')),
                      wm.makeHelpButton (wm.REST_getComposeHelpHtml)))

          updateSharePane()

          if (config.recipient) {
            wm.composition.recipient = config.recipient
            wm.composition.isPrivate = (wm.playerID !== null && config.recipient !== null && !config.defaultToPublic)
            wm.lastComposePlayerSearchText = playerChar + config.recipient.name
          }

          if (!wm.playerID) {
            pubTab.click()
            wm.destroyButton.hide()
            wm.messagePrivacyDiv.hide()
            wm.messageRecipientDiv.hide()
          } else {
            if (wm.composition.isPrivate)
              privTab.click()
            else
              pubTab.click()
          }

          var throwOutConfidence = function (xOffset, yOffset, element) {
            return Math.min(Math.abs(xOffset) / element.offsetWidth, 1)
          }
          var isThrowOut = function (xOffset, yOffset, element, throwOutConfidence) {
            return throwOutConfidence > .25 && (xOffset < 0 || window.confirm ('Send message?'))
          }
          wm.stack = swing.Stack ({ throwOutConfidence: throwOutConfidence,
				    throwOutDistance: function() { return wm.throwXOffset() },
				    allowedDirections: [
				      swing.Direction.LEFT,
				      swing.Direction.RIGHT
				    ],
                                    isThrowOut: isThrowOut })
          
          wm.restoreScrolling (wm.messageComposeDiv)
          wm.restoreScrolling (wm.suggestionDiv)
          
          wm.playerSearchInput.attr ('placeholder', 'Name of recipient')
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

          wm.divAutosuggest()
          wm.randomizeButton.show()
          
          var generate = false
          if (config.body && config.body.rhs && !wm.ParseTree.parseTreeEmpty (config.body.rhs))
            wm.composition.body = config.body
          else if (config.template)
            generate = true
          wm.dealCard (generate)

          if (config.focus)
            wm[config.focus].focus().trigger ('click')
          if (config.click)
            wm[config.click].trigger ('click')

          // compose page is now completely built.
          // If the content is empty, ping the server for a random popular template, and show that.
          return wm.selectRandomTemplate (function() { return !wm.composition.template.content.length }, false)
        })
      // end of showComposePage
    },

    throwXOffset: function() {
      return this.container.width() * 2 / 3
    },

    throwYOffset: function() {
      return this.container.height() / 4
    },

    dealCard: function (generateContent) {
      var wm = this
      var expansionRow = $('<div class="sectiontitle bodysectiontitle">')
          .append ($('<span>').text('Message text:'))
      wm.messageBodyDiv = $('<div class="messagebody">')
        .on ('click', function() {
          wm.stopAnimation()
          wm.saveCurrentEdit()
        })
      var messageBodyElem = wm.messageBodyDiv[0]
      wm.makeHeaderToggler (expansionRow)

      var cardDiv = $('<div class="card">').append (expansionRow, wm.messageBodyDiv)
      wm.stackDiv.append (cardDiv)

      // add scroll buttons
      var scrollUpDiv, scrollDownDiv, cardControlsDiv
      function showScrollButton (buttonDiv, enabled) {
        if (enabled)
          buttonDiv.show()
        else
          buttonDiv.hide()
      }
      function hideScrollButtons() {
        scrollUpDiv.hide()
        scrollDownDiv.hide()
      }
      function showScrollButtons() {
        if (cardControlsDiv)
          cardControlsDiv.remove()
        scrollUpDiv = $('<div class="scrollup">').append (wm.makeIconButton ('up', scrollUp, 'white'))
        scrollDownDiv = $('<div class="scrolldown">').append (wm.makeIconButton ('down', scrollDown, 'white'))
        cardControlsDiv = $('<div class="cardcontrols">').append (scrollUpDiv, scrollDownDiv)
        wm.messageBodyDiv.append (cardControlsDiv)
        showScrollButton (scrollUpDiv, messageBodyElem.scrollTop > 0)
        showScrollButton (scrollDownDiv, Math.ceil (messageBodyElem.scrollTop + wm.messageBodyDiv.height() + 4) < messageBodyElem.scrollHeight)  // DEBUG
        wm.restoreScrolling (wm.messageBodyDiv)
      }
      function doScroll (dir) {
        hideScrollButtons()
        wm.messageBodyDiv.animate
        ({ scrollTop: messageBodyElem.scrollTop + dir * wm.messageBodyDiv.height() * wm.scrollButtonDelta },
         wm.cardScrollTime)
      }
      function scrollUp() { doScroll (-1) }
      function scrollDown() { doScroll (+1) }
      showScrollButtons()
      var scrollButtonTimer
      wm.messageBodyDiv.on ('scroll', function() {
        if (scrollButtonTimer)
          window.clearTimeout (scrollButtonTimer)
        scrollButtonTimer = window.setTimeout (showScrollButtons, 100)
      })
      wm.showScrollButtons = showScrollButtons

      // create the swing card
      var card = wm.stack.createCard (cardDiv[0])
      card.on ('throwoutleft', function() {
        wm.fadeCard (cardDiv, card, wm.dealCard.bind (wm, true))
      })
      card.on ('throwoutright', function() {
        wm.fadeCard (cardDiv, card, wm.sendMessage.bind (wm))
      })
      wm.currentCard = card
      wm.currentCardDiv = cardDiv
      
      // render the text
      delete wm.animationExpansion
      cardDiv.hide()
      if (generateContent)
        wm.generateMessageBody()
      else
        wm.showMessageBody()

      // allow scrolling if using a scroll wheel
      wm.restoreScrolling (wm.messageBodyDiv)
    },

    fadeCard: function (element, card, callback) {
      var wm = this
      element.find('*').off()
      card.destroy()
      element.fadeOut (wm.cardFadeTime, function() {
	if (wm.verbose.stack)
	  console.log ("Card removed after fade: " + element.html())
	element.remove()
	if (wm.verbose.stack)
	  wm.logStack()
        if (callback)
          callback()
      })
    },

    logStack: function() {
      var wm = this
      console.log ($.map (wm.stackList.children(), function (elem, idx) {
	var c = elem.getAttribute('class')
	return (c ? ("("+c+") ") : "") + elem.innerHTML
      }))
    },

    selectRandomTemplate: function (randomizeCondition, fixFlag) {
      var wm = this
      randomizeCondition = randomizeCondition || function() { return true }
      if (randomizeCondition())
        return wm.REST_getPlayerSuggestTemplates (wm.playerID)
        .then (function (result) {
          if (result && result.templates.length && randomizeCondition()) {
            var template = wm.ParseTree.randomElement (result.templates)
            return wm.REST_getPlayerTemplate (wm.playerID, template.id)
              .then (function (templateResult) {
                if (templateResult && templateResult.template && randomizeCondition()) {
                  wm.composition.template = templateResult.template
                  wm.messageTitleInput.val (wm.composition.title = templateResult.template.title)
                  wm.messageTagsInput.val (wm.composition.tags = templateResult.template.tags)
                  wm.messagePrevTagsInput.val (wm.composition.previousTags = templateResult.template.previousTags)
                  wm.updateComposeDiv()
                  wm.generateMessageBody(true)
                    .then (function() {
                      wm.composition.randomTemplate = true
                    })
                } else if (fixFlag)
                  delete wm.composition.randomTemplate
              })
          } else if (fixFlag)
            delete wm.composition.randomTemplate
        })
      else if (fixFlag)
        delete wm.composition.randomTemplate
      return $.Deferred().resolve()
    },
    
    addToggler: function (config) {
      var showButton, hideButton, showFunction, hideFunction, toggler
      showButton = wm.makeIconButton (config.showIcon, showFunction = function() {
        config.elements.forEach (function (element) { element.show() })
        hideButton.show()
        showButton.hide()
        toggler.hidden = false
      })
      hideButton = wm.makeIconButton (config.hideIcon, hideFunction = function() {
        config.elements.forEach (function (element) { element.hide() })
        hideButton.hide()
        showButton.show()
        toggler.hidden = true
      })
      config.container.append (showButton, hideButton)
      toggler = { showButton: showButton,
                  hideButton: hideButton,
                  showFunction: showFunction,
                  hideFunction: hideFunction }
      if (config.hidden)
        hideFunction()
      else
        showFunction()
      return toggler
    },

    updateComposeDiv: function() {
      var wm = this
      wm.populateEditableElement
      (wm.messageComposeDiv,
       { content: function() { return wm.composition.template ? wm.composition.template.content : [] },
         changeCallback: function (input) {
           delete wm.composition.randomTemplate
           wm.composition.needsSave = true
           wm.autosuggestStatus.temperature = 0
           wm.setTimer ('autosuggestTimer',
                        wm.autosuggestDelay,
                        wm.textareaAutosuggest.bind (wm, input))
         },
         showCallback: function (input) {
           delete wm.autosuggestStatus.lastKey
           delete wm.autosuggestStatus.lastVal
           wm.autosuggestStatus.temperature = 0
           wm.autosuggestStatus.refresh = wm.textareaAutosuggest.bind (wm, input)
           wm.clearTimer ('autosuggestTimer')
           wm.suggestionDiv
             .empty()
             .off ('click')
             .on ('click', function() { input.focus() })
           wm.textareaAutosuggest (input)
         },
         hideCallback: function() {
           delete wm.autosuggestStatus.lastKey
           wm.autosuggestStatus.temperature = 0
           wm.autosuggestStatus.refresh = wm.divAutosuggest
           wm.divAutosuggest()
         },
         alwaysUpdate: true,
         updateCallback: function (newContent) {
           return wm.updateComposeContent (newContent) ? wm.generateMessageBody() : $.Deferred().resolve()
         },
         parse: wm.parseRhs.bind(wm),
         renderText: wm.makeRhsText.bind(wm),
         renderHtml: wm.makeTemplateSpan.bind(wm)
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
          .append (result.symbols.map (function (symbol) {
                     wm.symbolName[symbol.id] = symbol.name
                     return $('<span>').html (wm.makeSymbolSpan (symbol, function (evt) {
                       evt.stopPropagation()
                       wm.suggestionDiv.empty()
                       symbolSelectCallback (symbol)
                     }, 'div', [[symChar + symbol.name, function() { symbolSelectCallback (symbol) }],
                                [symChar + wm.ParseTree.capitalize(symbol.name), function() { symbolSelectCallback (symbol, ['cap']) }],
                                [symChar + symbol.name.toUpperCase(), function() { symbolSelectCallback (symbol, ['uc']) }],
                                ['a ' + symChar + symbol.name, function() { symbolSelectCallback (symbol, ['a']) }],
                                ['A ' + symChar + symbol.name, function() { symbolSelectCallback (symbol, ['a','cap']) }],
                                ['Go to thesaurus definition', function() { wm.showGrammarLoadSymbol (symbol) }]
                               ]))
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
          this.REST_postPlayerSearchPlayersFollowed (this.playerID, searchText.replace(playerChar,''))
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
                                        wm.playerSearchInput.val (wm.lastComposePlayerSearchText = playerChar + player.name)
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
      // convert \n to newline
      markdown = markdown.replace(/\\n/g,function(){return"\n"})
      // convert leading and trailing whitespace to '&ensp;'
      markdown = markdown.replace(/^\s/,function(){return'&ensp;'}).replace(/\s$/,function(){return'&ensp;'})
      // next, call marked library to convert Markdown to HTML string
      var renderedHtml = marked (markdown, this.markedConfig)
          .replace (new RegExp ('\\' + playerChar + '(\\w+)', 'g'), function (match, name) {
            return '<span class="playertag">' + playerChar + '<span class="name">' + name + '</span></span>'
          })
      // next, call optional transform method on HTML string (e.g. to put animation styling on symbols)
      if (transform)
        renderedHtml = transform.call (wm, renderedHtml)
      // next, convert HTML string to JQuery object,
      // use JQuery to add player-tag styling,
      // and asynchronously resolve player names
      var rendered = $(renderedHtml)
      $(rendered).find('.playertag')
        .each (function (n, playerTag) {
          var playerName = $(playerTag).find('.name').text()
          wm.getPlayerId (playerName)
            .then (function (player) {
              if (player)
                $(playerTag).removeClass('playertag').addClass('playerlink')
                .on ('click', wm.showOtherStatusPage.bind (wm, { id: player }))
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
      (this.ParseTree.makeExpansionText (this.animationExpansion, true, this.compositionVarVal())
       .replace (/^\s*$/, wm.emptyMessageWarning),
       function (html) { return wm.linkSymbols (html) })
      
      this.animationDiv.html (markdown)
      this.showScrollButtons()
      
      if (this.deleteFirstSymbolName (this.animationExpansion) || this.extraAnimationSteps-- > 0)
        this.setTimer ('expansionAnimationTimer',
                       Math.min (this.expansionAnimationDelay, Math.ceil (this.maxExpansionAnimationTime / this.animationSteps)),
                       this.animateExpansion.bind(this))
    },

    linkSymbols: function (html) {
      // more than slightly hacky, this method...
      var nSymbols = 0
      return html.replace
      (new RegExp (symCharHtml + '([A-Za-z_]\\w*)\.([A-Za-z]+)', 'g'),
       function (_match, name, className) {
         className = className.toLowerCase()
         var notFound = (className === 'notfound')
         return '<span class="lhslink ' + className
           + ((!notFound && nSymbols++ === 0) ? ' animating' : '')
           + '">' + symCharHtml + '<span class="name">' + name + '</span></span>'
       })
    },

    stopAnimation: function() {
      if (this.expansionAnimationTimer) {
        this.animationDiv.html (this.renderMarkdown (this.ParseTree.makeExpansionText (this.animationExpansion, false, this.compositionVarVal())))
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
    
    deleteFirstSymbolName: function (node) {
      var namedNode = this.firstNamedSymbol (node)
      if (namedNode && namedNode.name) {
        delete namedNode.name
        return true
      }
      return false
    },

    generateMessageBody: function (useCurrentTemplate) {
      var wm = this
      wm.composition.body = {}
      wm.composition.needsSave = true
      
      var templatePromise
      if (useCurrentTemplate)
        templatePromise = $.Deferred().resolve()
      else if (wm.composition.previousTemplate)
        templatePromise = wm.REST_getPlayerSuggestReply (wm.playerID, wm.composition.previousTemplate.id, wm.stripLeadingAndTrailingWhitespace (wm.composition.previousTemplate.tags))
        .then (function (result) {
          if (result.template) {
            delete wm.composition.randomTemplate
            wm.composition.template = result.template
            wm.composition.tags = wm.stripLeadingAndTrailingWhitespace (result.template.tags)
            wm.composition.previousTags = wm.stripLeadingAndTrailingWhitespace (result.template.previousTags)

	    wm.messageTagsInput.val (wm.composition.tags)
	    wm.messagePrevTagsInput.val (wm.composition.previousTags)
            wm.updateComposeDiv()
          }
          if (!result.more)
            delete wm.composition.previousTemplate
        })
      else
        templatePromise = wm.selectRandomTemplate (function() { return wm.composition.randomTemplate }, false)

      var sampledTree, symbolNodes
      return templatePromise.then (function() {
        if (wm.composition.template && wm.composition.template.content) {
	  sampledTree = wm.ParseTree.sampleParseTree (wm.composition.template.content)
          symbolNodes = wm.ParseTree.getSymbolNodes (sampledTree)
          var symbolQueries = symbolNodes.map (function (sym) {
            return { id: sym.id,
                     name: sym.name }
          })
          return wm.REST_postPlayerExpand (wm.playerID, symbolQueries)
        } else
          return null
      }).then (function (result) {
        if (result && result.expansions) {
	  symbolNodes.forEach (function (symbolNode, n) {
            var expansion = result.expansions[n]
            if (expansion) {
              if (typeof(expansion.id) !== 'undefined') {
                symbolNode.id = expansion.id
		symbolNode.rhs = expansion.rhs
                symbolNode.name = wm.symbolName[expansion.id] = expansion.name
              } else
                symbolNode.notfound = expansion.notfound
              return expansion
            }
	  })
          wm.composition.body = { type: 'root', rhs: sampledTree }
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
	if (wm.animationExpansion)
          wm.deleteAllSymbolNames (wm.animationExpansion)
        wm.animationSteps = 0
        div.html (this.renderMarkdown (wm.ParseTree.makeExpansionText (expansion, false, wm.compositionVarVal())
                                       .replace (/^\s*$/, (!config.inEditor && wm.templateIsEmpty()
                                                           ? wm.emptyTemplateWarning
                                                           : wm.emptyMessageWarning))))
        wm.showScrollButtons()
      }
      if (expansion)
        wm.currentCardDiv.show()
      if (config.animate)
        wm.currentCard.throwIn (-wm.throwXOffset(), -wm.throwYOffset())
    },
    
    randomizeEmptyMessageWarning: function() {
      this.emptyMessageWarning = '_' + this.ParseTree.randomElement (this.emptyMessageWarnings) + '_'
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
            var expansion = wm.ParseTree.randomElement(rhs)
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
      return !this.composition || !this.composition.template || !this.composition.template.content || this.ParseTree.parseTreeEmpty (this.composition.template.content)
    },

    // initial page
    showInitialPage: function (config) {
      var wm = this
      var promise
      config = config || {}
      switch (config.action) {
      case 'message':
        wm.container.hide()
        promise = wm.REST_getPlayerMessagePublic (wm.playerID, config.message)
          .then (function (result) {
            return wm.showStatusPage()
              .then (function() {
                return wm.showMessage ($.extend ({ result: result,
                                                   recipient: null },
                                                 wm.broadcastProps()))
              }).then (function() {
                // presentation hack: monkey-patch the message container
                wm.readMessageDiv.addClass ('permalink')
                wm.container.show()
              })
          })
        break
      case 'compose':
        promise = this.showComposePage ({ recipient: config.recipient,
                                          title: config.title,
                                          template: { content: config.content || (config.text ? wm.parseRhs(config.text) : []) } })
        break
      case 'grammar':
        wm.container.hide()
        promise = this.showGrammarLoadSymbol (config.symbol)
          .then (function() {
            wm.container.show()
          })
        break
      case 'home':
      default:
        promise = this.showComposePage()
        break
      }
      return promise
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
          if (wm.mailboxTab === 'public')
            wm.mailboxTab = 'inbox'
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
                                 anon: 'Everyone',
                                 showMessage: function (props) {
                                   wm.showMessage ($.extend ({ sender: wm.playerInfo },
                                                             props))
                                 }
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
                                 anon: 'Everyone',
                                 showMessage: function (props) {
                                   var draft = props.result.draft
                                   wm.showComposePage ({ recipient: draft.recipient,
                                                         title: draft.title,
                                                         previousMessage: draft.previous,
                                                         previousTemplate: draft.previousTemplate,
                                                         tags: draft.tags,
                                                         previousTags: draft.previousTags,
                                                         template: draft.template,
                                                         body: draft.body,
                                                         draft: draft.id })
                                 }
                               })
        return result
      })
    },

    broadcastProps: function() {
      var wm = this
      return { tab: 'public',
               title: 'Recent messages',
               getMethod: 'REST_getPlayerMessagePublic',
               verb: 'Posted',
               preposition: 'From',
               object: 'sender',
               anon: this.anonGuest,
               showMessage: function (props) {
                 wm.showMessage ($.extend ({ recipient: null },
                                           props))
               }
             }
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
               replyDirect: true,
               showMessage: function (props) {
                 wm.showMessage ($.extend ({ recipient: wm.playerInfo },
                                           props))
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
              wm.mailboxContentsDiv.prepend (wm.makeMailboxEntryDiv (wm.inboxProps(), result.message))
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
                 .append (props.messages
                          .sort (function (a, b) { return new Date(b.date) - new Date(a.date) })  // newest first
                          .map (wm.makeMailboxEntryDiv.bind (wm, props))))
    },

    makeMailboxEntryDiv: function (props, message) {
      var wm = this
      wm.messageHeaderCache[message.id] = message
      var deleteMessage = (props.deleteMethod
                           ? function (evt) {
                             evt.stopPropagation()
                             if (window.confirm ('Delete this message?'))
                               wm[props.deleteMethod] (wm.playerID, message.id)
                               .then (wm.reloadCurrentTab.bind(wm))
                           }
                           : null)
      var div = $('<div class="message">')
          .append ($('<div class="title">').text (message.title || 'Untitled'),
                   (deleteMessage
                    ? $('<span class="buttons">').append (wm.makeIconButton ('delete', deleteMessage))
                    : []),
                   $('<div class="player">').html (message[props.object] ? message[props.object].displayName : $('<span class="placeholder">').text (props.anon || ('No '+props.object))))
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
      var sender = message.sender || props.sender, recipient = message.recipient || props.recipient
      return wm.pushView ('read')
        .then (function() {
          wm.container
            .append (wm.readMessageDiv = $('<div class="readmessage">'),
                     wm.rateMessageDiv = $('<div class="ratemessage">').hide(),
                     wm.popBack()
                     .append (wm.replyButton = wm.makeSubNavIcon ('reply',
                                                                  function (evt) {
                                                                    evt.stopPropagation()
                                                                    var replyTitle = message.title
                                                                    if (replyTitle.match(/\S/) && !replyTitle.match(/^re:/i))
                                                                      replyTitle = 'Re: ' + replyTitle
                                                                    wm.showComposePage
                                                                    ({ recipient: message.sender,
                                                                       defaultToPublic: !props.replyDirect,
                                                                       title: replyTitle,
                                                                       previousMessage: message.id,
                                                                       previousTemplate: message.template,
                                                                       tags: '',
                                                                       previousTags: message.template ? (message.template.tags || '') : '',
                                                                       focus: 'messageTitleInput'
                                                                     }).then (function() {
                                                                       wm.generateMessageBody()
                                                                     })
                                                                  }),
                              wm.forwardButton = wm.makeSubNavIcon ('forward',
                                                                    function (evt) {
                                                                      evt.stopPropagation()
                                                                      wm.REST_getPlayerTemplate (wm.playerID, message.template.id)
                                                                        .then (function (templateResult) {
                                                                          return wm.showComposePage
                                                                          ({ title: message.title,
                                                                             template: templateResult.template,
                                                                             body: message.body,
                                                                             previousMessage: message.id,
                                                                             tags: templateResult.template.tags || '',
                                                                             previousTags: templateResult.template.previousTags || '',
                                                                             focus: 'playerSearchInput' })
                                                                        })
                                                                    }),
                              props.destroy ? (wm.destroyButton = wm.makeSubNavIcon('delete',props.destroy)) : []))

          var other = message[props.object]
          wm.readMessageDiv
            .empty()
            .append ($('<div class="messageheader">')
                     .append ($('<div class="row">')
                              .append ($('<span class="label">').text (props.preposition),
                                       $('<span class="field messageplayer">').html (other
                                                                       ? wm.makePlayerSpan (other.name,
                                                                                            other.displayName,
                                                                                            function (evt) {
                                                                                              wm.showOtherStatusPage (other)
                                                                                            })
                                                                       : (props.anon || ('No '+props.object)))),
                              $('<div class="row">')
                              .append ($('<span class="label">').text ('Subject'),
                                       $('<span class="field messagetitle">').text (message.title || 'Untitled'))
                              .hide(),  // at the moment, we're not really using the title field except as a hint in mailbox view; so, hide it
                              $('<div class="row">')
                              .append ($('<span class="label">').text (props.verb),
                                       $('<span class="field messagedate">').text (wm.relativeDateString (message.date)))),
                     $('<div class="messagebody messageborder">').html (wm.renderMarkdown (wm.ParseTree.makeExpansionText (message.body,
                                                                                                                           false,
                                                                                                                           wm.messageVarVal(sender,recipient)))))
        })
    },

    messageVarVal: function (sender, recipient) {
      var varVal = this.ParseTree.defaultVarVal()
      if (sender)
        varVal.me = playerChar + sender.name
      if (recipient)
        varVal.you = playerChar + recipient.name
      return varVal
    },

    compositionVarVal: function() {
      return this.messageVarVal (this.playerID ? this.playerInfo : null,
                                 this.composition.isPrivate ? this.composition.recipient : null)
    },
    
    relativeDateString: function (dateInitializer) {
      var weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      var now = new Date(), date = new Date (dateInitializer), secsSince = (now - date) / 1000, daysSince = secsSince / 86400
      var hours = date.getHours(), ampm = hours < 12 ? 'am' : 'pm', minutes = date.getMinutes(), day = date.getDay(), year = date.getFullYear()
      return ((daysSince < 1 && day === now.getDay()
               ? ''
               : ((daysSince < 3
                   ? weekdays[day]
                   : (months[date.getMonth()] + ' ' + date.getDate()
                      + (year === now.getFullYear()
                         ? ''
                         : (', ' + year)))) + ' at '))
              + ((hours % 12) || 12) + ':' + (minutes < 10 ? '0' : '') + minutes + ampm)
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
      var statusPromise = (wm.playerID
                           ? wm.REST_getPlayerStatus(wm.playerID).then (function (status) {
                             status.hideStatusInfo = (wm.playerID === null)
                             return status
                           })
                           : wm.REST_getWelcomeHtml().then (function (html) {
                             return { hideStatusInfo: true, html: $('<div class="welcome">').html (html) }
                           }))
      return statusPromise
        .then (function (status) {
          return wm.setPage ('status')
            .then (function() {
              wm.showNavBar ('status')
              wm.showGameStatusPage (status)
              if (wm.playerID)
                wm.detailBarDiv.prepend ($('<div class="follow">').html (wm.makePlayerSpan (wm.playerLogin)))
              wm.detailBarDiv
                .prepend (wm.makePageTitle ('Welcome to Wiki Messenger'))
                .append (wm.mailboxDiv = $('<div class="mailbox">'))
              return wm.REST_getPlayerPublic (wm.playerID)
                .then (function (pubResult) {
                  if (pubResult.messages.length)
                    wm.populateMailboxDiv ($.extend ({ messages: pubResult.messages },
                                                     wm.broadcastProps()))
                  // TODO: append 'More...' link to wm.mailboxDiv, bumping up optional limit on /p/public
                  return wm.REST_getPlayerSuggestTemplates (wm.playerID)
                    .then (function (result) {
                      if (result && result.templates.length)
                        wm.detailBarDiv.append ($('<div class="filler">'),
                                                $('<div class="popular">')
                                                .append ($('<div class="header">').text("Popular templates"),
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
                                                                      .text (template.title || 'Untitled'),
                                                                      $('<span class="by">').append
                                                                      (' by ',
                                                                       template.author
                                                                       ? wm.makePlayerSpan (template.author.name,
                                                                                            null,
                                                                                            wm.callWithSoundEffect (wm.showOtherStatusPage.bind (wm, template.author)))
                                                                       : wm.anonGuest)) }))))
                    })
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
	.append (button = wm.makeSubNavIcon ('back', function() { callback(button) }))
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

      if (status && status.html) {
        wm.detailBarDiv.append (status.html)
        wm.addHelpIcons (wm.detailBarDiv)
      }

      if (status && !status.hideStatusInfo) {
        wm.detailBarDiv.append
        ($('<div class="ratings">')
         .append ($('<div class="ratinginfo">')
                  .append ($('<span class="ratinginfolabel">').text ("Messages:"),
                           wm.makeStars (status.sumSenderRatings / status.nSenderRatings),
                           $('<span class="ratinginfocount">').text (" (" + wm.ParseTree.nPlurals (status.nSenderRatings, "rating") + ")")),
                  $('<div class="ratinginfo">')
                  .append ($('<span class="ratinginfolabel">').text ("Phrases:"),
                           wm.makeStars (status.sumAuthorRatings / status.sumAuthorRatingWeights),
                           $('<span class="ratinginfocount">').text (" (" + wm.ParseTree.nPlurals (status.nAuthorRatings, "rating") + ")"))))

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
      }
    },

    // edit & auto-save
    promiseSave: function (savePromise) {
      this.lastSavePromise = savePromise
      return this.lastSavePromise
    },
    
    finishLastSave: function() {
      this.lastSavePromise = this.lastSavePromise || $.Deferred().resolve()
      return this.lastSavePromise
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
          return wm.promiseSave (def)
        })
    },

    saveOnPageExit: function (config) {
      var wm = this
      config = config || {}
      wm.unfocusCallback = typeof(config.unfocus) !== 'undefined' ? config.unfocus : wm.saveCurrentEdit.bind(wm)
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
      wm.setUnfocusCallback()
    },

    setUnfocusCallback: function() {
      this.pageContainer
        .off ('click')
        .on ('click', wm.unfocusCallback)
    },

    clearUnfocusCallback: function() {
      this.pageContainer.off ('click')
    },

    makeIconButton: function (iconName, callback, color) {
      var iconNameSpan = $('<span>').addClass('iconlabel').text(iconName)
      var button = $('<span>').addClass('button').html (iconNameSpan)
      this.getIconPromise (this.iconFilename[iconName])
        .done (function (svg) {
          svg = wm.colorizeIcon (svg, color || wm.themeInfo.iconColor)
          button.prepend ($(svg))
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

      div.off ('click')
      if (props.isConstant) {
        if (props.editWarning)
          div.on ('click', function (evt) {
            wm.showModalMessage (props.editWarning)
          })
      } else {
        div.on ('click', editCallback)
        if (props.destroyCallback)
          buttonsDiv.append (wm.makeIconButton (props.destroyIcon || 'delete', function (evt) {
            evt.stopPropagation()
            wm.saveCurrentEdit()
              .then (function() {
                
                if (props.confirmDestroy())
                  wm.promiseSave (props.destroyCallback())
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
          return wm.promiseSave
          (wm.REST_putPlayerSymbol (wm.playerID, symbol.id, wm.symbolName[symbol.id], symbol.rules)
           .then (function (result) {
             $.extend (wm.symbolName, result.name)
             return result.symbol
           }))
        })
    },

    renameSymbol: function (symbol, newName) {
      var wm = this
      return wm.finishLastSave()
        .then (function() {
          return wm.promiseSave
          (wm.REST_putPlayerSymbol (wm.playerID, symbol.id, newName, symbol.rules)
           .then (function (result) {
             wm.updateSymbolCache (result)
           }).fail (function (err) {
             var reload = wm.reloadCurrentTab.bind(wm)
	     if (err.status == 400)
               wm.showModalMessage ("You can't rename " + symChar + wm.symbolName[symbol.id] + " to " + symChar + newName + ", because " + symChar + newName + " already exists", reload)
             else
               wm.showModalWebError (err, reload)
           }))
        })
    },

    updateSymbolCache: function (result) {
      var wm = this
      var symbol = result.symbol
      var oldName = symbol ? this.symbolName[symbol.id] : null
      $.extend (this.symbolName, result.name)
      if (oldName) {
        if (oldName !== symbol.name) {
          wm.symbolName[symbol.id] = symbol.name
          wm.ruleDiv[symbol.id].remove()
          wm.placeGrammarRuleDiv (symbol)
          wm.referringSymbols(symbol).forEach (function (lhsSymbol) {
            lhsSymbol.rules.forEach (function (rhs) {
              wm.ParseTree.getSymbolNodes(rhs).forEach (function (rhsSym) {
                if (rhsSym.id === symbol.id)
                  rhsSym.name = symbol.name
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

    parseRhs: function (rhs) {
      var wm = this, result
      try {
        result = rhsParser.parse (rhs)
      } catch (e) {
        console.warn(e)
        result = [rhs]
      }
      return result
    },

    symbolOwnedByPlayer: function (symbol) {
      return symbol.owner && (this.playerID !== null) && symbol.owner.id === this.playerID
    },

    symbolEditableByPlayer: function (symbol) {
      return (this.symbolOwnedByPlayer(symbol)
              || ((symbol.owner === null
                   || typeof(symbol.owner.id) === 'undefined'
                   || symbol.owner.id === null)
                  && !(symbol.owner && symbol.owner.admin)))
    },

    summarizeText: function (text, len) {
      len = len || 20
      var summ = text.replace (/\s+/g, ' ')
      return summ.length <= len ? summ : (summ.substr(0,20) + '...')
    },
    
    makeGrammarRhsDiv: function (symbol, ruleDiv, n) {
      var wm = this
      var editable = wm.symbolEditableByPlayer (symbol)
      var span = wm.makeEditableElement
      ({ element: 'span',
         className: 'rhs',
         content: function() { return symbol.rules[n] },
         guessHeight: true,
         isConstant: !editable,
         editWarning: "You don't have permission to edit " + symChar + wm.symbolName[symbol.id] + ". Select 'Duplicate this phrase' from the menu: you'll have full editing rights for the duplicate.",
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
                                         : ('definition "'+wm.summarizeText(rhsText)+'"'))
                            + ' for ' + symChar + wm.symbolName[symbol.id] + '?')
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

      function addToDraft (expansion) {
        return function (evt) {
          evt.stopPropagation()
          var expandedPromise = wm.saveCurrentEdit()
          if (!expansion)
            expandedPromise = expandedPromise
            .then (function () {
              return wm.REST_getPlayerExpand (wm.playerID, symbol.id)
                .then (function (result) {
                  expansion = result.expansion
                })
            })
          expandedPromise.then (function() {
	    if (expansion)
	      expansion = $.extend ({ type: 'sym' }, expansion)
            if (!wm.templateIsEmpty()) {
              if (expansion && wm.composition.body && wm.composition.body.rhs)
                wm.composition.body.rhs.push (expansion)
              wm.composition.template.content.push ({ id: symbol.id })
              return wm.showComposePage()
            } else
              return wm.showComposePage
            ({ template: { content: [ symbol ] },
               title: wm.symbolName[symbol.id].replace(/_/g,' '),
               body: expansion ? { type: 'root', rhs: [expansion] } : undefined,
               focus: 'playerSearchInput' })
            })
        }
      }

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
                                      expansion: { type: 'root', rhs: [result.expansion] },
                                      inEditor: true,
                                      animate: true })
                wm.infoPaneLeftControls
                  .empty()
                  .append (wm.makeIconButton ('re-roll'),
                           $('<div class="hint">').text('re-roll'))
                  .off('click')
                  .on('click',randomize)
                wm.infoPaneRightControls
                  .empty()
                  .append (wm.makeIconButton ('forward'),
                           $('<div class="hint">').text('add to draft'))
                  .off('click')
                  .on('click', addToDraft (result.expansion))
		wm.infoPane.show()
              })
          })
      }

      function copySymbol (evt) {
        evt.stopPropagation()
        wm.saveCurrentEdit()
          .then (function() {
            if (window.confirm ('Make a copy of ' + symChar + wm.symbolName[symbol.id] + '?'
                                + (wm.symbolEditableByPlayer(symbol) ? '' : ' (Unlike the original, you will be able to edit the copy.)')))
              wm.createNewSymbol ({ symbol: { name: wm.symbolName[symbol.id],
                                              copy: symbol.id } })
          })
      }

      function unlockSymbol (evt) {
        evt.stopPropagation()
        wm.saveCurrentEdit()
          .then (function() {
            if (window.confirm('Give up your lock on ' + symChar + wm.symbolName[symbol.id] + '? Anyone will be able to edit the phrase.'))
              return wm.promiseSave (wm.REST_deletePlayerSymbol (wm.playerID, symbol.id), 'unlockSymbol')
          })
      }

      function linkToSymbol (evt) {
        evt.stopPropagation()
        wm.saveCurrentEdit()
        window.open (wm.REST_makeSymbolUrl (wm.symbolName[symbol.id]))
      }

      var linksVisible = false
      var linksDiv = $('<div class="links">')
      function showLinks (evt) {
        evt.stopPropagation()
        wm.REST_getPlayerSymbolLinks (wm.playerID, symbol.id)
          .then (function (links) {
            $.extend (wm.symbolName, links.name)
            linksVisible = true
            function makeSymbolSpans (title, symbolIDs, emptyStr) {
              var listDiv = $('<div class="symbols">')
              if (symbolIDs) {
                if (symbolIDs.length) {
                  listDiv.append ($('<span class="title">').text (title))
                  symbolIDs.forEach (function (linkedId) {
                    var linkedSym = { id: linkedId }
                    listDiv.append
                    (' ',
                     wm.makeSymbolSpan (linkedSym,
                                        function (evt) {
                                          evt.stopPropagation()
                                          wm.loadGrammarSymbol (linkedSym)
                                        }))
                  })
                } else
                  listDiv.append ($('<span>').text (emptyStr))
              }
              return listDiv
            }
            linksDiv.empty().append
            (makeSymbolSpans ('The following phrases refer to this phrase:', links.symbol.using, 'No other phrases refer to this phrase.'),
             makeSymbolSpans ('This phrase refers to the following phrases:', links.symbol.used, 'This phrase does not refer to any other phrases.'),
             makeSymbolSpans ('The following phrases are derived from copies this phrase:', links.symbol.copies, 'There are no copies of this phrase.'),
             (links.symbol.copied
              ? $('<div>').append ('This phrase was derived from ',
                                   wm.makeSymbolSpan ({ id: links.symbol.copied },
                                                      function (evt) {
                                                        evt.stopPropagation()
                                                        wm.loadGrammarSymbol ({ id: links.symbol.copied })
                                                      }))
              : null))
              .show()
          })
      }
      
      function hideLinks (evt) {
        evt.stopPropagation()
        linksVisible = false
        linksDiv.hide()
      }

      function showRecentRevisions (evt) {
        evt.stopPropagation()
        menuDiv.hide()
        wm.REST_getPlayerSymbolRevisions (wm.playerID, symbol.id)
          .then (function (result) {
            return wm.pushView ('revisions')
              .then (function() {
                var revisionsDiv = $('<div class="revisions">')
                var revisionsBar = $('<div class="revisionsbar">')
                    .append (wm.makePageTitle ('Revisions of ' + symChar + wm.symbolName[symbol.id]),
                             revisionsDiv)
                var page = 0
                function addRevisions (result) {
                  revisionsDiv.append (result.revisions.map (function (revision) {
                    var div = $('<div class="revision">')
                        .append ($('<span class="summary">')
                                 .append ('Revision ',
                                          $('<span class="number">').text (revision.number),
                                          ': ',
                                          $('<span class="date">').html (wm.relativeDateString (revision.date)),
                                          ' (',
                                          revision.authored ? wm.makePlayerSpan (revision.author.name) : $('<span>').text(wm.anonGuest),
                                          ')'),
                                 $('<span class="diff">').html (revision.current
                                                                ? '(current)'
                                                                : $('<a href="#">')
                                                                .text('Compare to current')
                                                                .on ('click', function (e) {
                                                                  e.preventDefault()
                                                                })))
                    if (!revision.current)
                      div.on ('click', function() { showRevision (revision.id) })
                    return div
                  }))
                  if (result.more) {
                    var moreLink = $('<a href="#">').text('Show older revisions')
                        .on ('click', function (evt) {
                          evt.preventDefault()
                          moreLink.remove()
                          wm.REST_getPlayerSymbolRevisionsPage (wm.playerID, symbol.id, ++page)
                            .then (addRevisions)
                        })
                    revisionsBar.append (moreLink)
                  }
                }
                addRevisions (result)
                var backBar = wm.popBack (function (backButton) {
                  backButton.off()
                  wm.popView()
                })
                wm.container
                  .append (revisionsBar,
                           backBar)
                wm.restoreScrolling (revisionsBar)
              })
          }).fail (function (err) {
            wm.showModalWebError (err, wm.popView.bind(wm))
          })
      }

      function showRevision (revisionID) {
        wm.REST_getPlayerSymbolDiff (wm.playerID, symbol.id, revisionID)
          .then (function (result) {
            var diff = result.diff, revision = result.revision
            return wm.pushView ('diff')
              .then (function() {
                var pre = $('<pre>')
                    .append (diff.map (function (change) {
                      return $('<span>')
                        .addClass (change.added ? 'added' : (change.removed ? 'removed' : 'unchanged'))
                        .text (change.value)
                    }))
                var symNameText = symChar + wm.symbolName[symbol.id]
                var diffBar = $('<div class="diffbar">')
                    .append (wm.makePageTitle (symNameText),
                             $('<span class="diffinfo">')
                             .append ('Comparing revision ' + revision.number + ' (',
                                      revision.authored ? wm.makePlayerSpan (revision.author.name) : $('<span>').text(wm.anonGuest),
                                      ', ',
                                      $('<span class="date">').html (wm.relativeDateString (revision.date)),
                                      ') to current revision'),
                             pre,
                             (wm.symbolEditableByPlayer(symbol)
                              ? $('<a href="#">').text ('Restore this revision')
                              .on ('click', function (evt) {
                                evt.preventDefault()
                                if (window.confirm ('Restore old revision of ' + symNameText + '?')) {
                                  // save symbol
                                  wm.saveSymbol ({ id: symbol.id,
                                                   name: symbol.name,
                                                   rules: revision.rules })
                                    .then (function() {
                                      symbol.rules = revision.rules
                                      return wm.showGrammarLoadSymbol (symbol)
                                    })
                                }
                              })
                              : null))
                var backBar = wm.popBack (function (backButton) {
                  backButton.off()
                  wm.popView()
                })
                wm.container.append (diffBar, backBar)
                wm.restoreScrolling (diffBar)
              })
          }).fail (function (err) {
            wm.showModalWebError (err, wm.popView.bind(wm))
          })
      }
      
      function hideSymbol (evt) {
        evt.stopPropagation()
        wm.saveCurrentEdit()
          .then (function() {
            wm.removeGrammarRule (symbol)
          })
      }

      var menuDiv = $('<div class="rulemenu">').hide()
      function menuSelector (name, func) {
        return $('<div class="option">')
          .text (name)
          .on ('click', function (evt) {
            menuDiv.hide()
            wm.modalExitDiv.hide()
            func (evt)
          })
      }

      var expansionsDiv, minimizeButton, maximizeButton
      function minimize() {
        minimizeButton.hide()
        maximizeButton.show()
        expansionsDiv.hide()
	symbol.minimized = true
      }
      function maximize() {
        minimizeButton.show()
        maximizeButton.hide()
        expansionsDiv.show()
	symbol.minimized = false
      }
      function initMinMax() {
        if (symbol.minimized)
	  minimize()
        else
	  maximize()
      }
      
      ruleDiv.empty()
        .append (this.makeEditableElement
                 ({ element: 'div',
                    className: 'lhs',
                    content: function() { return wm.symbolName[symbol.id] },
                    guessHeight: true,
                    renderText: function(lhs) { return symChar + lhs },
                    renderHtml: function(lhs) { return $('<div class="name">').text(symChar + lhs) },
                    sanitize: wm.sanitizeCharSymbolName,
                    parse: function(charLhs) { return charLhs.substr(1) },
                    keycodeFilter: function (keycode) {
                      return (keycode >= 65 && keycode <= 90)   // a...z
                        || (keycode >= 48 && keycode <= 57)  // 0...9
                        || (keycode === 189)   // -
                        || (keycode === 32)  // space
                        || (keycode === 37 || keycode === 39)  // left, right arrow
                        || (keycode === 8)  // backspace/delete
                    },
                    isConstant: (!editable || symbol.fixname),
                    updateCallback: function (newLhs) {
                      return wm.renameSymbol (symbol, newLhs)
                    },
                    hideCallback: initMinMax,
                    beforeContentDiv: function() {
                      minimizeButton = $('<span class="menubutton">')
                        .append (wm.makeIconButton ('minimize', minimize))
                      maximizeButton = $('<span class="menubutton">')
                        .append (wm.makeIconButton ('maximize', maximize))
                      var menuButton = $('<span class="menubutton">')
                          .append (wm.makeIconButton ('menu', function (evt) {
                            menuDiv.empty()
                              .append (menuSelector ('Add to draft', addToDraft()),
                                       menuSelector ('Show sample text', randomize),
                                       (symbol.summary
                                        ? null
                                        : menuSelector ('Duplicate this phrase', copySymbol)),
                                       (linksVisible
                                        ? menuSelector ('Hide related phrases', hideLinks)
                                        : menuSelector ('Show related phrases', showLinks)),
                                       (symbol.summary
                                        ? null
                                        : menuSelector ('Show revision history', showRecentRevisions)),
                                       menuSelector ('Link to phrase', linkToSymbol),
                                       (owned
                                        ? menuSelector ('Unlock this phrase', unlockSymbol)
                                        : menuSelector ('Hide this phrase', hideSymbol)))
                              .show()
                            wm.pageContainer.on ('click', wm.hideMenu)
                            wm.modalExitDiv.show()
                            wm.infoPane.hide()
                            wm.showingHelp = false
                          }), menuDiv)
                      return $('<div class="menubuttons">')
                        .append (minimizeButton,
                                 maximizeButton,
                                 menuButton)
                        .on ('click', function(evt) { evt.stopPropagation() })
                    },
                    otherButtonDivs: function() {
                      var ownerSpan = $('<span class="owner">').text ('Editable by anyone'
                                                                      + (symbol.fixname ? ' (but not renamable)' : ''))
                      if (symbol.owner) {
                        if (symbol.owner.id !== null && symbol.owner.id === wm.playerID)
                          ownerSpan.text ('Editable by you')
                        else if (symbol.owner.admin)
                          ownerSpan.text ('Not editable, but you can make your own copy')
                        else if (symbol.owner.id)
                          ownerSpan.empty()
                          .append ('Not editable (locked by ',
                                   wm.makePlayerSpan (symbol.owner.name,
                                                      null,
                                                      wm.callWithSoundEffect (wm.showOtherStatusPage.bind (wm, symbol.owner))),
                                   '), but you can make a copy')
                      }
                      return [ownerSpan]
                    },
                  }),
                 linksDiv.hide(),
                 (symbol.summary
                  ? [$('<div class="summary">').html (wm.renderMarkdown (symbol.summary)),
                     $('<div class="protected">').text ('The owner of this phrase has not published the full definition. You are free to try and deduce it!')]
                  : [expansionsDiv = $('<div class="expansions">')
                     .append (((symbol.rules.length || !editable)
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
                              })))]))
      initMinMax()
    },

    countSymbolNodes: function (node, includeLimitedNodes) {
      var nodes = this.ParseTree.getSymbolNodes (node.rhs)
      if (!includeLimitedNodes)
	nodes = nodes.filter (function (node) {
	  return !node.limit
	})
      return nodes.length
    },
    
    firstNamedSymbol: function (node) {
      var nodes = this.ParseTree.getSymbolNodes (node.rhs)
	  .filter (function (node) { return node.name })
      return nodes.length ? nodes[0] : null
    },

    deleteAllSymbolNames: function (node) {
      if (node.rhs)
        this.ParseTree.getSymbolNodes (node.rhs).forEach (function (node) {
	  delete node.name
        })
    },

    makeRhsText: function (rhs) {
      return this.ParseTree.makeRhsText (rhs, this.makeSymbolName.bind(this))
    },

    makeRhsSpan: function (rhs) {
      var wm = this
      return $('<span>')
        .append (rhs.map (function (tok, n) {
          if (typeof(tok) === 'string')
            return $('<span>').html (wm.renderMarkdown (tok))
          var nextTok = (n < rhs.length - 1) ? rhs[n+1] : undefined
          switch (tok.type) {
          case 'lookup':
            return $('<span>').text (typeof(nextTok) === 'string' && nextTok.match(/^[A-Za-z0-9_]/)
                                     ? (varChar + leftBraceChar + tok.varname + rightBraceChar)
                                     : (varChar + tok.varname))
          case 'assign':
            return $('<span>').append (varChar + tok.varname + assignChar + leftBraceChar,
                                       wm.makeRhsSpan (tok.value),
                                       rightBraceChar)
          case 'alt':
            return $('<span>').append (leftSquareBraceChar,
                                       tok.opts.map (function (opt, n) { return $('<span>').append (n ? '|' : '', wm.makeRhsSpan(opt)) }),
                                       rightSquareBraceChar)
          case 'func':
	    var sugaredName = wm.ParseTree.makeSugaredName (tok, wm.makeSymbolName.bind(wm))
	    if (sugaredName)
              return wm.makeSymbolSpanWithName (tok.args[0],
						sugaredName,
						function (evt) {
						  evt.stopPropagation()
						  wm.loadGrammarSymbol (tok.args[0])
						})
            var noBraces = tok.args.length === 1 && (tok.args[0].type === 'func' || tok.args[0].type === 'lookup' || tok.args[0].type === 'alt')
            return $('<span>').append (funcChar + tok.funcname + (noBraces ? '' : leftBraceChar),
                                       wm.makeRhsSpan (tok.args),
                                       noBraces ? '' : rightBraceChar)
          default:
          case 'sym':
            return wm.makeSymbolSpan (tok,
                                      function (evt) {
                                        evt.stopPropagation()
                                        wm.loadGrammarSymbol (tok)
                                      })
          }
        }))
    },

    makeTemplateSpan: function (rhs) {
      var wm = this
      return $('<span>')
        .append (rhs.map (function (tok, n) {
          if (typeof(tok) === 'string')
            return $('<span>').html (wm.renderMarkdown (tok))
          var nextTok = (n < rhs.length - 1) ? rhs[n+1] : undefined
          switch (tok.type) {
          case 'lookup':
            return $('<span>').text (typeof(nextTok) === 'string' && nextTok.match(/^[A-Za-z0-9_]/)
                                     ? (varChar + leftBraceChar + tok.varname + rightBraceChar)
                                     : (varChar + tok.varname))
          case 'assign':
            return $('<span>').append (varChar + tok.varname + assignChar + leftBraceChar,
                                       wm.makeTemplateSpan (tok.value),
                                       rightBraceChar)
          case 'alt':
            return $('<span>').append (leftSquareBraceChar,
                                       tok.opts.map (function (opt, n) { return $('<span>').append (n ? '|' : '', wm.makeTemplateSpan(opt)) }),
                                       rightSquareBraceChar)
          case 'func':
	    var sugaredName = wm.ParseTree.makeSugaredName (tok, wm.makeSymbolName.bind(wm))
	    if (sugaredName)
              return wm.makeSymbolSpanWithName (tok.args[0],
						sugaredName,
						function (evt) {
						  evt.stopPropagation()
						  wm.showGrammarLoadSymbol (tok.args[0])
						})
            return $('<span>').append (funcChar + tok.funcname + leftBraceChar,
                                       wm.makeTemplateSpan (tok.args),
                                       rightBraceChar)
          default:
          case 'sym':
            return wm.makeSymbolSpan (tok,
                                      function (evt) {
                                         wm.saveCurrentEdit()
                                           .then (function() {
                                             return wm.showGrammarLoadSymbol (tok)
                                           })
                                      })
          }
        }))
    },

    makePlayerSpan: function (name, displayName, callback) {
      var nameSpan = $('<span class="name">')
      var span = $('<span class="player">').addClass(callback ? 'playerlink' : 'playertag').append (playerChar, nameSpan)
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
      return name
    },

    makeSymbolSpan: function (sym, callback, elementType, menu) {
      return this.makeSymbolSpanWithName (sym, this.makeSymbolName(sym), callback, elementType, menu)
    },

    makeSymbolSpanWithName: function (sym, name, callback, elementType, menu) {
      var wm = this
      var span = $('<' + (elementType || 'span') + ' class="lhslink">').append (symCharHtml, $('<span class="name">').text (name))
      var preventClick, menuTimer
      function initClick() {
        preventClick = 0
        if (callback)
          span.off('click')
          .on ('click', function (evt) {
            evt.stopPropagation()
            if (preventClick)
              --preventClick   // hack, ugh
            else {
              if (menuTimer) {
                window.clearTimeout (menuTimer)
                menuTimer = null
              }
              callback (evt)
            }
          })
      }
      initClick()
      if (menu) {
        var isTouch = wm.isTouchDevice()
        function openMenu (evt) {
          menuTimer = window.setTimeout (function() {
            ++preventClick
            wm.clearUnfocusCallback()
            function removeMenu (evt) {
              evt.stopPropagation()
              menuDiv.remove()
              exitDiv.remove()
              wm.setUnfocusCallback()
              initClick()
            }
            var menuDiv = $('<div class="symbolmenu">')
                .css ('opacity', 0)
            var exitDiv = $('<div class="wikimess-modalexit">')
                .on ('click', removeMenu)
            menuDiv.append (menu.map (function (menuItem) {
              return $('<div class="option">')
                .text (menuItem[0])
                .on ('click', function (evt) {
                  removeMenu (evt)
                  menuItem[1] (evt)
                })
            }))
            wm.container.append (menuDiv)
            span.one (isTouch ? 'touchend' : 'mouseup', function() {
              window.setTimeout (function() {
                wm.pageContainer.append (exitDiv)
              }, 10)
            })
            window.setTimeout (function() {
              var spanPos = wm.relativePosition (span)
              var spanWidth = span.outerWidth()
              var menuWidth = menuDiv.outerWidth()
              var menuHeight = menuDiv.outerHeight()
              var containerWidth = wm.container.outerWidth()
              var x = Math.min (Math.max (spanPos.left + spanWidth/2 - menuWidth/2, 2),
                                containerWidth - menuWidth - 2)
              menuDiv
                .css ('opacity', 1)
                .css ('left', Math.round(x))
                .css ('top', Math.round(spanPos.top - menuHeight))
            }, 1)
          }, wm.menuPopupDelay)
        }
        span.on (isTouch ? 'touchstart' : 'mousedown', openMenu)
      }
      return span
    },

    relativePosition: function (element, ancestor) {
      ancestor = ancestor || this.container
      var x = 0, y = 0
      while (element.length && !element.is(ancestor) && !element.is('html')) {
        var pos = element.position()
        x += pos.left
        y += pos.top
        element = element.offsetParent()
      }
      return { left: x, top: y }
    },
    
    sanitizeCharSymbolName: function (text) {
      return symChar + text.replace(/\s/g,'_').replace(/\W/g,'')
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
      return wm.saveCurrentEdit()
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
      if (Object.keys(this.ruleDiv).length === 0)
        this.emptyGrammarSpan.show()
    },

    makeGrammarRuleDiv: function (symbol) {
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
        name2id[wm.symbolName[id]] = (id.length >= 10   // hack to catch MongoDB hexadecimal IDs...
                                      ? id
                                      : parseInt (id))
      })
      return name2id
    },

    getSymbol: function (symbolName) {
      var wm = this
      return this.symbolCache[Object.keys(this.symbolName).find (function (id) { return wm.symbolName[id] === symbolName })]
    },
    
    lhsRefersTo: function (lhsSymbol, rhsSymbol) {
      var wm = this
      return lhsSymbol.rules.find (function (rhs) {
        return wm.getSymbolNodes(rhs).filter (function (rhsSym) {
          return rhsSym.id === rhsSymbol.id
        })
      })
    },

    referringSymbols: function (rhsSymbol) {
      var wm = this
      return this.cachedSymbols().filter (function (lhsSymbol) {
        return wm.lhsRefersTo (lhsSymbol, rhsSymbol)
      })
    },

    initInfoPane: function() {
      var wm = this
      wm.infoPane = $('<div class="infopane">')
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
      wm.infoPane.hide()
      wm.restoreScrolling (wm.infoPaneContent)
      wm.showingHelp = false
    },

    makeHelpButton: function (helpMethod) {
      var wm = this
      return wm.makeSubNavIcon ('help', function() {
        if (wm.sharePane)
          wm.sharePane.hide()
        if (wm.showingHelp) {
          wm.infoPane.hide()
          wm.showingHelp = false
        } else
	  helpMethod.call(wm).then (function (helpHtml) {
	    wm.saveCurrentEdit()
              .then (function() {
                wm.showingHelp = true
		wm.infoPaneTitle.text ('Help')
		wm.infoPaneContent.html (helpHtml.replace (/PHRASE/g, function() { return symCharHtml }))
                wm.addHelpIcons (wm.infoPaneContent)
                wm.infoPaneRightControls.empty()
                wm.infoPaneLeftControls.empty()
		wm.infoPane.show()
              })
	  })
      })
    },

    showGrammarLoadSymbol: function (symbol) {
      var wm = this
      return wm.showGrammarEditPage()
        .then (function() {
          wm.loadGrammarSymbol (symbol)
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

          return def.then (function() {
            
            wm.saveOnPageExit ({ autosave: null,
                                 pageExit: wm.saveCurrentEdit.bind(wm) })

            wm.grammarBarDiv = $('<div class="grammarbar">')
            wm.initInfoPane()
            
            wm.searchInput = $('<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">')
            wm.symbolSearchResultsDiv = $('<div class="results">')
            
            var searchButton = $('<span>')

            function newSymbol() {
              wm.createNewSymbol ({ symbol: { rules: [[wm.newRhsText()]] } })
            }
            
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
                       wm.grammarBarDiv,
                       wm.infoPane,
                       $('<div class="subnavbar">').append
                       (wm.makeSubNavIcon ('new', newSymbol),
                        wm.makeHelpButton (wm.REST_getGrammarHelpHtml)))
            
            wm.searchInput.attr ('placeholder', 'Search words and phrases')
            wm.placeIcon (wm.iconFilename.search, searchButton)
            searchButton.addClass('button')
              .on ('click', wm.doSymbolSearch.bind(wm))
            wm.searchInput.on ('keyup', function(event) {
              wm.doSymbolSearch()
            })
            wm.showSymbolSearchResults (true)

            wm.restoreScrolling (wm.symbolSearchResultsDiv)
            wm.restoreScrolling (wm.grammarBarDiv)

	    var nSymbolExamples = 3, nTemplateExamples = 2
            var exampleSymbolNames = wm.ParseTree.nRandomElements (wm.exampleSymbolNames, nSymbolExamples)
	    var exampleTemplatesSpan
            
            wm.ruleDiv = {}
            wm.grammarBarDiv
              .append (wm.emptyGrammarSpan = $('<span class="emptygrammar">')
                       .append ($('<div class="grammartitle">')
                                .append ('Wiki Messenger'),
                                'An editable thesaurus and procedural text generator.',
                                $('<p>'),
                                wm.makeIconButton ('search', function() { wm.searchInput.focus() }),
                                'To search the thesaurus for words or phrases, enter text beside the "Search" icon. Or, try these examples: ',
                                exampleSymbolNames.map (function (name, n) {
                                  return $('<span>')
                                    .append (n ? ', ' : undefined,
                                             wm.makeSymbolSpan ({ name: name},
                                                                function() {
                                                                  wm.loadGrammarSymbol ({ name: name })
                                                                }))
                                }),
                                $('<p>'),
                                wm.makeIconButton ('compose-tab', function() { wm.showComposePage() }),
                                'To write a message using synonyms from the thesaurus, tap the "Composer" icon.',
				exampleTemplatesSpan = $('<span>'),
                                $('<p>'),
                                wm.makeIconButton ('new', newSymbol),
                                'To add a new phrase to the thesaurus, tap the "New" icon.',
                                $('<p>'),
                                wm.makeHelpButton (wm.REST_getGrammarHelpHtml),
                                'For more help, tap the "Help" icon.'),
                       wm.cachedSymbols().map (wm.makeGrammarRuleDiv.bind (wm)))

	    wm.REST_getPlayerSuggestTemplates (wm.playerID)
              .then (function (result) {
                if (result && result.templates.length)
                  exampleTemplatesSpan.append (' Or, try one of these templates: ',
					       wm.ParseTree.nRandomElements (result.templates, nTemplateExamples)
					       .map (function (template, n) {
                                                 return $('<span>')
						   .append (n ? ', ' : undefined,
							    $('<a href="#">')
							    .text (template.title)
							    .on ('click', function (evt) {
							      evt.preventDefault()
                                                              wm.REST_getPlayerTemplate (wm.playerID, template.id)
								.then (function (templateResult) {
								  wm.showComposePage ({ title: template.title,
											template: templateResult.template,
											focus: 'playerSearchInput' }) }) }))
					       }))
              })

            wm.hideMenu = function() {
              $('.rulemenu').hide()
	      if (wm.modalExitDiv)
		wm.modalExitDiv.hide()
              wm.setUnfocusCallback()
            }
            wm.grammarBarDiv.append (wm.modalExitDiv = $('<div class="wikimess-modalexit">')
                                     .on ('click', wm.hideMenu)
                                     .hide())
          })
        })
    },

    addHelpIcons: function (div) {
      var wm = this
      var icons = div.find('span.helpicon')
      icons.each (function (n) {
        var iconSpan = icons.slice(n,n+1), iconName = iconSpan.attr('icon')
        wm.getIconPromise(wm.iconFilename[iconName])
          .done (function (svg) {
            svg = wm.colorizeIcon (svg, wm.themeInfo.iconColor)
            iconSpan.append ($(svg))
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
        this.REST_postPlayerSearchSymbolsAll (this.playerID, searchText, wm.symbolSearchResultsPerPage)
          .then (function (ret) {
            wm.symbolSearchResults = ret
            wm.showSymbolSearchResults()
          })
      }
    },

    continueSymbolSearch: function() {
      var wm = this
      if (this.searchInput.val() === this.lastSymbolSearch) {
        this.REST_postPlayerSearchSymbolsAll (this.playerID, this.lastSymbolSearch, wm.symbolSearchResultsPerPage, this.symbolSearchResults.page + 1)
          .then (function (ret) {
            wm.symbolSearchResults.symbols = wm.symbolSearchResults.symbols.concat (ret.symbols)
            wm.symbolSearchResults.more = ret.more
            wm.symbolSearchResults.page = ret.page
            wm.showSymbolSearchResults()
          })
      } else
        this.doSymbolSearch()
    },

    showSymbolSearchResults: function (initSearchInput) {
      if (initSearchInput)
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
      if (wm.playerID)
        wm.REST_getPlayerFollow (wm.playerID)
	.done (function (data) {
          if (wm.addressBookDiv)
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
      if (!wm.playerID) buttonDiv.hide()
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
        this.REST_postPlayerSearchPlayersAll (this.playerID, searchText.replace(playerChar,''))
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
