var WikiMess = (function() {
  var proto = function (config) {
    var wm = this
    config = config || {}

    // includes
    this.Bracery = window.bracery.Bracery
    this.BraceryTemplate = window.bracery.Template
    this.ParseTree = window.bracery.ParseTree
    this.VarsHelper = window.VarsHelper
    this.SvgSpriteCache = window.SvgSpriteCache
    
    // override bracery's default limits
    $.extend (this.ParseTree,
              { maxDepth: 100,
                maxRecursion: 3,
                maxReps: 10,
                maxLength: 280,
                maxNodes: 1000 })

    // HTML
    this.container = $('<div class="wikimess">')
    this.pageContainer = $('#'+this.containerID)
      .addClass("wikimess-page")
      .html (this.container)

    // localStorage
    this.localStorage = { playerLogin: undefined,
                          soundVolume: .5,
                          theme: 'plain',
                          messages: [] }
    try {
      var ls = JSON.parse (localStorage.getItem (this.localStorageKey))
      $.extend (this.localStorage, ls)
    } catch (err) {
      // do nothing
    }
    $.extend (this, this.localStorage)

    // Standalone mode
    this.standalone = config.standalone
    this.svg = config.svg || {}
    this.templates = (config.templateDefs && this.BraceryTemplate.parseTemplateDefs (config.templateDefs))
      || config.templates || []
    this.templates.forEach (function (t, id) {
      t.id = id
      t.author = {}
    })
    if (this.standalone) {
      this.braceryInstance = new this.Bracery ((config.symbolDefs && this.ParseTree.parseTextDefs (config.symbolDefs))
                                               || config.rules)
      config.action = this.messages.length ? 'message' : 'home'
      this.container.addClass ('standalone')
    }
    
    // sockets
    this.socket_onPlayer (this.handlePlayerMessage.bind (this))
    this.socket_onSymbol (this.handleSymbolMessage.bind (this))
    this.socket_onMessage (this.handleBroadcastMessage.bind (this))

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

    // initialize the swing Stack
    wm.stack = swing.Stack ({ throwOutConfidence: wm.throwOutConfidence,
			      throwOutDistance: function() { return wm.throwXOffset() },
			      allowedDirections: [
				swing.Direction.LEFT,
				swing.Direction.RIGHT,
				swing.Direction.UP,
				swing.Direction.DOWN
			      ],
                              isThrowOut: wm.isThrowOut.bind(wm) })

    $(document).on ('resize', wm.resizeListener.bind(wm))
    $(window).on ('resize', wm.resizeListener.bind(wm))
    
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
  var parseTree = window.bracery.ParseTree
  var symChar = '~', symCharHtml = '&#126;'
  var playerChar = '@', varChar = '$', funcChar = '&', leftBraceChar = '{', rightBraceChar = '}', leftSquareBraceChar = '[', rightSquareBraceChar = ']', pipeChar = '|', assignChar = '=', traceryChar = '#'
  $.extend (proto.prototype, {
    // default constants
    containerID: 'wikimess',
    localStorageKey: 'wikimess',
    facebookButtonImageUrl: '/images/facebook.png',
    facebookIntentPath: 'https://www.facebook.com/sharer/sharer.php',
    showFacebookLoginButton: false,
    twitterButtonImageUrl: '/images/twitter.png',
    twitterIntentPath: 'https://twitter.com/intent/tweet',
    twitterUsername: 'wikimessage',
    redirectToTwitterWheneverPossible: false,
    showTwitterLoginButton: true,
    reloadOnLogin: true,
    anonGuest: 'Anonymous guest',
    maxPlayerLoginLength: 15,
    maxPlayerNameLength: 32,
    bannerDelay: 2000,
    autosaveDelay: 5000,
    expansionAnimationDelay: 400,
    maxExpansionAnimationTime: 5000,
    symbolSearchResultsPerPage: 10,
    autosuggestDelay: 500,
    unfocusDelay: 1000,
    menuPopupDelay: 500,
    threadCardThrowDelay: 5,
    alwaysThrowInHelpCards: true,
    throwOutConfidenceThreshold: .25,
    previewConfidenceThreshold: .1,
    maxExpandCalls: 10,  // for recursive evaluations
    scrollButtonDelta: 2/3,  // proportion of visible page to scroll when scroll buttons pressed
    cardScrollTime: 2000,
    iconFilenameRegex: /^[\w\d\-_]+$/,
    iconFilename: { edit: 'quill',
                    backspace: 'backspace',
                    'new': 'copy',
                    create: 'circle-plus',
                    'copy to clipboard': 'clipboard-copy',
                    'delete': 'trash-can',
                    pin: 'pushpin',
                    unpin: 'no-pushpin',
                    plus: 'circle-plus',
                    minus: 'circle-minus',
                    up: 'up-arrow-button',
                    down: 'down-arrow-button',
                    swipe: 'one-finger-contact-swipe',
                    swipeleft: 'left-swipe-arrow',
                    swiperight: 'right-swipe-arrow',
                    help: 'help',
                    locked: 'padlock',
                    hide: 'hide',
                    reroll: 'rolling-die',
                    drawcard: 'card-draw',
                    dealcard: 'card-fall',
                    reject: 'thumb-down',
                    accept: 'thumb-up',
                    share: 'share-up',
                    close: 'close',
                    inbox: 'inbox',
                    outbox: 'outbox',
                    drafts: 'scroll-unfurled',
                    message: 'document',
                    follow: 'circle-plus',
                    unfollow: 'trash-can',
                    search: 'magnifying-glass',
                    compose: 'quill',
                    forward: 'up-card',
                    reply: 'right-arrow',
                    back: 'left-arrow',
                    next: 'clock-forwards',
                    previous: 'clock-backwards',
                    twitter: 'twitter',
                    reload: 'refresh',
                    dummy: 'dummy',
                    star: 'star-formation',
                    choice: 'uncertainty',
                    menu: 'menu',
                    minimize: 'up-arrow',
                    maximize: 'down-arrow' },
    
    themes: [ {style: 'plain', text: 'Plain' },
              {style: 'l33t', text: 'L33t' } ],

    tabs: [{ name: 'compose', method: 'showComposePage', label: 'composer', icon: 'card-hand', showBanner: true },
           { name: 'status', method: 'showStatusPage', label: 'news', icon: 'raven' },
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
	       stack: false,
               standalone: true },

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

    defaultStatusText: "Hang in there.",
    statusTitle: "Stats",
    tipTitle: "Handy Hints",
    tipSwipeHint: "Swipe left for more tips; swipe right to continue.",
    deleteDraftPrompt: "Delete draft and start a new thread?",
    resetThreadPrompt: "Reset and start a new thread?",
    emptyContentWarning: "Enter text here, or pick from the suggestions below. Add '" + symChar + "' before a word to insert a random synonym for that word, e.g. '" + symChar + "cat' or '" + symChar + "osculate'.",
    emptyTemplateWarning: "_The message will appear here._",
    reloadOnDisconnect: false,
    suppressDisconnectWarning: true,

    preloadSounds: ['error','select','login','logout','gamestart'],

    // REST API
    REST_getImagesIcons: function (icon) {
      // intercept with grunt-generated cache
      var ssc = this.SvgSpriteCache[icon]
      if (ssc)
        return $.Deferred().resolve (ssc)
      // do not log every icon GET
      return $.get ({ url: '/images/icons/' + icon + '.svg',
                      dataType: 'text' })
    },

    REST_loginFacebook: function() {
      window.location.replace ('/login/facebook')
    },

    REST_loginTwitter: function() {
      window.location.replace ('/login/twitter')
    },

    REST_loginTwitterAuth: function() {
      window.location.replace ('/login/twitter/auth')
    },

    REST_loginTwitterDeauth: function() {
      return this.logGet ('/login/twitter/deauth')
    },

    REST_makeAvatarURL: function (screenName, size) {
      return '/avatar/' + screenName + (size ? ('?size=' + size) : '')
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

    REST_getPlayerMessage: function (playerID, messageID) {
      return this.logGet ('/p/message/' + messageID)
    },

    REST_getPlayerMessageHeader: function (playerID, messageID) {
      return this.logGet ('/p/message/' + messageID + '/header')
    },

    REST_getPlayerMessageThread: function (playerID, messageID) {
      return this.logGet ('/p/message/' + messageID + '/thread')
    },

    REST_postPlayerMessage: function (playerID, message) {
      return this.logPost ('/p/message', message)
    },

    REST_deletePlayerMessage: function (playerID, messageID) {
      return this.logDelete ('/p/message/' + messageID)
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

    REST_postPlayerExpand: function (playerID, query) {
      return this.logPost ('/p/expand', query)
    },

    REST_getWelcomeHtml: function() {
      return this.wrapREST_getHtml ('welcome-guest')
    },

    REST_getComposeTipsHtml: function() {
      return this.wrapREST_getHtml ('message-compose-tips')
    },

    REST_getGrammarHelpHtml: function() {
      return this.wrapREST_getHtml ('grammar-editor-help')
    },

    REST_getPlayerSuggestTemplates: function (playerID) {
      return this.logGet ('/p/suggest/templates')
    },

    REST_getPlayerSuggestTemplatesBy: function (playerID, authorName) {
      return this.logGet ('/p/suggest/by/' + authorName)
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

    makeTweetUrl: function (tweeter, tweet) {
      return 'https://twitter.com/' + tweeter + '/status/' + tweet
    },

    makeTweeterUrl: function (tweeter) {
      return 'https://twitter.com/' + tweeter
    },

    redirectToTweeter: function (tweeter) {
      window.location.replace (this.makeTweeterUrl (tweeter))
    },

    redirectToTweet: function (tweeter, tweet) {
      window.location.replace (this.makeTweetUrl (tweeter, tweet))
    },

    openTweet: function (tweeter, tweet) {
      window.open (this.makeTweetUrl (tweeter, tweet))
    },

    // WebSockets interface
    socket_onPlayer: function (callback) {
      io.socket.on ('player', callback)
    },

    socket_onSymbol: function (callback) {
      io.socket.on ('symbol', callback)
    },

    socket_onMessage: function (callback) {
      io.socket.on ('message', callback)
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

    socket_getPlayerPublic: function (playerID) {
      return this.socketGetPromise ('/p/public')
    },

    socket_getPlayerPublicUnsubscribe: function (playerID) {
      return this.socketGetPromise ('/p/public/unsubscribe')
    },

    // helpers to log ajax calls
    logGet: function (url) {
      var wm = this
      if (wm.standalone)
        return $.Deferred().reject()
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
      if (wm.standalone)
        return $.Deferred().reject()
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
      if (wm.standalone)
        return $.Deferred().reject()
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
      if (wm.standalone)
        return $.Deferred().reject()
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
      if (wm.standalone)
        return $.Deferred().reject()
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
      if (wm.standalone)
        return $.Deferred().reject()
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

    // wrappers for AJAX calls that intercept the call when in standalone mode
    wrapREST_getHtml: function (stub) {
      if (this.standalone)
        return $.Deferred().resolve ($('#html-' + stub)).html()
      return this.logGet ('html/' + stub + '.html')
    },

    wrapREST_getPlayerSuggestTemplates: function (playerID) {
      if (this.standalone) {
        if (this.verbose.standalone)
          console.warn ('SuggestTemplates', wm.templates)
        return $.Deferred().resolve ({ templates: wm.templates })
      }
      return this.REST_getPlayerSuggestTemplates (playerID)
    },

    wrapREST_getPlayerSuggestReply: function (playerID, templateID, tags) {
      if (this.standalone) {
        var prevTemplate = this.templates[parseInt(templateID)]
        if (this.verbose.standalone)
          console.warn ('SuggestReply', prevTemplate, tags)
        return $.Deferred().resolve
      ({ template: this.BraceryTemplate.randomReplyTemplate (this.templates,
                                                             tags,
                                                             prevTemplate),
         more: true })
      }
      return this.REST_getPlayerSuggestReply (playerID, templateID, tags)
    },

    wrapREST_getPlayerTemplate: function (playerID, templateID) {
      if (this.standalone) {
        var template = this.templates[parseInt(templateID)]
        if (this.verbose.standalone)
          console.warn ('GetTemplate', template)
        return $.Deferred().resolve ({ template: template })
      }
      return this.REST_getPlayerTemplate (playerID, templateID)
    },

    wrapREST_postPlayerExpand: function (playerID, query) {
      var wm = this
      if (this.standalone)
        return wm.braceryInstance.expandParsed
      ({ parsedRhsText: query.content,
         vars: $.extend ({}, query.vars || this.defaultVarVal()),
         callback: true })
        .then (function (expansion) {
          if (wm.verbose.standalone)
            console.warn ('Expand', query, expansion)
          return { expansion: expansion }
        })
      return this.REST_postPlayerExpand (playerID, query)
    },

    wrapREST_postPlayerMessage: function (playerID, message) {
      if (this.standalone) {
        var lastMessage = typeof(message.previous) !== 'undefined' && this.messages[parseInt (message.previous)]
        var storedMessage = $.extend ({},
                                      message,
                                      { id: this.messages.length,
                                        vars: (lastMessage
                                               ? this.nextVarVal ({ node: lastMessage.body,
                                                                    initVarVal: lastMessage.vars,
					                            makeSymbolName: this.makeSymbolName.bind (this) })
                                               : this.defaultVarVal()),
                                        date: Date.now() })
        if (this.verbose.standalone)
          console.warn ('PostMessage', storedMessage)
        this.messages.push (storedMessage)
        this.writeLocalStorage ('messages')
        return $.Deferred().resolve ({ message: storedMessage })
      }
      return this.REST_postPlayerMessage (playerID, message)
    },

    wrapREST_getPlayerMessage: function (playerID, messageID) {
      if (this.standalone) {
        var message = this.messages[parseInt(messageID)]
        if (this.verbose.standalone)
          console.warn ('GetMessage', message)
        return $.Deferred().resolve ({ message: message })
      }
      return this.REST_getPlayerMessage (playerID, messageID)
    },

    wrapREST_getPlayerMessageThread: function (playerID, messageID) {
      if (this.standalone) {
        if (this.verbose.standalone)
          console.warn ('Thread', this.messages)
        return $.Deferred().resolve ({ thread: this.messages })
      }
      return this.REST_getPlayerMessageThread (playerID, messageID)
    },

    // helpers
    isTouchDevice: function() {
      return 'ontouchstart' in document.documentElement
    },

    useThrowAnimations: function() {
      return this.isTouchDevice()
    },
    
    throwXOffset: function() {
      return this.container.width() * 2 / 3
    },

    throwYOffset: function() {
      return this.container.height() / 4
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

	  var socialMediaPane = $('<span class="listitem noborder">')
	  if (wm.showFacebookLoginButton)
	    socialMediaPane.append (wm.makeImageLink (wm.facebookButtonImageUrl, wm.REST_loginFacebook))
	  if (wm.showTwitterLoginButton)
            socialMediaPane.append (wm.makeImageLink (wm.twitterButtonImageUrl, wm.REST_loginTwitter))

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
                                       socialMediaPane,
                                       wm.makeListLink ('Play as Guest', wm.continueAsGuest))))
          if (wm.playerLogin)
            wm.nameInput.val (wm.playerLogin)
        })
    },

    stripLeadingAndTrailingWhitespace: function (text) {
      return text ? text.replace(/^\s*/,'').replace(/\s*$/,'') : text
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
              if (wm.reloadOnLogin)  // socket_getPlayerSubscribe doesn't seem to work here, so reload as a kludge...
                window.location.reload()
              else {
                wm.initPlayerInfo (data.player)
                return wm.socket_getPlayerSubscribe (wm.playerID)
                  .then (function() {
                    showNextPage.call(wm)
                  }).fail (function (err) {
                    console.error('subscribe failed', err)
                    showNextPage.call(wm)
                  })
              }
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
      this.showModalMessage ((err.responseJSON && err.responseJSON.error) || (err.status && (err.status + " " + err.statusText)) || JSON.stringify(err), sfx, callback)
    },

    reloadOnFail: function() {
      var wm = this
      return function (err) {
        wm.showModalWebError (err, wm.reloadCurrentTab.bind(wm))
      }
    },
    
    reloadCurrentTab: function() {
      delete this.lastSavePromise  // prevent stalling on error
      return this[this.currentTab.method] ()
    },

    showNavBar: function (newTab, redraw) {
      var wm = this

      if (this.currentTab && this.currentTab.name === newTab) {
        // avoid redrawing the navbar, which causes a flicker
        this.container.children(':not(.navbar)').remove()
        return
      }
        
      if (!this.navbar)
        this.navbar = $('<div class="navbar">')
      this.container.html (this.navbar)

      this.drawNavBar (newTab)
    },

    drawNavBar: function (newTab) {
      var wm = this
      var navbar = this.navbar

      navbar.empty().append (this.banner = $('<div class="banner">'))

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
            span.append ($('<div>').addClass('navlabel').text(tab.label || tab.name),
                         $(svg).addClass('navicon'))
	    if (isMailbox)
	      span.append (wm.messageCountDiv)
          })
          .fail (function (err) {
            console.log(err)
          })
        if (tab.name === newTab) {
          wm.currentTab = tab
          span.addClass('active')
        }
        span.on ('click', wm.callWithSoundEffect (function() {
          wm.pushedViews = []
          wm[tab.method]()
        }))
        navbar.append (span)
      })

      function hideBanner (evt) {
        evt.stopPropagation()
        wm.banner.removeClass ('active')
        wm.setBannerTimer (true)
      }
      if (this.currentTab.showBanner && !this.banner.hasClass('active')) {
        this.setBannerTimer (true)
        this.banner.on ('click', hideBanner)
        if (!this.isTouchDevice())
          this.banner.on ('mouseover', hideBanner)
      } else {
        this.setBannerTimer (false)
        this.banner.off ('click')
        this.banner.off ('mouseover')
      }
    },

    setBannerTimer: function (active) {
      var wm = this
      if (this.bannerTimer) {
        clearTimeout (this.bannerTimer)
        delete this.bannerTimer
      }
      if (active)
        this.bannerTimer = setTimeout (function() {
          delete wm.bannerTimer
          wm.banner.addClass ('active')
        }, wm.bannerDelay)
    },
    
    getIconPromise: function (icon) {
      if (!this.iconPromise[icon])
        this.iconPromise[icon] = this.svg[icon] ? $.Deferred().resolve(this.svg[icon]) : this.REST_getImagesIcons (icon)
      return this.iconPromise[icon]
    },

    placeIcon: function(icon,container) {
      this.getIconPromise(icon).done (function (svg) {
        container.html(svg)
      })
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
                            wm.makeListLink ('Bio', wm.showPlayerBioPage),
                            wm.makeListLink ('Broadcasts', wm.showBroadcastConfigPage))
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

          var passwordForm
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
                              passwordForm = $('<div class="inputbar">')
                              .append ($('<form>')
                                       .append ($('<span>').text('Old password'),
                                                wm.oldPasswordInput = $('<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" type="password">'),
                                                $('<span>').text('New password'),
                                                wm.changePasswordInput = $('<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" type="password">'),
                                                $('<span>').text('New password (confirm)'),
                                                wm.confirmPasswordInput = $('<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" type="password">')))))
            .append (backBar)

          if (wm.playerInfo.hidePassword)
            passwordForm.hide()
        })
    },

    
    // settings
    showBroadcastConfigPage: function() {
      var wm = this
      return this.pushView ('twitter')
        .then (function() {
          var backBar = wm.popBack()
	  var twitterConfigDiv = $('<div class="menubar">')
          var pinnedMessageDiv = $('<div class="contents">'), broadcastIntervalDiv = $('<div>')
          var broadcastDiv
          wm.container.append (broadcastDiv = $('<div>')
                               .append ($('<div class="mailbox pinned">').append (pinnedMessageDiv),
                                       broadcastIntervalDiv),
                               twitterConfigDiv,
                               backBar)
	  function buildPage() {
	    var avatarDiv = $('<div class="avatar">'),
		screenNameSpan = $('<span class="tweep">'),
		helpSpan = $('<span class="twithelp">')
	    if (wm.playerInfo.twitterAuthorized) {
	      wm.addAvatarImage ({ div: avatarDiv,
                                   avatar: wm.playerInfo.avatar,
                                   tweeter: wm.playerInfo.twitterScreenName })
	      screenNameSpan.text ('@' + wm.playerInfo.twitterScreenName)
	    } else
	      helpSpan.text ('If you link your Twitter account, Wiki Messenger can tweet for you.')
	    twitterConfigDiv
	      .empty()
	      .append (avatarDiv,
		       screenNameSpan,
		       helpSpan,
		       $('<div class="list">')
		       .append ((wm.player && wm.playerInfo.twitterAuthorized)
				? wm.makeListLink('Unlink Twitter account',function() {
				  wm.REST_loginTwitterDeauth().then (function() {
				    delete wm.playerInfo.twitterScreenName
				    delete wm.playerInfo.twitterAuthorized
				    buildPage()
				  }) })
				: wm.makeListLink('Link Twitter account',wm.REST_loginTwitterAuth)))
            var pinnedMessageID = wm.playerInfo.botMessage
            if (pinnedMessageID)
              wm.REST_getPlayerMessage (wm.playerID, pinnedMessageID)
              .then (function (result) {
                broadcastDiv.prepend ($('<span>').text ('Pinned message:'))
                pinnedMessageDiv.append (wm.makeMailboxEntryDiv (wm.outboxProps(), result.message))
                broadcastIntervalDiv.append (wm.makeConfigMenu ({ id: 'botInterval',
                                                                  opts: [//{ text: "Update each second", value: 'second' },
                                                                         //{ text: "Update each minute", value: 'minute' },
                                                                         { text: "Update hourly", value: 'hour' },
                                                                         { text: "Update daily", value: 'day' },
                                                                         { text: "Never update", value: 'never' }] }))
                var oldBotInterval = wm.playerInfo.botInterval
                function saveChanges() {
                  if (oldBotInterval !== wm.playerInfo.botInterval)
                    return wm.REST_postPlayerConfig (wm.playerID, { botInterval: wm.playerInfo.botInterval })
                  return $.Deferred().resolve()
                }
                wm.pageExit = saveChanges
              })
	  }

	  buildPage()
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
                                                            opts: [{ text: "Anyone can direct-message me", value: false },
                                                                   { text: "Only people in my address book", value: true }] }),
                                       wm.makeConfigMenu ({ id: 'createsPublicTemplates',
                                                            opts: [{ text: "Others can post using my templates", value: true },
                                                                   { text: "Only I can re-use my templates", value: false }] })),
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
        if (config.reload)
          wm.redrawPopBack()
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

    viewElements: function() {
      return this.container.find(':not(.pushed)').filter(':not(.navbar,.navlabelspace)')
        .filter (function() { return $(this).parents('.navbar,.navlabelspace').length === 0})
    },

    pushView: function (newPage) {
      var elements = this.viewElements()
      if (this.verbose.page)
	console.log ("Pushing " + this.page + " view, going to " + newPage)
      var page = this.page
      this.pushedViews.push ({ elements: elements,
                               page: page,
                               suspend: this.pageSuspend,
                               resume: this.pageResume,
                               exit: this.pageExit,
                               subnavbar: this.subnavbar,
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
          wm.subnavbar = poppedView.subnavbar
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
          wm.pageExit = function() {
            delete wm.nextDealPromise
          }
          wm.nextDealPromise = $.Deferred()

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
          
          var markForSave = wm.markForSave.bind (wm)

          function makeMessageHeaderInput (className, placeholderText, compositionAttrName, controlName, lowercase, changeCallback) {
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
		if (changeCallback)
		  changeCallback()
              }).on ('change', markForSave)
          }

          wm.composition.previousTemplate = config.previousTemplate || wm.composition.previousTemplate
          if (config.template) {
            wm.updateMessageHeader (config.template)
            delete wm.composition.randomTemplate
          }
          wm.composition.template = wm.composition.template || {}
          wm.composition.template = config.template || wm.composition.template || {}
          wm.composition.template.content = wm.composition.template.content || []

          wm.composition.vars = config.vars || wm.composition.vars || {}

          if (config.clearThread) {
            wm.composition.thread = null
            delete wm.composition.threadDiscards
            delete wm.composition.threadTweeter
            delete wm.composition.threadTweet
          } else {
            if (config.thread) {
              wm.composition.thread = config.thread
              wm.composition.threadDiscards = config.threadDiscards || []
            } else
              wm.composition.threadDiscards = config.threadDiscards || wm.composition.threadDiscards || []
            wm.composition.threadTweeter = config.threadTweeter || wm.composition.threadTweeter
            wm.composition.threadTweet = config.threadTweet || wm.composition.threadTweet
          }
          
          makeMessageHeaderInput ('title', 'Untitled', 'title', 'messageTitleInput', false, wm.updateMessageTitle.bind(wm))
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
            input.focus()  // in case we were triggered by player hitting 'reject' button
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
                if (!wm.standalone)
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
                  if (!wm.standalone)
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
                  wm.markForSave()
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
              if (!wm.standalone)
                wm.populateSuggestions (wm.REST_postPlayerSuggestSymbol (wm.playerID, before, [], wm.autosuggestStatus.temperature),
                                        function (symbol, wrappedFuncs) {
                                          // prepend a space only if we're nonempty & don't already end in a space
                                          var content = wm.composition.template.content, lastTok = content.length && content[content.length-1]
                                          var spacer = (lastTok && !(typeof(lastTok) === 'string' && lastTok.match(/\s$/))) ? [' '] : []
                                          wm.updateComposeContent (content.concat (spacer.concat ([wrapNode ({ type: 'sym',
                                                                                                               id: symbol.id,
                                                                                                               name: symbol.name },
                                                                                                             wrappedFuncs)])))
                                          delete wm.composition.randomTemplate
                                          wm.markForSave()
                                          wm.updateComposeDiv()
                                          var generatePromise =
                                              (wm.animationExpansion
                                               ? wm.getSymbolExpansion (symbol.id, wm.compositionFinalVarVal())
                                               .then (function (result) {
                                                 wm.updateAvatarDiv()
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
                      while (wm.ParseTree.stripFooter(newContent).length) {
                        var popIndex = newContent.length - 1
                        while (popIndex > 0 && typeof(newContent[popIndex]) === 'object' && newContent[popIndex].footer)
                          --popIndex
                        var popSym = newContent[popIndex]
                        newContent.splice (popIndex, 1)
                        ++nSymPopped
                        if (typeof(popSym) === 'object'
                            || popSym.match(/\S/))
                          break
                      }
                      wm.updateComposeContent (newContent)
                      delete wm.composition.randomTemplate
                      wm.markForSave()
                      wm.updateComposeDiv()
                      wm.generateMessageBody()
                      wm.divAutosuggest()
                    }
                    wm.suggestionDiv.append (wm.makeIconButton ('backspace', backspace))
                    wm.restoreScrolling (wm.suggestionDiv)
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
                           + '?text=' + encodeURIComponent(info.text)
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
            wm.messageBodyDiv.css('user-select','text')
            var range = document.createRange()
            range.selectNode (wm.messageBodyDiv[0])
            window.getSelection().removeAllRanges()
            window.getSelection().addRange (range)
            document.execCommand ("copy")
            wm.messageBodyDiv.css('user-select','none')
            window.alert ('Message copied to clipboard')
            wm.sharePane.hide()
          }
          
          // send message with callback to share method (e.g. tweet intent)
          function makeSendFunction (config) {
            config = config || {}
            var shareCallback = config.callback
            var preserveMessage = config.preserve
            var previousMessage = wm.composition.previousMessage
            var recipient
            return function (sendConfig) {
              sendConfig = $.extend ({}, config, sendConfig || {})
              wm.sharePane.find('*').off('click')
              wm.modalExitDiv.show()
              wm.saveCurrentEdit()
                .then (function() {
                  var sent = false
                    var expansionText, expansionTextMatch
                    if (wm.templateIsEmpty())
                      window.alert ("Please enter some input text.")
                    else if (!(wm.composition.body && (expansionTextMatch = (expansionText = wm.makeExpansionText ({ node: wm.composition.body, vars: wm.compositionVarVal() })).match(/\S/))))
                      window.alert ("Expanded text is empty. Please vary the input text, or hit 'reject' to generate a new random expanded text.")
                    else if (wm.composition.isPrivate && !wm.composition.recipient)
                      window.alert ("Please select the direct message recipient, or make it public.")
                    else {
                      sent = true
                      wm.shareButton.off ('click')
                      wm.acceptButton.off ('click')
                      delete wm.composition.previousTemplate

                      var fadePromise
                      if (sendConfig.fade)
                        fadePromise = wm.fadeCard (sendConfig.cardDiv || wm.currentCardDiv, sendConfig.card || wm.currentCard)
                      else
                        fadePromise = $.Deferred().resolve()
                      recipient = wm.composition.isPrivate ? wm.composition.recipient.id : null

                      wm.composition.template.content = wm.ParseTree.addFooter (wm.composition.template.content)

                      var composition = sendConfig.reject ? wm.composition.preview.reject : wm.composition.preview.accept
                      $.extend (wm.composition.template, composition.template)
                      $.extend (wm.composition.body, composition.body)
                      wm.wrapREST_postPlayerMessage (wm.playerID,
                                                     { recipient: recipient,
                                                       template: wm.composition.template,
                                                       title: wm.composition.title || '',
                                                       body: wm.composition.body,
                                                       previous: wm.composition.previousMessage,
                                                       tags: wm.composition.tags,
                                                       previousTags: wm.composition.previousTags,
                                                       draft: wm.composition.draft,
                                                       isPublic: wm.playerID === null || (wm.playerInfo && wm.playerInfo.createsPublicTemplates) })
                        .then (function (result) {
                          delete wm.composition.previousMessage
                          return fadePromise.then (function() {
                            if (shareCallback)
                              shareCallback ({ url: (result.tweet
                                                     ? wm.makeTweetUrl (result.tweet)
                                                     : (result.message && result.message.path
                                                        ? (window.location.origin + result.message.path)
                                                        : undefined)),
                                               title: wm.composition.title,
                                               text: wm.makeExpansionText ({ node: wm.composition.body,
                                                                             vars: wm.compositionVarVal() }) })
                            else if (result.message.tweet && wm.redirectToTwitterWheneverPossible)
                              wm.redirectToTweet (result.message.tweeter, result.message.tweet)
                            return result
                          })
                        }).then (function (result) {
                          if (preserveMessage) {
                            wm.sharePane.hide()
                            wm.shareButton.on ('click', toggleSharePane)
                          } else {
                            wm.composition = {}  // delete the composition after sending
                            delete wm.mailboxCache.outbox   // TODO: update wm.mailboxCache.outbox
                            function updateMailboxCache() {
                              Object.keys (wm.mailboxCache)
                                .forEach (function (cacheName) {
                                  if (wm.mailboxCache[cacheName][previousMessage])
                                    wm.mailboxCache[cacheName][previousMessage].next = (wm.mailboxCache[cacheName][previousMessage].next || []).concat (result.message.id)
                                })
                            }
                            if (!recipient)
                              return wm.wrapREST_getPlayerMessage (wm.playerID, result.message.id)
                              .then (function (result) {
                                result.message.justPosted = true
                                return wm.replyToMessage ({ message: result.message,
                                                            thread: [result.message] })
                              })
                            return (wm.playerID
                                    ? wm.showMailboxPage ({ tab: 'outbox' })
                                    : wm.showStatusPage())
                              .then (updateMailboxCache)
                          }
                        }).catch (function (err) {
                          console.error ('message send error', err)
                          wm.reloadCurrentTab()
                          // wm.showModalWebError (err, wm.reloadCurrentTab.bind(wm))
                        })
                      }
                  if (!sent) {
                    updateSharePane()
                    wm.sharePane.hide()
                    wm.currentCardDiv.remove()
                    wm.dealCard()
                  }
                })
            }
          }

          function makeSendHandler (config) {
            var send = makeSendFunction (config)
            return function (evt) {
              if (evt) {
                evt.stopPropagation()
                evt.preventDefault()
              }
              send()
            }
          }

          function toggleSharePane() {
            wm.showingHelp = false
            wm.infoPane.hide()
	    wm.sharePane.toggle()
          }
          
          function updateSharePane() {
            wm.sendMessage = makeSendFunction()
            wm.sharePane
              .empty()
              .append (wm.makeImageLink (wm.facebookButtonImageUrl, makeSendHandler ({ fade: true, callback: facebookIntent }), undefined, true).addClass('big-button'),
                       wm.makeImageLink (wm.twitterButtonImageUrl, makeSendHandler ({ fade: true, callback: tweetIntent }), undefined, true).addClass('big-button'),
                       wm.makeIconButton ('copy to clipboard', copyToClipboard).addClass('big-button'))
          }

          // build the actual compose page UI
          wm.initInfoPane()
          wm.headerToggler = wm.makeToggler ({ hidden: !wm.headerToggler || wm.headerToggler.hidden,
                                               showIcon: 'edit',
                                               hideIcon: 'edit',
				               hideCallback: function() {
                                                 if (wm.messageBodyDiv)
                                                   wm.messageBorderDiv.removeClass('small').addClass('big')
                                               },
				               showCallback: function() {
                                                 if (wm.messageBodyDiv)
                                                   wm.messageBorderDiv.removeClass('big').addClass('small')
                                                 // uncomment next line to automatically start editing template when 'edit' is pressed
                                                 // wm.messageComposeDiv.trigger ('click')
                                               } })

          var pubTab, privTab
          var titleRow, tagsRow, prevTagsRow, templateRow, suggestRow
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
                                       .append('Template text',
					       wm.makeSubNavIcon ('delete', function (evt) {
						 evt.stopPropagation()
						 wm.fadeAndDeleteDraft (wm.currentCardDiv, wm.currentCard) ()
					       })),
                                       wm.messageComposeDiv,
                                       suggestRow = $('<div class="sectiontitle suggestsectiontitle">')
                                       .text('Suggestions'),
                                       wm.suggestionDiv = $('<div class="suggest">')),
                              wm.messageBorderDiv = $('<div class="messageborder">')
                              .append (wm.stackDiv = $('<div class="stack">'),
                                       wm.meterSizeReference = $('<div class="meter meter-size-reference">'),
                                       wm.makeThrowArrowContainer ({ leftText: 'reject',
                                                                     rightText: 'accept' }))),
                     wm.infoPane,
                     wm.subnavbar = $('<div class="subnavbar">').append
                     (wm.rejectButton = wm.makeSubNavIcon ({ iconName: 'reject',
                                                             text: 'reject',
                                                             callback: function (evt) {
                                                               evt.stopPropagation()
                                                               wm.rejectCurrentCard()
                                                             } }),
                      wm.threadPrevButton = wm.makeSubNavIcon ({ iconName: 'previous',
                                                                 callback: function (evt) {
                                                                   evt.stopPropagation()
                                                                   wm.dealInertCard()
                                                                 } }).addClass('threadshow'),
                      wm.resetButton = wm.makeSubNavIcon ({ iconName: 'delete',
                                                            text: 'reset',
                                                            callback: function (evt) {
			                                      evt.stopPropagation()
			                                      wm.fadeAndResetThread()
		                                            } }).addClass('threadshow'),
                      wm.headerToggler.showButton,
                      wm.headerToggler.hideButton,
                      wm.tipButton = wm.makeTipButton().addClass('threadshow'),
                      $('<div class="sharepanecontainer">')
                      .append (wm.sharePane = $('<div class="sharepane">').hide(),
                               wm.shareButton = wm.makeSubNavIcon ({ iconName: 'share',
								     text: 'share',
								     callback: toggleSharePane }).addClass('sharepanebutton')),
                      wm.threadNextButton = wm.makeSubNavIcon ({ iconName: 'next',
                                                                 callback: function (evt) {
                                                                   evt.stopPropagation()
                                                                   wm.discardInertCard()
                                                                 } }).addClass('threadonly'),
                      wm.acceptButton = wm.makeSubNavIcon ({ iconName: 'accept',
                                                             text: 'accept',
                                                                callback: function (evt) {
                                                                  evt.stopPropagation()
                                                                  wm.acceptCurrentCard()
                                                                } }),
                      wm.modalExitDiv = $('<div class="wikimess-modalexit">').hide()))

          updateSharePane()
          wm.headerToggler.init ([titleRow, tagsRow, prevTagsRow, templateRow, wm.messageComposeDiv, suggestRow, wm.suggestionDiv])

          if (wm.composition.thread && wm.composition.thread.length)
            wm.setComposeInertMode()
          else
            wm.setComposeCardMode()

          if (config.recipient) {
            wm.composition.recipient = config.recipient
            wm.composition.isPrivate = (wm.playerID !== null && config.recipient !== null && !config.defaultToPublic)
            wm.lastComposePlayerSearchText = playerChar + config.recipient.name
          }

          if (!wm.playerID) {
            pubTab.click()
            wm.messagePrivacyDiv.hide()
            wm.messageRecipientDiv.hide()
          } else {
            if (wm.composition.isPrivate)
              privTab.click()
            else
              pubTab.click()
          }

          if (wm.standalone) {
            wm.headerToggler.showButton.hide()
            wm.headerToggler.hideButton.hide()
            wm.tipButton.hide()
          } else
            wm.resetButton.hide()
          
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
	  else if (wm.composition.thread && wm.composition.thread.length) {
	    var lastMessage = wm.composition.thread[0]
	    wm.composition.title = config.title || wm.replyTitle (lastMessage.title)
	    wm.composition.previousMessage = config.previousMessage || lastMessage.id
	    wm.composition.previousTemplate = config.previousTemplate || lastMessage.template
	  }

          if (config.draft)
            wm.composition.draft = config.draft

          wm.rejectButton.css('display','')
          
          var getRandomTemplate, generateNewContent
          if (config.body && config.body.rhs && !wm.ParseTree.parseTreeEmpty (config.body.rhs))
            wm.composition.body = config.body
          else if (config.generateNewContent || config.template)
            generateNewContent = true
          else if (config.getRandomTemplate || !(wm.composition.body && wm.composition.body.rhs && !wm.ParseTree.parseTreeEmpty (wm.composition.body.rhs)))
            getRandomTemplate = true

          if (config.focus || config.click || config.showHeader)
            wm.headerToggler.show()
          if (config.focus)
            wm[config.focus].focus().trigger ('click')
          if (config.click)
            wm[config.click].trigger ('click')

	  if (getRandomTemplate)
	    wm.composition.randomTemplate = true
          wm.composition.randomTemplateAuthor = config.author
          
          var dealConfig = { generate: getRandomTemplate || generateNewContent,
                             useCurrentTemplate: !getRandomTemplate,
			     noThrowIn: !(getRandomTemplate || generateNewContent) }

          if (config.showHelpCard) {
            wm.headerToggler.hide()
	    wm.setComposeHelpMode()
            var card
            var cardDiv = $('<div class="helpcard">')
                .append ($('<p>')
                         .append ($('<strong>').text('Swipe cards left'),
                                  $('<br>'),
                                  $('<em>').text('to reject them')),
                         $('<p>')
                         .append ($('<strong>').text('Swipe cards right'),
                                  $('<br>'),
                                  $('<em>').text('to accept them')),
                         $('<p>')
                         .append ($('<a href="#">')
                                  .html ($('<strong>').text('Remove this card'))
                                  .on ('click', function (evt) {
				    evt.preventDefault()
                                    card.throwOut (-wm.throwXOffset(), wm.throwYOffset())
                                  }),
                                  $('<br>'),
                                  $('<em>').text('to begin')))
	    wm.addToStack (cardDiv)
            // create the swing card object for the initial help card
            card = wm.stack.createCard (cardDiv[0])
            function swipe() {
              wm.fadeAndDealCard (cardDiv, card, dealConfig)
                .then (wm.clearComposeHelpMode.bind (wm))
                .then (wm.divAutosuggest)
            }
            card.on ('throwout', swipe)
            wm.stopDrag()
	    if (wm.useThrowAnimations() || wm.alwaysThrowInHelpCards) {
              wm.startThrow()
              card.throwIn (0, -wm.throwYOffset())
            }
          } else {
            var dealPromise
	    if (wm.threadHasNextMessage())
	      dealPromise = $.Deferred().resolve()
	    else {
	      if (wm.composition.thread && wm.composition.thread.length) {
		var lastMessage = wm.composition.thread[0]
		dealConfig.title = config.title || wm.replyTitle (lastMessage.title)
		dealConfig.previousMessage = config.previousMessage || lastMessage.id
		dealConfig.previousTemplate = config.previousTemplate || lastMessage.template
	      }
	      dealPromise = wm.dealCard (dealConfig)
	    }
	    
            return dealPromise
              .then (function() {
                wm.divAutosuggest()
                if (wm.composition.thread && wm.composition.thread.length) {
                  var throwers = wm.composition.thread.map (function (msg) {
                    return wm.makeInertCardPromiser ({ message: msg,
                                                       noThrowIn: dealConfig.noThrowIn }) })
                  var allDealt = throwers.reduce (function (promise, thrower) {
                    return promise.then (function() {
                      var def = $.Deferred()
                      window.setTimeout (function() {
			thrower()  // discard result of this promise, we don't need to wait for each card's throw animation to finish
                        def.resolve()
                      }, wm.threadCardThrowDelay)
                      return def
                    })
                  }, $.Deferred().resolve())
                  
                  wm.setComposeInertMode()
                  return allDealt
                }
              })
          }
        })
      // end of showComposePage
    },

    makeInertCardPromiser: function (config) {
      var wm = this
      var message = config.message
      var promise = $.Deferred()
      var cardDiv = wm.makeMessageCardDiv ({ message: message,
                                             sender: message.sender,
                                             recipient: message.recipient })
      cardDiv.removeClass('card').addClass('inertcard')
      wm.addToStack (cardDiv)

      // create the swing card object for the thread message card
      var card = wm.stack.createCard (cardDiv[0])
      cardDiv[0].swingCardObject = card  // HACK: allows us to retrieve the card object from the DOM, without messing around tracking all the cards
      var fadeInert = wm.fadeInertCard.bind (wm, card, cardDiv)
      var toMailbox = (!wm.standalone && wm.playerID && ((message.sender && message.sender.id === wm.playerID)
                                                         || (message.recipient && message.recipient.id === wm.playerID))
                       ? wm.fadeInertToMailbox.bind (wm, card, cardDiv, message)
                       : fadeInert)
      card.on ('throwoutleft', fadeInert)
      card.on ('throwoutright', fadeInert)
      card.on ('throwoutup', toMailbox)
      card.on ('throwoutdown', toMailbox)
      card.on ('dragstart', function() {
        wm.startDrag (cardDiv)
      })
      card.on ('throwinend', function() {
        wm.stopDrag (cardDiv)
        promise.resolve()
      })
      card.on ('dragmove', wm.dragListener.bind (wm, false))
      card.on ('dragend', function() {
        wm.throwArrowContainer.removeClass('dragging').addClass('throwing')
        cardDiv.removeClass('dragging').addClass('throwing')
      })

      var cardThrowOffset = (wm.isRejectMessage (message) ? -1 : +1) * wm.throwXOffset()

      var setThrowOutTimer = function() {
        if (message.justPosted) {
          message.justPosted = false
          window.setTimeout (function() {
            if (wm.stackDiv.children().last()[0] === cardDiv[0] && !cardDiv.hasClass('dragging')) {
              if (!wm.useThrowAnimations() || config.noThrowIn)
                wm.fadeInertCard (card, cardDiv)
              else
                card.throwOut (cardThrowOffset, 0)
            }
          }, 800)
        }
      }
      
      function throwIn() {
        cardDiv.show()
        if (!wm.useThrowAnimations() || config.noThrowIn) {
          setThrowOutTimer()
          return $.Deferred().resolve()
        }
        wm.startThrow (cardDiv)
        
	card.throwIn (0, -wm.throwYOffset())
        return promise.then (setThrowOutTimer)
      }

      cardDiv.hide()
      return throwIn
    },

    isRejectMessage: function (message) {
      var wm = this
      var isReject
      if (message.body && message.body.rhs && message.body.rhs.length) {
        var lastNode = message.body.rhs[message.body.rhs.length - 1]
        isReject = wm.ParseTree.isEvalVar(lastNode) && wm.ParseTree.getEvalVar(lastNode) === 'reject'
      }
      return isReject
    },
    
    makeThrowArrowContainer: function (config) {
      var wm = this
      wm.leftThrowArrow = $('<div class="arrowplustext">')
      wm.rightThrowArrow = $('<div class="arrowplustext">')
      var hand = $('<div class="hand">')
      wm.throwArrowContainer = $('<div class="arrowcontainer">')
        .append ($('<div class="arrowstripe leftarrowstripe">')
                 .append (wm.leftThrowArrow
                          .append ($('<div class="arrow">').html (wm.makeIconButton ('swipeleft', null, '#222')),
                                   $('<div class="text">').text (config.leftText))),
                 $('<div class="arrowstripe">')
                 .html (hand.html (wm.makeIconButton ('swipe'))),
                 $('<div class="arrowstripe rightarrowstripe">')
                 .append (wm.rightThrowArrow
                          .append ($('<div class="arrow">').html (wm.makeIconButton ('swiperight', null, '#222')),
                                   $('<div class="text">').text (config.rightText))))
      return wm.throwArrowContainer
    },

    setThrowArrowText: function (leftText, rightText) {
      $('.leftarrowstripe .text').text (leftText)
      $('.rightarrowstripe .text').text (rightText || leftText)
    },
    
    throwOutConfidence: function (xOffset, yOffset, element) {
      return Math.min (Math.max (Math.abs(xOffset) / element.offsetWidth, Math.abs(yOffset) / element.offsetHeight), 1)
    },

    isThrowOut: function (xOffset, yOffset, element, throwOutConfidence) {
      var wm = this
      var throwOut = throwOutConfidence > wm.throwOutConfidenceThreshold
      return throwOut
    },

    tipSwipeHintSpan: function() {
      return $('<span class="tipswipehint">').text (this.tipSwipeHint)
    },
    
    dealStatusCard: function() {
      var wm = this
      var vars = wm.compositionFinalVarVal()
      var meterDivPromises = wm.makeMeterDivPromises (vars, wm.meterSizeReference.height(), true)
      var gotMeters = !!meterDivPromises.length
      var gotStatus = wm.ParseTree.isTruthy (vars['status'])
      if (!gotStatus && !gotMeters)
        return wm.dealTipCard()
      var metersDiv = $('<div class="meters">')
      var statusDiv = $('<div>').append ($('<div class="sectiontitle tiptitle">').append ($('<span>').text (wm.statusTitle)),
                                         metersDiv)
      meterDivPromises.reduce (function (done, meterDivPromise) {
        return done.then (function() {
          return meterDivPromise.then (function (meterDiv) {
            metersDiv.append (meterDiv)
          })
        })
      }, $.Deferred().resolve())
        .then (function() {
          statusDiv.append ($('<span class="statustext">').text (gotStatus ? wm.getContentExpansionWithoutSymbols (vars.status, vars) : wm.defaultStatusText))
          statusDiv.append (wm.tipSwipeHintSpan())
          wm.dealHelpCard (statusDiv)
        })
    },

    dealTipCard: function() {
      var wm = this
      var helpPromise
      if (wm.helpHtml)
	helpPromise = $.Deferred().resolve()
      else
	helpPromise = wm.REST_getComposeTipsHtml()
	.then (function (result) {
	  var html = result.replace (/PHRASE/g, function() { return symCharHtml })
	  wm.helpHtml = $.parseHTML(html).filter (function (elt) { return elt.tagName === 'DIV' })   // yuck
	  wm.addHelpIcons ($(wm.helpHtml))
	})
      helpPromise.then (function() {
        var cardDiv = $('<div>').append ($('<div class="sectiontitle tiptitle">').append ($('<span>').text (wm.tipTitle)),
                                         $(wm.helpHtml[0]).addClass('tiptext').removeAttr('style'),
                                         wm.tipSwipeHintSpan())
        wm.helpHtml = wm.helpHtml.slice(1).concat (wm.helpHtml[0])  // rotate through help tips
        wm.dealHelpCard (cardDiv)
      })
    },
  
    dealHelpCard: function (cardDiv) {
      var wm = this
      cardDiv.removeClass('helpcard').addClass('helpcard')
      wm.addToStack (cardDiv)
      // create the swing card object for the random help card
      var card = wm.stack.createCard (cardDiv[0])
      function moreHelp() {
        wm.fadeCard (cardDiv, card)
          .then (wm.dealTipCard.bind (wm))
      }
      function endHelp() {
        wm.fadeCard (cardDiv, card)
          .then (wm.clearComposeHelpMode.bind (wm))
      }
      card.on ('throwoutleft', moreHelp)
      card.on ('throwoutright', endHelp)
      card.on ('throwoutup', endHelp)
      card.on ('throwoutdown', endHelp)
      card.on ('dragstart', function() {
        wm.startDrag (cardDiv)
      })
      card.on ('throwinend', function() {
        wm.stopDrag (cardDiv)
      })
      wm.stopDrag (cardDiv)
      if (wm.useThrowAnimations() || wm.alwaysThrowInHelpCards) {
        wm.startThrow()
	card.throwIn (0, -wm.throwYOffset())
      }
      wm.setComposeHelpMode()
    },

    resizeListener: function() {
      var wm = this
      if (wm.stackDiv)
        wm.stackDiv.children('.inertcard,.helpcard').each (function(_n,div) { wm.resizeCardToStack ($(div)) })
    },
    
    resizeCardToStack: function (cardDiv) {
      var wm = this
      cardDiv.width (wm.stackDiv.innerWidth() - parseInt(wm.stackDiv.css('padding-left')) - parseInt(wm.stackDiv.css('padding-right')) - parseInt(cardDiv.css('border-left-width')) - parseInt(cardDiv.css('border-right-width')) - parseInt(cardDiv.css('padding-left')) - parseInt(cardDiv.css('padding-right')))
      cardDiv.height (wm.stackDiv.innerHeight() - parseInt(wm.stackDiv.css('padding-top')) - parseInt(wm.stackDiv.css('padding-bottom')) - parseInt(cardDiv.css('border-top-width')) - parseInt(cardDiv.css('border-bottom-width')) - parseInt(cardDiv.css('padding-top')) - parseInt(cardDiv.css('padding-bottom')))
    },

    addToStack: function (cardDiv) {
      var wm = this
      wm.stackDiv.append (cardDiv)
      wm.resizeCardToStack (cardDiv)
    },
    
    deleteDraft: function() {
      if (wm.composition.threadTweeter && wm.composition.threadTweet && wm.redirectToTwitterWheneverPossible)
        wm.redirectToTweet (wm.composition.threadTweeter, wm.composition.threadTweet)
      else if (wm.playerID === null) {
        wm.composition = { randomTemplate: true }
        wm.dealCard ({ generate: true })
          .then (wm.setComposeCardMode.bind(wm))
      } else
        wm.finishLastSave()
        .then (function() {
          var def = (wm.composition.draft
                     ? wm.REST_deletePlayerDraft (wm.playerID, wm.composition.draft)
                     : $.Deferred().resolve())
          def.then (function() {
            wm.composition = { randomTemplate: true }
            wm.showMailboxPage ({ tab: 'drafts' })
              .then (function() {
                // TODO: update wm.mailboxCache.drafts
              })
          })
        })
    },

    dealCard: function (config) {
      var wm = this
      config = config || {}
      wm.messageTitleSpan = $('<span>')
      wm.updateMessageTitle()
      var expansionRow = $('<div class="sectiontitle bodysectiontitle">').append (wm.messageTitleSpan)
      wm.messageBodyDiv = $('<div class="messagebody">')
        .on ('click', function() {
          wm.stopAnimation()
          wm.saveCurrentEdit()
        })
      var messageBodyElem = wm.messageBodyDiv[0]

      var choiceTextDiv = $('<div class="choicetext">').html ('<b>Choice card:</b> Swipe left to reject, right to accept.')
      var innerDiv = $('<div class="inner">').append (wm.messageBodyDiv, choiceTextDiv)
      var cardDiv = $('<div class="card composecard">').append (expansionRow, innerDiv)
      if (wm.isTouchDevice())
        cardDiv.addClass ('jiggle')  // non-touch devices don't get the drag-start event that are required to disable jiggle during drag (jiggle is incompatible with drag), so we just don't jiggle on non-touch devices for now

      // allow scrolling if using a scroll wheel
      wm.restoreScrolling (wm.messageBodyDiv)

      // add scroll buttons in case we aren't using a scroll wheel (mouse swipe gestures won't work on the card)
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
        innerDiv.append (cardControlsDiv)
        showScrollButton (scrollUpDiv, messageBodyElem.scrollTop > 0)
        showScrollButton (scrollDownDiv, Math.ceil (messageBodyElem.scrollTop + wm.messageBodyDiv.outerHeight()) < messageBodyElem.scrollHeight)
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

      // create the swing card object for the compose card
      var card = wm.stack.createCard (cardDiv[0]), reject
      card.on ('throwoutleft', reject = wm.fadeAndRejectOrRefresh (cardDiv, card))
      card.on ('throwoutdown', wm.standalone ? reject : wm.fadeAndDeleteDraft (cardDiv, card))
      card.on ('throwoutup', wm.standalone ? reject : wm.redealAndToggleEdit (cardDiv, card))
      card.on ('throwoutright', wm.fadeAndSendMessage (cardDiv, card))
      card.on ('dragstart', function() {
        wm.startDrag()
        wm.sharePane.hide()
      })
      card.on ('throwinend', function() {
        wm.stopDrag()
        wm.modalExitDiv.hide()
      })
      card.on ('dragmove', wm.dragListener.bind (wm, true))
      card.on ('dragend', function() {
        wm.throwArrowContainer.removeClass('dragging').addClass('throwing')
        cardDiv.removeClass('dragging').addClass('throwing')
        wm.showMessageBodyWithPreviews ({ animate: false })
      })

      cardDiv.hide()

      wm.currentCard = card
      wm.currentCardDiv = cardDiv

      // use promises to add card when the stack is ready (i.e. previous card faded out)
      var stackReadyPromise = config.stackReady || $.Deferred().resolve()
      var cardReadyPromise = stackReadyPromise
          .then (function() {
            wm.stackDiv.html (cardDiv)  // make sure this is the only card in the stack
            wm.clearComposeHelpMode()  // just in case we skipped a help card
          })
      
      // return a promise, fulfilled when content is rendered & the card is dealt
      delete wm.animationExpansion
      var contentPromise
      if (config.generate)
        contentPromise = wm.generateMessageBody ({ cardReady: cardReadyPromise,
                                                   useCurrentTemplate: config.useCurrentTemplate })
      else
        contentPromise = cardReadyPromise
        .then (function() {
          wm.showMessageBodyWithPreviews ({ animate: config.alwaysAnimate })
        })

      return contentPromise
	.then (function() {
          cardDiv.show()
          wm.stopDrag()
	  // throw-in effect
	  if (wm.useThrowAnimations() && !config.noThrowIn) {
            wm.startThrow (cardDiv)
            card.throwIn (0, -wm.throwYOffset())
          } else
            wm.modalExitDiv.hide()
          if (wm.nextDealPromise)
            wm.nextDealPromise.resolve()
          wm.nextDealPromise = $.Deferred()
          return cardDiv
        })
    },

    fadeAndDealCard: function (cardDiv, card, dealConfig) {
      var wm = this
      wm.throwArrowContainer.hide()
      return wm.dealCard ($.extend ({ generate: true,
                                      stackReady: wm.fadeCard (cardDiv, card) },
                                    dealConfig || {}))
    },

    fadeAndRejectOrRefresh: function (cardDiv, card, dealConfig) {
      var wm = this
      return function() {
        wm.throwArrowContainer.hide()
        return (wm.gotRejectHandler()
                ? wm.sendMessage ({ fade: true, reject: true })
                : (wm.fadeAndDealCard (cardDiv, card, dealConfig)
                   .then (wm.refreshAutosuggest.bind (wm))))
      }
    },
    
    fadeAndDeleteDraft: function (cardDiv, card) {
      var wm = this
      return function() {
        wm.throwArrowContainer.hide()
        if (wm.composition.randomTemplate || window.confirm (wm.deleteDraftPrompt)) {
          if (wm.composition.randomTemplate)
            return wm.fadeAndDealCard (cardDiv, card)
          else
            return wm.fadeCard (cardDiv, card)
            .then (function() { wm.deleteDraft() })
        }
        return wm.dealCard()
      }
    },

    fadeAndResetThread: function (cardDiv, card) {
      var wm = this
      wm.throwArrowContainer.hide()
      if (window.confirm (wm.resetThreadPrompt)) {
        wm.composition = {}
        wm.messages = []
        wm.writeLocalStorage ('messages')
        wm.showComposePage()
      }
    },

    fadeAndSendMessage: function (cardDiv, card) {
      var wm = this
      return function() {
        wm.throwArrowContainer.hide()
        return wm.sendMessage ({ fade: true,
                                 cardDiv: cardDiv,
                                 card: card })
      }
    },

    redealAndToggleEdit: function (cardDiv, card) {
      var wm = this
      return function() {
	wm.destroyCard (cardDiv, card)
        wm.throwArrowContainer.hide()
        return wm.dealCard ({ generate: false,
		              alwaysAnimate: wm.headerToggler.hidden })
	  .then (wm.headerToggler.toggle)
      }
    },

    refreshAutosuggest: function() {
      var wm = this
      delete wm.autosuggestStatus.lastVal
      delete wm.autosuggestStatus.lastKey
      wm.autosuggestStatus.temperature++
      wm.autosuggestStatus.refresh()
    },

    startThrow: function (cardDiv) {
      var wm = this
      cardDiv = cardDiv || wm.currentCardDiv
      if (wm.throwArrowContainer)
        wm.throwArrowContainer.removeClass('dragging').addClass('throwing').show()
      if (cardDiv)
        cardDiv.removeClass('dragging').addClass('throwing')
    },

    startDrag: function (cardDiv) {
      var wm = this
      cardDiv = cardDiv || wm.currentCardDiv
      if (wm.throwArrowContainer)
        wm.throwArrowContainer.removeClass('throwing').addClass('dragging').show()
      if (cardDiv)
        cardDiv.removeClass('throwing').addClass('dragging')
    },

    stopDrag: function (cardDiv) {
      var wm = this
      cardDiv = cardDiv || wm.currentCardDiv
      if (wm.throwArrowContainer)
        wm.throwArrowContainer.removeClass('throwing').removeClass('dragging').removeClass('leftdrag').removeClass('rightdrag').show()
      if (cardDiv)
        cardDiv.removeClass('throwing').removeClass('dragging')
    },

    dragListener: function (showPreview, swingEvent) {
      var wm = this
      // swingEvent is a Hammer panmove event, decorated by swing
      wm.throwArrowContainer.removeClass('leftdrag').removeClass('rightdrag')
      if (swingEvent.throwDirection === swing.Direction.LEFT) {
        wm.throwArrowContainer.addClass('leftdrag')
        wm.leftThrowArrow.css ('opacity', swingEvent.throwOutConfidence)
      } else if (swingEvent.throwDirection === swing.Direction.RIGHT) {
        wm.throwArrowContainer.addClass('rightdrag')
        wm.rightThrowArrow.css ('opacity', swingEvent.throwOutConfidence)
      } else
        previewComposition = wm.composition
      if (showPreview) {
        var previewDirection = (swingEvent.throwOutConfidence > wm.previewConfidenceThreshold
                                ? swingEvent.throwDirection
                                : undefined)
        if (wm.lastPreviewDirection !== previewDirection) {
          var previewComposition, previewClass
              if (previewDirection === swing.Direction.LEFT
                  || (wm.standalone &&
                      (previewDirection === swing.Direction.DOWN
                       || previewDirection === swing.Direction.UP))) {
                previewComposition = wm.composition.preview.reject
                previewClass = 'reject'
              } else if (previewDirection === swing.Direction.RIGHT) {
                previewComposition = wm.composition.preview.accept
                previewClass = 'accept'
              } else {
                previewComposition = wm.composition
                previewClass = 'unknown'
              }
          wm.messageBodyDiv.find('.preview').hide()
          wm.messageBodyDiv.find('.preview-' + previewClass).show()
          wm.showMeters (previewComposition)
          wm.lastPreviewDirection = previewDirection
        }
      }
    },
    
    throwLeft: function (card, cardDiv) {
      var wm = this
      card = card || wm.currentCard
      wm.startThrow (cardDiv)
      card.throwOut (-wm.throwXOffset(), wm.throwYOffset())
    },

    throwRight: function (card, cardDiv) {
      var wm = this
      card = card || wm.currentCard
      wm.startThrow (cardDiv)
      card.throwOut (wm.throwXOffset(), wm.throwYOffset())
    },

    setComposeHelpMode: function() {
      var wm = this
      wm.subnavbar.addClass ('help')
      wm.throwArrowContainer.hide()
    },

    clearComposeHelpMode: function() {
      var wm = this
      wm.subnavbar.removeClass ('help')
      wm.throwArrowContainer.show()
    },

    setComposeCardMode: function() {
      var wm = this
      wm.setThrowArrowText ('reject', 'accept')
      wm.messagePrivacyDiv.removeClass ('thread')
      wm.messageRecipientDiv.removeClass ('thread')
      wm.subnavbar.removeClass ('thread')
      wm.throwArrowContainer.removeClass ('thread')
      wm.setComposeThreadButtonState()
    },

    setComposeInertMode: function() {
      var wm = this
      wm.headerToggler.hide()
      wm.setThrowArrowText ('next')
      wm.messagePrivacyDiv.addClass ('thread')
      wm.messageRecipientDiv.addClass ('thread')
      wm.subnavbar.addClass ('thread')
      wm.throwArrowContainer.addClass ('thread')
      wm.setComposeThreadButtonState()
    },

    replyTitle: function (msgTitle) {
      var replyTitle = msgTitle
      if (replyTitle.match(/\S/) && !replyTitle.match(/^re:/i))
        replyTitle = 'Re: ' + replyTitle
      return replyTitle
    },
    
    threadHasNextMessage: function() {
      var wm = this
      return (wm.composition.thread && wm.composition.thread.length
              && wm.composition.thread[0].next && wm.composition.thread[0].next.length)
    },

    threadHasPrevMessage: function() {
      var wm = this
      return ((wm.composition.threadDiscards && wm.composition.threadDiscards.length)
              || (wm.composition.thread && wm.composition.thread.length && wm.composition.thread[wm.composition.thread.length-1].previous))
    },

    setComposeThreadButtonState: function() {
      var wm = this
      if (wm.threadHasPrevMessage())
        wm.threadPrevButton.removeClass ('disabled')
      else
        wm.threadPrevButton.addClass ('disabled')
    },
    
    noInertCards: function() {
      return this.stackDiv.children('.inertcard').length === 0
    },

    noComposeCard: function() {
      return this.stackDiv.children('.card').length === 0
    },

    // go from inert card to corresponding mailbox entry
    fadeInertToMailbox: function (card, cardDiv, message) {
      var wm = this
      return wm.fadeInertCard (card, cardDiv)
        .then (wm.goToMailbox.bind (wm, message))
    },

    goToMailbox: function (message) {
      return wm.showMailboxPage ({ tab: (message.sender && message.sender.id === wm.playerID
                                         ? 'outbox'
                                         : 'inbox') })
        .then (function() {
          var messageDiv = $('#'+wm.mailboxMessageID(message))
          wm.mailboxDiv.animate ({
            // Scroll parent to the new element. This arcane formula can probably be simplified
            scrollTop: wm.mailboxDiv.scrollTop() + messageDiv.position().top - wm.mailboxDiv.position().top
          })
          $('.selected').removeClass('selected')
          messageDiv.addClass('selected')
        })
    },
    
    // when an inert (i.e. thread) card fades, nothing happens unless it's the last one in the deck & there's no compose card under it
    // in which case a new card will be dealt (a later message in the thread, if available, otherwise a compose card for the reply)
    fadeInertCard: function (card, cardDiv) {
      var nextMessagePromise
      if (wm.noComposeCard() && wm.threadHasNextMessage() && wm.composition.thread.length === 1)
        nextMessagePromise = wm.wrapREST_getPlayerMessage (wm.playerID, wm.composition.thread[0].next[0])
      wm.setComposeHelpMode()
      return wm.fadeCard (cardDiv, card)
        .then (function() {
          wm.stopDrag (cardDiv)
          if (wm.composition.thread && wm.composition.thread.length)
            wm.composition.threadDiscards.push (wm.composition.thread.pop())
          if (nextMessagePromise)
            return nextMessagePromise
              .then (function (result) {
		wm.clearComposeHelpMode()
                if (result && result.message) {
                  wm.composition.thread.push (result.message)
                  if (wm.threadHasNextMessage()) {
                    wm.setComposeInertMode()
                    return wm.makeInertCardPromiser ({ message: result.message }) ()
                  }
                  return wm.replyToMessage ({ message: result.message })
                }
              })
	  wm.clearComposeHelpMode()
          if (wm.noInertCards()) {
            if (wm.noComposeCard()) {
              var dealConfig = {}
              if (wm.composition.threadDiscards && wm.composition.threadDiscards.length) {
                var message = wm.composition.threadDiscards[wm.composition.threadDiscards.length - 1]
                return wm.replyToMessage ({ message: message })
              }
            }
            wm.setComposeCardMode()
          } else
            wm.setComposeInertMode()
        })
    },

    dealInertCard: function() {
      var wm = this
      var prevMessagePromise
      if (wm.composition.thread && wm.composition.threadDiscards && wm.composition.threadDiscards.length)
        prevMessagePromise = $.Deferred().resolve ({ message: wm.composition.threadDiscards.pop() })
      else if (wm.composition.thread && wm.composition.thread.length) {
        var oldestMessage = wm.composition.thread [wm.composition.thread.length - 1]
        if (oldestMessage.previous) {
	  wm.setComposeHelpMode()
          prevMessagePromise = wm.wrapREST_getPlayerMessage (wm.playerID, oldestMessage.previous)
        }
      }
      if (prevMessagePromise)
        return prevMessagePromise.then (function (result) {
	  wm.clearComposeHelpMode()
          if (result && result.message) {
            wm.composition.thread.push (result.message)
            wm.setComposeInertMode()
            return wm.makeInertCardPromiser ({ message: result.message }) ()
          }
        })
      return $.Deferred().resolve()
    },
    
    discardInertCard: function() {
      var wm = this
      var inertCardDivs = wm.stackDiv.children('.inertcard:not(.throwing)')
      if (inertCardDivs.length) {
        var lastCardDiv = inertCardDivs.last()
        var lastCard = lastCardDiv[0].swingCardObject
        wm.throwArrowContainer.hide()
        if (wm.useThrowAnimations())
          wm.throwLeft (lastCard, lastCardDiv)
        else
          wm.fadeInertCard (lastCard, lastCardDiv)
      }
    },

    acceptVarName: 'accept',
    rejectVarName: 'reject',
    gotRejectHandler: function() {
      return this.compositionFinalVarVal()[this.rejectVarName]
    },

    gotAcceptHandler: function() {
      return this.compositionFinalVarVal()[this.acceptVarName]
    },

    gotChoiceHandler: function() {
      return this.gotRejectHandler() || this.gotAcceptHandler()
    },

    choiceFooterPromise: function (composition, reject) {
      var wm = this
      var choiceFooter = (this.gotChoiceHandler()
                          ? (reject
                             ? this.rejectVarName
                             : this.acceptVarName)
                          : undefined)
      return (choiceFooter
              ? (this.getContentExpansionLocal ([], this.compositionFinalVarVal (composition), choiceFooter)
                 .then (function (result) {
                   composition.body.rhs = composition.body.rhs.concat (result.expansion)
                   composition.template.content = wm.ParseTree.addFooter (composition.template.content, choiceFooter)
                 }))
              : $.Deferred().resolve())
    },

    cloneComposition: function() {
      var composition = this.composition
      return { template: { content: composition.template.content.slice(0) },
               body: { type: 'root',
                       rhs: composition.body.rhs.slice(0) },
               vars: $.extend ({}, composition.vars),
               tags: composition.tags,
               previousTags: composition.previousTags,
               tweeter: composition.tweeter,
               avatar: composition.avatar }
    },
    
    rejectCurrentCard: function() {
      var wm = this
      wm.modalExitDiv.show()
      wm.throwArrowContainer.hide()
      if (wm.gotRejectHandler()) {
        if (wm.useThrowAnimations())
          wm.throwLeft()
        else
          wm.sendMessage ({ fade: true,
                            reject: true })
      } else {
        // discard and refresh
        var nextCardPromise
        if (wm.useThrowAnimations()) {
          nextCardPromise = wm.nextDealPromise
          wm.throwLeft()
        } else
          nextCardPromise = wm.dealCard ({ generate: true,
                                           stackReady: wm.fadeCurrentCard() })
        nextCardPromise.then (wm.refreshAutosuggest.bind (wm))
      }
    },
    
    acceptCurrentCard: function() {
      var wm = this
      if (wm.useThrowAnimations())
        wm.throwRight()
      else
        wm.sendMessage ({ fade: true })
    },
    
    destroyCard: function (element, card) {
      var wm = this
      element.remove()
      card.destroy()
    },

    fadeCurrentCard: function() {
      return this.fadeCard (this.currentCardDiv, this.currentCard)
    },
    
    fadeCard: function (element, card) {
      var wm = this
      var fadedPromise = $.Deferred()
      if (!element.hasClass ('helpcard') && !element.hasClass ('inertcard') && wm.modalExitDiv)
        wm.modalExitDiv.show()
      element.find('*').off()
      card.destroy()
      element.fadeOut (wm.cardFadeTime, function() {
	if (wm.verbose.stack)
	  console.log ("Card removed after fade: " + element.html())
	element.remove()
	if (wm.verbose.stack)
	  wm.logStack()
        fadedPromise.resolve()
      })
      return fadedPromise
    },

    logStack: function() {
      var wm = this
      console.log ($.map (wm.stackList.children(), function (elem, idx) {
	var c = elem.getAttribute('class')
	return (c ? ("("+c+") ") : "") + elem.innerHTML
      }))
    },

    updateMessageHeader: function (template) {
      var wm = this
      wm.composition.template = template
      wm.composition.title = template.title
      wm.composition.tweeter = template.tweeter
      wm.composition.avatar = template.avatar
      wm.composition.tags = wm.stripLeadingAndTrailingWhitespace (template.tags)
      wm.composition.previousTags = wm.stripLeadingAndTrailingWhitespace (template.previousTags)
            
      wm.messageTitleInput.val (wm.composition.title)
      wm.messageTagsInput.val (wm.composition.tags)
      wm.messagePrevTagsInput.val (wm.composition.previousTags)

      wm.updateComposeDiv()
    },

    selectRandomReplyTemplate: function() {
      var wm = this
      var previousTags = wm.composition.previousTemplate.tags
      if (wm.composition.vars && wm.composition.previousTags)
          previousTags = wm.composition.previousTags
      return wm.wrapREST_getPlayerSuggestReply (wm.playerID, wm.composition.previousTemplate.id, wm.stripLeadingAndTrailingWhitespace (previousTags))
        .then (function (result) {
          if (!result.more)
            delete wm.composition.previousTemplate
          if (result.template) {
            delete wm.composition.randomTemplate
            return result.template
          }
          return null
        })
    },
    
    selectRandomTemplate: function() {
      var wm = this
      if (wm.composition.randomTemplate)
        return (wm.composition.randomTemplateAuthor
                ? wm.REST_getPlayerSuggestTemplatesBy (wm.playerID, wm.composition.randomTemplateAuthor)
                : wm.wrapREST_getPlayerSuggestTemplates (wm.playerID))
        .then (function (result) {
          if (result && result.templates.length && wm.composition.randomTemplate) {
            var template = wm.ParseTree.randomElement (result.templates)
            return wm.wrapREST_getPlayerTemplate (wm.playerID, template.id)
              .then (function (templateResult) {
                if (templateResult && templateResult.template && wm.composition.randomTemplate)
                  return templateResult.template
              })
          }
        })
      return $.Deferred().resolve()
    },
    
    makeToggler: function (config) {
      var showButton, hideButton, showFunction, hideFunction, toggler
      showButton = wm.makeSubNavIcon (config.showIcon, showFunction = function() {
        config.elements.forEach (function (element) { element.show() })
        hideButton.css('display','')
        showButton.hide()
        toggler.hidden = false
	if (config.showCallback)
	  config.showCallback()
      })
      hideButton = wm.makeSubNavIcon (config.hideIcon, hideFunction = function() {
        config.elements.forEach (function (element) { element.hide() })
        hideButton.hide()
        if (!wm.standalone)
          showButton.css('display','')
        toggler.hidden = true
	if (config.hideCallback)
	  config.hideCallback()
      })
      toggler = { config: config,
                  showButton: showButton,
                  hideButton: hideButton,
                  show: showFunction,
                  hide: hideFunction,
		  toggle: function() { toggler.hidden ? showFunction() : hideFunction() },
                  init: function (elements) {
                    config.elements = elements
                    if (config.hidden)
                      hideFunction()
                    else
                      showFunction()
                  } }
      return toggler
    },

    updateMessageTitle: function() {
      if (wm.messageTitleSpan)
	wm.messageTitleSpan.text (wm.composition.title || 'Untitled')
    },

    markForSave: function() {
      this.composition.needsSave = true
      // needing to delete avatar and tweeter twice is a bit icky here
      delete this.composition.avatar
      delete this.composition.tweeter
      delete this.composition.template.avatar
      delete this.composition.template.tweeter
      delete this.composition.template.author
    },
    
    updateComposeDiv: function() {
      var wm = this
      wm.updateMessageTitle()
      wm.populateEditableElement
      (wm.messageComposeDiv,
       { content: function() { return wm.composition.template ? wm.composition.template.content : [] },
         changeCallback: function (input) {
           delete wm.composition.randomTemplate
           wm.markForSave()
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
           wm.restoreScrolling (wm.suggestionDiv)
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
        wm.markForSave()
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
                       wm.restoreScrolling (wm.suggestionDiv)
                       symbolSelectCallback (symbol)
                     }, 'div', [[symChar + symbol.name, function() { symbolSelectCallback (symbol) }],
                                [symChar + wm.ParseTree.capitalize(symbol.name), function() { symbolSelectCallback (symbol, ['cap']) }],
                                [symChar + symbol.name.toUpperCase(), function() { symbolSelectCallback (symbol, ['uc']) }],
                                ['a ' + symChar + symbol.name, function() { symbolSelectCallback (symbol, ['a']) }],
                                ['A ' + symChar + symbol.name, function() { symbolSelectCallback (symbol, ['a','cap']) }],
                                ['Go to thesaurus definition', function() { wm.showGrammarLoadSymbol (symbol) }]
                               ]))
          }))
        wm.restoreScrolling (wm.suggestionDiv)
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
      var markdown
      if (this.animationExpansion)
        markdown = this.renderMarkdown
      (this.makeExpansionText ({ node: this.animationExpansion,
                                 afterSync: { sym: function (node, vars, depth, expansion) {
                                   if (node.name)
                                     expansion.text = symCharHtml + node.name + '.' + (node.limit ? ('limit' + node.limit.type) : (node.notfound ? 'notfound' : 'unexpanded'))
                                 } },
                                 vars: this.compositionVarVal() }),
       function (html) {
	 return wm.linkSymbols (html)
       })
      
      this.animationDiv.html (markdown)
      if (this.showScrollButtons)
        this.showScrollButtons()
      
      if (this.animationExpansion
          && (this.deleteFirstSymbolName (this.animationExpansion) || this.extraAnimationSteps-- > 0))
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
        this.animationDiv.html (this.renderMarkdown (this.makeExpansionText ({ node: this.animationExpansion,
                                                                               vars: this.compositionVarVal() })))
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

    dummyExpandSymbol: function (config) {
      return []
    },

    makeExpansionText: function (config) {
      config.makeSymbolName = this.makeSymbolName.bind (this)
      config.expand = this.dummyExpandSymbol
      return this.ParseTree.makeExpansionText (config)
    },
    
    // getSymbolExpansion is the main entry point from other parts of the code that expand a symbol in context (i.e. with variables)
    getSymbolExpansion: function (symbolID, initVarVal, noFooter) {
      return this.getContentExpansion ([{ type: 'sym',
                                          id: symbolID }],
                                       initVarVal,
                                       noFooter)
    },

    // getContentExpansion, used by getSymbolExpansion and generateMessageBody, is a wrapper for REST_postPlayerExpand
    getContentExpansion: function (content, initVarVal, noFooter) {
      var wm = this
      initVarVal = initVarVal || wm.defaultVarVal()
      if (!noFooter)
        content = wm.ParseTree.addFooter (content)
      return wm.wrapREST_postPlayerExpand (wm.playerID,
                                           { content: content,
                                             vars: initVarVal })
        .then (function (result) {
          return { expansion: result.expansion.tree }
        })
    },

    // getContentExpansionLocal is a wrapper for getContentExpansion that avoids making a REST call if possible
    // so bracery that does not involve any symbol expansions gets processed locally
    getContentExpansionLocal: function (content, initVarVal, footerName) {
      var wm = this
      initVarVal = initVarVal || wm.defaultVarVal()
      var initVarValCopy = $.extend ({}, initVarVal)
      var sampledTree = wm.ParseTree.sampleParseTree (wm.ParseTree.addFooter (content, footerName))
      return new Promise (function (resolve, reject) {
        return wm.ParseTree.makeRhsExpansionPromise
        ({ rhs: sampledTree,
           vars: initVarVal,
           disableParse: true,
           expand: reject,
           get: reject })
          .then (resolve)
      }).then (function (expansion) {
        return { expansion: expansion.tree }
      }, function (expandConfig) {
        return wm.getContentExpansion (sampledTree, initVarValCopy)
      })
    },

    // getContentExpansionWithoutSymbols ignores any remote calls
    getContentExpansionWithoutSymbols: function (expr, vars) {
      var parsedExpr = this.parseRhs (expr),
          sampledExpr = this.ParseTree.sampleParseTree (parsedExpr),
          expandedExpr = this.ParseTree.makeRhsExpansionSync
      ({ rhs: sampledExpr,
         vars: $.extend ({}, vars),
         disableParse: true,
         expandSync: function() { return '' },
         getSync: function() { return '' } })
      return expandedExpr.text
    },
    
    // generateMessageBody fetches a random template and requests an expansion
    generateMessageBody: function (config) {
      var wm = this
      config = config || {}
      var useCurrentTemplate = config.useCurrentTemplate
      var cardReady = config.cardReady || $.Deferred().resolve()
      
      wm.composition.body = {}
      
      var templatePromise
      if (useCurrentTemplate)
        templatePromise = $.Deferred().resolve()
      else if (wm.composition.previousTemplate)
        templatePromise = wm.selectRandomReplyTemplate()
      else
        templatePromise = wm.selectRandomTemplate()
      
      return templatePromise.then (function (newTemplate) {
        var template = newTemplate || wm.composition.template
        if (template && template.content) {
          return cardReady
            .then (function() {
              if (newTemplate)
                wm.updateMessageHeader (newTemplate)
              return wm.getContentExpansionLocal (template.content, wm.compositionVarVal())
                .then (function (result) {
                  wm.composition.body = wm.ParseTree.makeRoot (result.expansion)
                }).then (function() {
                  if (wm.gotChoiceHandler()) {
                    wm.composition.preview = {}
                    return wm.choiceFooterPromise (wm.composition.preview.accept = wm.cloneComposition(), false)
                      .then (wm.choiceFooterPromise.bind (wm, wm.composition.preview.reject = wm.cloneComposition(), true))
                  } else
                    wm.composition.preview = { accept: wm.composition,
                                               reject: wm.composition }
                }).then (function() {
                  wm.showMessageBodyWithPreviews()
                })
            })
        } else
          wm.showMessageBody()
      })
    },
    
    addAvatarImage: function (config) {
      var wm = this
      var div = config.div, tweeter = config.tweeter, avatar = config.avatar, author = config.author, size = config.size, varVal = config.vars
      var safeRegex = /^#?[a-zA-Z0-9_\-]+$/
      if (varVal && varVal['icon'] && varVal.icon.match(safeRegex))
        div.append (wm.makeIconButton ({ iconFilename: varVal.icon,
                                         color: (varVal.icolor && varVal.icolor.match(safeRegex)) ? varVal.icolor : undefined }),
                   $('<div class="avatarname">').text (varVal.caption || ''))
      else if (tweeter) {
	div.append ($('<img>').attr ('src', this.REST_makeAvatarURL (tweeter, size || 'original')))
        .on ('click', function (evt) {
          if (window.confirm ("Go to @" + tweeter + "'s page on Twitter?"))
            wm.redirectToTweeter (tweeter)
        })
        if (author)
          div.append ($('<div class="avatarname">').html (author + '<br/>@' + tweeter))
        else
          div.append ($('<div class="avatarname">').text ('@' + tweeter))
      } else if (avatar) {
        var icon_color = avatar.split(':')
        div.append (wm.makeIconButton ({ iconFilename: icon_color[0],
                                         color: icon_color[1] }))
        if (author)
          div.append ($('<div class="avatarname">').text (author))
      }
    },
    
    showMessageBodyWithPreviews: function (config) {
      var wm = this
      config = config || {}
      wm.showMessageBody ({ animate: typeof(config.animate) === 'undefined' ? !wm.headerToggler.hidden : config.animate })
      wm.showMessageBody ({ composition: wm.composition.preview.accept,
                            preview: 'accept' })
      wm.showMessageBody ({ composition: wm.composition.preview.reject,
                            preview: 'reject' })
    },

    showMessageBody: function (config) {
      var wm = this
      config = config || {}
      var div = config.div || wm.messageBodyDiv
      var composition = config.composition || wm.composition
      var expansion = config.expansion || composition.body
      var tweeter = config.tweeter || composition.tweeter
      var avatar = config.avatar || composition.avatar
      var preview = config.preview || 'unknown'
      var textDiv = $('<div class="text">').addClass('preview').addClass ('preview-' + preview)
      if (!config.preview) {
        div.empty()
        wm.avatarDiv = config.inEditor ? null : $('<div class="avatar">')
        if (wm.avatarDiv) {
          wm.updateAvatarDiv (config)
          div.append (wm.avatarDiv)
        }
      }
      div.append (textDiv)
      if (config.preview)
        textDiv.hide()
      else {
        wm.animationExpansion = _.cloneDeep (expansion)
        wm.animationDiv = textDiv
      }
      wm.randomizeEmptyMessageWarning()
      if (config.animate && wm.countSymbolNodes(wm.animationExpansion,true)) {
        delete wm.animationSteps
        this.startAnimatingExpansion()
      } else {
	if (!config.preview) {
          if (wm.animationExpansion)
            wm.deleteAllSymbolNames (wm.animationExpansion)
          wm.animationSteps = 0
        }
	var rawExpansion = wm.makeExpansionText ({ node: expansion,
                                                   vars: wm.compositionVarVal (composition) })
	var processedExpansion = rawExpansion.replace (/^\s*$/, (!config.inEditor && wm.templateIsEmpty()
								 ? wm.emptyTemplateWarning
								 : wm.emptyMessageWarning))
        textDiv.html (this.renderMarkdown (processedExpansion))
        if (wm.showScrollButtons)
          wm.showScrollButtons()
      }
      if (wm.banner && !config.inEditor && !config.preview)
        wm.showMeters (composition)
    },

    showMeters: function (composition) {
      var wm = this
      var vars = wm.compositionFinalVarVal (composition)
      var meters = vars['meters'] ? wm.ParseTree.makeArray(vars.meters) : []
      var bannerHeight = wm.banner.height()
      this.makeMeterDivPromises (vars, bannerHeight, false)
        .reduce (function (done, meterReady) {
        return done.then (function (meterDivs) {
          return meterReady.then (function (meterDiv) {
            return meterDivs.concat ([meterDiv])
          })
        })
      }, $.Deferred().resolve ([]))
        .then (function (meterDivs) {
          wm.banner.empty().append (meterDivs)
        })
    },

    makeMeterDivPromises: function (vars, height, showLabel) {
      var wm = this
      var meters = vars['meters'] ? wm.ParseTree.makeArray(vars.meters) : []
      return meters.map (function (meter) {
        var meterFields = wm.ParseTree.makeArray (meter)
        var iconName = meterFields[0],
            levelExpr = meterFields[1] || 1,
            labelExpr = meterFields[2]
        var meterDiv = $('<div class="meter">')
        if (!iconName.match (wm.iconFilenameRegex))
          return meterDiv
        var level = wm.getContentExpansionWithoutSymbols (levelExpr, vars)
        var label = (showLabel && labelExpr
                     ? wm.getContentExpansionWithoutSymbols (labelExpr, vars)
                     : (wm.ParseTree.capitalize (iconName.replace(/-/g,' ')) + ': ' + Math.round(100*level) + '%'))
        return wm.getIconPromise (iconName)
          .then (function (svg) {
            function makeMeter() {
              return $('<div class="icons">')
                .append ($('<div class="icon empty">').append ($(svg)),
                         $('<div class="icon full">').append ($(svg))
                         .css ('clip', 'rect(' + (1-level)*height + 'px,100vw,100vh,0)'))
            }
            meterDiv.append (makeMeter())
            if (showLabel)
              meterDiv.append ($('<span class="label">').text (label),
                               makeMeter())
            return meterDiv
          })
      })
    },

    updateAvatarDiv: function (config) {
      var wm = this
      config = config || {}
      var expansion = config.expansion || wm.composition.body
      var tweeter = config.tweeter || wm.composition.tweeter
      if (typeof(tweeter) === 'undefined')
        tweeter = wm.playerInfo.twitterScreenName
      var avatar = config.avatar || wm.composition.avatar
      if (typeof(avatar) === 'undefined')
        avatar = wm.playerInfo.avatar
      var author = (wm.composition.template && wm.composition.template.author) ? wm.composition.template.author : wm.playerInfo
      if (wm.avatarDiv) {
        wm.avatarDiv.empty()
        wm.addAvatarImage ({ div: wm.avatarDiv,
                             tweeter: tweeter,
                             avatar: avatar,
                             author: author.displayName || null,
                             vars: wm.ParseTree.finalVarVal ({ node: expansion,
                                                               initVarVal: wm.compositionVarVal(),
							       makeSymbolName: wm.makeSymbolName.bind(wm) }) })
      }
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
      wm.composition.body.rhs = wm.ParseTree.stripFooter (wm.composition.body.rhs).concat (appendedRhs)
      wm.animationExpansion.rhs = wm.ParseTree.stripFooter (wm.animationExpansion.rhs).concat (appendedRhs)
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
        promise = wm.wrapREST_getPlayerMessageThread (wm.playerID, config.message)
          .then (function (result) {
            wm.container.show()
            if (result && result.thread && result.thread.length) {
              var thread = result.thread.reverse()
              var lastMessage = thread[0]
              var nextVars = wm.nextVarVal ({ node: lastMessage.body,
                                              initVarVal: lastMessage.vars,
					      makeSymbolName: wm.makeSymbolName.bind(wm),
                                              sender: lastMessage.sender })
              return wm.showComposePage
              ({ recipient: lastMessage.sender,
                 defaultToPublic: true,
                 title: wm.replyTitle (lastMessage.title),
                 previousMessage: lastMessage.id,
                 previousTemplate: lastMessage.template.id,
                 thread: thread,
                 threadTweeter: lastMessage.tweeter,
                 threadTweet: lastMessage.tweet,
                 vars: nextVars,
                 tags: '',
                 previousTags: (nextVars.prevtags
                                ? nextVars.prevtags
                                : (lastMessage.template ? (lastMessage.template.tags || '') : '')),
                 getRandomTemplate: true
               })
            }
          })
        break
      case 'compose':
        promise = this.showComposePage ({ recipient: config.recipient,
                                          title: config.title,
                                          template: (config.content || config.text) && { content: config.content || (config.text ? wm.parseRhs(config.text) : []) },
                                          getRandomTemplate: !!config.author,
                                          author: config.author,
                                          clearThread: true,
                                          generateNewContent: !config.author })
        break
      case 'grammar':
        wm.container.hide()
        promise = this.showGrammarLoadSymbol (config.symbol)
          .then (function() {
            wm.container.show()
          })
        break
      case 'twitter':
	promise = wm.showSettingsPage()
	  .then (function() { return wm.showBroadcastConfigPage() })
	break
      case 'home':
      default:
        promise = this.showComposePage ({ showHelpCard: !wm.playerID })
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
                     wm.subnavbar = $('<div class="subnavbar">').append
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
      return outboxPromise.then (function (outbox) {
        wm.mailboxCache.outbox = outbox
        return outbox
      }).then (function (result) {
        
        wm.populateMailboxDiv ($.extend ({ messages: result.messages },
                                         wm.outboxProps()))
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
      return draftsPromise.then (function (drafts) {
        wm.mailboxCache.drafts = drafts
        return drafts
      }).then (function (result) {
        
        wm.populateMailboxDiv ({ tab: 'drafts',
                                 title: 'Drafts',
                                 messages: result.drafts,
                                 getMethod: 'REST_getPlayerDraft',
                                 deleteMethod: 'REST_deletePlayerDraft',
                                 object: 'recipient',
                                 showMessage: function (props) {
                                   var draft = props.result.draft
                                   wm.showComposePage ({ recipient: draft.recipient,
                                                         title: draft.title,
                                                         previousMessage: draft.previous,
                                                         previousTemplate: draft.previousTemplate,
                                                         tags: draft.tags,
                                                         previousTags: draft.previousTags,
                                                         template: draft.template,
                                                         vars: draft.vars,
                                                         clearThread: true,
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
               getMethod: 'REST_getPlayerMessage',
               object: 'sender',
               showMessage: function (props) {
                 var message = props.result.message
                 var nextVars = wm.nextVarVal ({ node: message.body,
                                                 initVarVal: message.vars,
						 makeSymbolName: wm.makeSymbolName.bind(wm),
                                                 sender: message.sender })
                 wm.showComposePage ({ recipient: null,
                                       defaultToPublic: true,
                                       thread: [message],
                                       threadTweeter: message.tweeter,
                                       threadTweet: message.tweet,
                                       vars: nextVars,
                                       tags: '',
                                       previousTags: (nextVars.prevtags
                                                      ? nextVars.prevtags
                                                      : (message.template ? (message.template.tags || '') : '')),
                                       getRandomTemplate: true
                                     })
               }
             }
    },
    
    inboxProps: function() {
      var wm = this
      
      return { tab: 'inbox',
               title: 'Received messages',
               getMethod: 'REST_getPlayerMessage',
               deleteMethod: 'REST_deletePlayerMessage',
               object: 'sender',
               showMessage: function (props) {
                 var message = props.result.message
                 var nextVars = wm.nextVarVal ({ node: message.body,
                                                 initVarVal: message.vars,
						 makeSymbolName: wm.makeSymbolName.bind(wm),
                                                 sender: message.sender })
                 wm.showComposePage ({ recipient: message.sender,
                                       defaultToPublic: false,
                                       thread: [message],
                                       threadTweeter: message.tweeter,
                                       threadTweet: message.tweet,
                                       vars: nextVars,
                                       tags: '',
                                       previousTags: (nextVars.prevtags
                                                      ? nextVars.prevtags
                                                      : (message.template ? (message.template.tags || '') : '')),
                                       getRandomTemplate: true
                                     })
               }}
    },

    outboxProps: function() {
      var wm = this
      
      return { tab: 'outbox',
               title: 'Sent messages',
               getMethod: 'REST_getPlayerMessage',
               deleteMethod: 'REST_deletePlayerMessage',
               object: 'recipient',
               showMessage: function (props) {
                 var message = props.result.message
                 var nextVars = wm.nextVarVal ({ node: message.body,
                                                 initVarVal: message.vars,
						 makeSymbolName: wm.makeSymbolName.bind(wm),
                                                 sender: message.sender })
                 wm.showComposePage ({ recipient: wm.playerInfo,
                                       defaultToPublic: false,
                                       thread: [message],
                                       threadTweeter: message.tweeter,
                                       threadTweet: message.tweet,
                                       vars: nextVars,
                                       tags: '',
                                       previousTags: (nextVars.prevtags
                                                      ? nextVars.prevtags
                                                      : (message.template ? (message.template.tags || '') : '')),
                                       getRandomTemplate: true
                                     })
               }
             }
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

    updateBroadcasts: function (message) {
      var wm = this
      if (wm.page === 'status' && wm.mailboxDiv)
        wm.mailboxContentsDiv.prepend (wm.makeMailboxEntryDiv (wm.broadcastProps(), message))
    },

    populateMailboxDiv: function (props) {
      var wm = this
      if (props.tab !== 'public')
        wm.lastMailboxTab = props.tab
      wm.messageHeaderCache = {}
      wm.mailboxDiv
        .empty()
        .append ($('<div class="mailboxname">').text (props.title),
                 wm.mailboxContentsDiv = $('<div class="contents">')
                 .append (props.messages
                          .sort (function (a, b) { return new Date(b.date) - new Date(a.date) })  // newest first
                          .map (wm.makeMailboxEntryDiv.bind (wm, props))))
    },

    mailboxMessageID: function (message) {
      return 'mailbox-message-' + message.id
    },
    
    makeMailboxEntryDiv: function (props, message) {
      var wm = this
      wm.messageHeaderCache = wm.messageHeaderCache || {}
      wm.messageHeaderCache[message.id] = message
      var deleteMessage = (props.deleteMethod
                           ? function (evt) {
                             if (evt)
                               evt.stopPropagation()
                             if (window.confirm ('Delete this message?'))
                               return wm[props.deleteMethod] (wm.playerID, message.id)
                               .then (function() {
                                 Object.keys (wm.mailboxCache).forEach (function (mailboxTab) {
                                   var mailboxCache = wm.mailboxCache[mailboxTab]
                                   mailboxCache.messages
                                     = mailboxCache.messages.filter (function (mailboxMessage) {
                                       return mailboxMessage.id !== message.id
                                     })
                                 })
                                 if (wm.playerInfo && wm.playerInfo.botMessage === message.id)
                                   wm.playerInfo.botMessage = null   // reflects automatic update on server
                                 wm.reloadCurrentTab()
                               })
                             return $.Deferred().resolve()
                           }
                           : null)
      var avatarDiv = $('<div class="avatar">')
      wm.addAvatarImage ({ div: avatarDiv,
                           tweeter: message.tweeter,
                           avatar: message.avatar })
      var div = $('<div class="message" id="' + wm.mailboxMessageID(message) + '">')
      var buttonsDiv = $('<div class="buttons">')
      if (deleteMessage)
        buttonsDiv.append (wm.makeIconButton ('delete', deleteMessage))
      if (!message.sender || !message.sender.id || message.sender.id === wm.playerID) {
        function updateBotMessage (newBotMessage) {
          return function() {
            return wm.REST_postPlayerConfig (wm.playerID, { botMessage: newBotMessage })
              .then (function() {
                wm.playerInfo.botMessage = newBotMessage
                var reloadPromise = wm.reloadCurrentTab()
                if (newBotMessage || wm.currentTab.name === 'settings')
                  reloadPromise.then (wm.showBroadcastConfigPage.bind(wm))
              })
          }
        }
        if (wm.playerID)
          buttonsDiv.append (message.id === wm.playerInfo.botMessage
                             ? wm.makeIconButton ('unpin', updateBotMessage (null))
                             : wm.makeIconButton ('pin', updateBotMessage (message.id)))
      }
      div.append (avatarDiv,
                  $('<div class="mailboxheader">')
                  .append ($('<div class="title">').text (message.title || 'Untitled'),
                           $('<div class="player">').html (message[props.object] ? message[props.object].displayName : $('<span class="placeholder">').text (wm.anonGuest)))
                  .on ('click', wm.makeGetMessage (props, message, true, div)),
                  buttonsDiv)
        .addClass (message.unread ? 'unread' : 'read')
      return div
    },

    makeGetMessage: function (props, message, pushView, div) {
      return function (evt) {
        if (evt)
          evt.preventDefault()
        $('.selected').removeClass('selected')
        div.addClass('selected')
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
            if (div)
              div.removeClass('unread').addClass('read')
            delete message.unread
            --wm.messageCount
            wm.updateMessageCountDiv()
          }
          if (message.addNextId) {
            result.message.next = result.message.next || []
            if (result.message.next.indexOf (message.addNextId) < 0)
              result.message.next.push (message.addNextId)
          }
          props.showMessage ($.extend
                             ({},
                              props,
                              { result: result,
				pushView: pushView || false }))
        })
      }
    },

    makeMessageCardDiv: function (config) {
      var wm = this
      var message = config.message, sender = config.sender, recipient = config.recipient

      var mailstampDiv = $('<div class="mailstamp">')
      mailstampDiv.append (recipient ? ('Sent' + (recipient.id === wm.playerID ? ' to you' : '')) : 'Posted')
      if (!wm.standalone)
        mailstampDiv.append (' by ',
			     sender ? (sender.id === wm.playerID ? 'you' : sender.displayName) : wm.anonGuest)
      mailstampDiv.append (' ', wm.relativeDateString (message.date))
      mailstampDiv.css ('transform', 'rotate(' + ((message.id % 7) - 3) + 'deg)')
      if (message.tweeter && message.tweet)
	mailstampDiv.prepend (wm.makeIconButton ('twitter', null, 'darkred'))
	.on ('click', function() {
          if (window.confirm ("View this message on Twitter?"))
            wm.redirectToTweet (message.tweeter, message.tweet)
        })
      
      var avatarDiv = $('<div class="avatar">')
      wm.addAvatarImage ({ div: avatarDiv,
                           tweeter: message.tweeter,
                           avatar: message.avatar,
                           author: message.template.author.displayName,
                           vars: wm.ParseTree.finalVarVal ({ node: message.body,
                                                             initVarVal: message.vars,
							     makeSymbolName: wm.makeSymbolName.bind(wm) }) })

      var textDiv = $('<div class="text">')
	  .html (wm.renderMarkdown (wm.makeExpansionText ({ node: message.body,
							    vars: $.extend ({}, message.vars || wm.defaultVarVal (sender, recipient, message.tags)) })))
      var inertTextDiv = $('<div class="inerttext">').html ('Swipe left or right to see next card.')
      var titleDiv = $('<div class="sectiontitle bodysectiontitle">').append ($('<span>').text (message.title))
      var innerDiv = $('<div class="inner">').append ($('<div class="messagebody">')
                                                      .append (mailstampDiv, avatarDiv, textDiv),
						      inertTextDiv)
      var cardDiv = $('<div class="card">').append (titleDiv, innerDiv)
      if (wm.isTouchDevice())
        cardDiv.addClass ('jiggle')  // non-touch devices don't get the drag-start event that are required to disable jiggle during drag (jiggle is incompatible with drag), so we just don't jiggle on non-touch devices for now
      var cardClass = (sender && sender.id === wm.playerID
		       ? 'sentcard'
		       : (recipient && recipient.id === wm.playerID
			  ? 'messagecard'
			  : 'broadcastcard'))
      cardDiv.addClass (cardClass)
      return cardDiv
    },

    replyToMessage: function (config) {
      var wm = this
      config = config || {}
      var message = config.message
      if ((message.next && message.next.length)
          ? window.confirm('There is already a reply to this message. Do you really want to split the thread?')
          : true) {
        var replyTitle = message.title
        if (replyTitle.match(/\S/) && !replyTitle.match(/^re:/i))
          replyTitle = 'Re: ' + replyTitle
        var nextVars = wm.nextVarVal ({ node: message.body,
                                        initVarVal: message.vars,
					makeSymbolName: wm.makeSymbolName.bind(wm),
                                        sender: message.sender })
        return wm.showComposePage
        ({ recipient: message.sender,
           defaultToPublic: !message.recipient,
           title: replyTitle,
           previousMessage: message.id,
           previousTemplate: message.template,
           vars: nextVars,
           clearThread: config.clearThread,
           thread: config.thread,
           threadDiscards: config.threadDiscards,
           tags: '',
           previousTags: (nextVars.prevtags
                          ? nextVars.prevtags
                          : (message.template ? (message.template.tags || '') : '')),
           getRandomTemplate: true
         })
      }
      return $.Deferred().resolve()
    },

    defaultVarVal: function (sender, recipient, tags) {
      sender = sender || (this.playerID ? this.playerInfo : null)
      return this.VarsHelper.defaultVarVal (sender, recipient, tags)
    },

    populateVarVal: function (varVal, sender, recipient, tags) {
      return this.VarsHelper.populateVarVal (varVal, sender, recipient, tags)
    },
    
    nextVarVal: function (config) {
      return this.VarsHelper.nextVarVal (config, this.ParseTree)
    },

    populateVarVal: function (varVal, sender, recipient, tags) {
      return this.VarsHelper.populateVarVal (varVal, sender, recipient, tags)
    },
    
    compositionVarVal: function (composition) {
      composition = composition || this.composition
      if (!composition)
        return this.defaultVarVal()
      var sender = this.playerID ? this.playerInfo : null
      var recipient = this.composition.isPrivate ? this.composition.recipient : null
      return (composition.vars
	      ? this.populateVarVal ($.extend ({}, composition.vars), sender, recipient, composition.tags)
	      : this.defaultVarVal (sender, recipient, composition.tags))
    },

    compositionFinalVarVal: function (composition) {
      composition = composition || this.composition
      if (!composition)
        return this.defaultVarVal()
      if (!composition.body)
        return wm.compositionVarVal (composition)
      return this.ParseTree.finalVarVal ({ node: composition.body,
                                           initVarVal: wm.compositionVarVal (composition),
					   makeSymbolName: wm.makeSymbolName.bind(wm) })
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
              return wm.socket_getPlayerPublic (wm.playerID)
                .then (function (pubResult) {
                  wm.pageExit = function() {
                    return wm.socket_getPlayerPublicUnsubscribe (wm.playerID)
                  }
                  if (pubResult.messages.length)
                    wm.populateMailboxDiv ($.extend ({ messages: pubResult.messages },
                                                     wm.broadcastProps()))
                  // TODO: append 'More...' link to wm.mailboxDiv, bumping up optional limit on /p/public/page
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
                                                                   wm.showComposePage ({ title: templateResult.template.title,
                                                                                         template: templateResult.template,
                                                                                         focus: 'playerSearchInput',
                                                                                         clearThread: true,
                                                                                         generateNewContent: true }) }) })
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

    popBack: function (callback, buttonCreationCallback) {
      var wm = this
      callback = callback || wm.popView.bind(wm)
      var button = wm.makeSubNavIcon ('back', function() { callback(button) })
      if (buttonCreationCallback)
        buttonCreationCallback (button)
      return (wm.popBackDiv = $('<div class="subnavbar backbar">'))
	.append (button)
    },

    redrawPopBack: function (callback) {
      var wm = this
      wm.popBackDiv.remove()
      wm.container.append (wm.popBack())
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
      var config = (typeof(iconName) === 'object'
                    ? iconName
                    : { iconName: iconName,
                        callback: callback,
                        color: color })
      var iconFilename = config.iconFilename || this.iconFilename[config.iconName]
      var iconNameSpan = $('<span>').addClass('iconlabel').text (config.text || config.iconName || config.iconFilename)
      var button = $('<span>').addClass('button').html (iconNameSpan)
      this.getIconPromise (iconFilename)
        .done (function (svg) {
          var elem = $(svg)
          if (config.color)
            elem.css ('fill', config.color)
          button.prepend (elem)
        })
      if (config.callback)
        button.on ('click', config.callback)
      return button
    },

    makeSubNavIcon: function (iconName, callback) {
      return this.makeIconButton (iconName, callback)
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
      
      var buttonsDiv = $('<div class="buttons">')
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
      return this.ParseTree.parseRhs (rhs)
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

      function addToDraft() {
        return function (evt) {
          evt.stopPropagation()
          wm.saveCurrentEdit()
            .then (function () {
              return wm.getSymbolExpansion (symbol.id, wm.compositionFinalVarVal())
                .then (function (result) {
                  expansion = result.expansion
                })
            })
            .then (function() {
	    if (expansion)
	      expansion = $.extend ({ type: 'sym' }, expansion[0])
            if (!wm.templateIsEmpty()) {
              if (expansion && wm.composition.body && wm.composition.body.rhs)
                wm.composition.body.rhs = wm.ParseTree.stripFooter (wm.composition.body.rhs).concat ([expansion])
              wm.composition.template.content.push ({ id: symbol.id })
              wm.updateAvatarDiv()
              delete wm.composition.randomTemplate
              return wm.showComposePage ({ thread: [] })
            } else
              return wm.showComposePage
            ({ template: { content: [ symbol ] },
               title: wm.symbolName[symbol.id].replace(/_/g,' '),
               body: expansion ? { type: 'root', rhs: [expansion] } : undefined,
               clearThread: true,
               focus: 'playerSearchInput',
               generateNewContent: true })
            })
        }
      }

      function randomize (evt) {
        evt.stopPropagation()
        wm.saveCurrentEdit()
          .then (function() {
            wm.getSymbolExpansion (symbol.id, wm.compositionFinalVarVal(), true)
              .then (function (result) {
                wm.showingHelp = false
		wm.infoPaneTitle.html (wm.makeSymbolSpan (symbol,
                                                          function (evt) {
                                                            evt.stopPropagation()
                                                            wm.loadGrammarSymbol (symbol)
                                                          }))
		wm.showMessageBody ({ div: wm.infoPaneContent,
                                      expansion: { type: 'root', rhs: result.expansion },
                                      inEditor: true,
                                      animate: true })
                wm.infoPaneLeftControls
                  .empty()
                  .append (wm.makeIconButton ({ iconName: 'reroll',
                                                text: 'randomize' }),
                           $('<div class="hint">').text('randomize'))
                  .off('click')
                  .on('click',randomize)
                wm.infoPaneRightControls
                  .empty()
                  .append (wm.makeIconButton ('forward'),
                           $('<div class="hint">').text('add to draft'))
                  .off('click')
                  .on('click', addToDraft())
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
      if (!node.rhs)
        return 0
      var nodes = this.ParseTree.getSymbolNodes (node.rhs)
      if (!includeLimitedNodes)
	nodes = nodes.filter (function (node) {
	  return !node.limit
	})
      return nodes.length
    },
    
    firstNamedSymbol: function (node) {
      var nodes
      if (node && node.rhs)
        nodes = this.ParseTree.getSymbolNodes (node.rhs)
	.filter (function (node) { return node.name })
      return nodes && nodes.length ? nodes[0] : null
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

    makeRhsSpan: function (rhs, makeRhsSpan, loadSymbol) {
      var wm = this
      loadSymbol = loadSymbol || wm.loadGrammarSymbol.bind(wm)
      makeRhsSpan = makeRhsSpan || function (rhs) { return wm.makeRhsSpan (rhs, makeRhsSpan, loadSymbol) }
      function makeLeftBraceSpan() { return $('<span class="syntax-brace">').text (leftBraceChar) }
      function makeRightBraceSpan() { return $('<span class="syntax-brace">').text (rightBraceChar) }
      function makeFuncSpan (name) { return $('<span class="syntax-func-name">').text (funcChar + name) }
      function argSpanMaker (arg) {
        return $('<span>').append (makeLeftBraceSpan(), makeRhsSpan (arg), makeRightBraceSpan())
      }
      function wrapArgSpanMaker (arg) { return argSpanMaker ([arg]) }
      return $('<span>')
        .append (wm.ParseTree.stripFooter(rhs).map (function (tok, n) {
          if (typeof(tok) === 'string')
            return $('<span>').html (wm.renderMarkdown (tok))
          var nextTok = (n < rhs.length - 1) ? rhs[n+1] : undefined
          var tokSpan = $('<span>').addClass ('syntax-' + tok.type)
          switch (tok.type) {
          case 'lookup':
            tokSpan.addClass ('syntax-var')
            return tokSpan.html.apply (tokSpan,
                                       [typeof(nextTok) === 'string' && nextTok.match(/^[A-Za-z0-9_]/)
                                         ? [varChar, makeLeftBraceSpan(), tok.varname, makeRightBraceSpan()]
                                         : [varChar, tok.varname]])
          case 'assign':
            if (wm.ParseTree.isQuoteAssignExpr (tok))
              return tokSpan.append (makeFuncSpan (tok.varname),
                                     $('<span class="syntax-target">')
                                     .append (makeLeftBraceSpan(),
                                              makeRhsSpan (tok.value[0].args),
                                              makeRightBraceSpan()))
            else if (wm.ParseTree.isTagExpr (tok))
              return tokSpan.append (makeFuncSpan ('tag'),
                                     $('<span class="syntax-target">')
                                     .append (makeLeftBraceSpan(),
                                              makeRhsSpan (wm.ParseTree.getTagExprRhs (tok)),
                                              makeRightBraceSpan()))
            else
              return tokSpan.append (tok.local ? makeFuncSpan('let') : '',
                                     $('<span class="syntax-var">').append (varChar, tok.varname),
                                     (tok.visible ? ':' : '') + assignChar,
                                     $('<span class="syntax-target">')
                                     .append (makeLeftBraceSpan(),
                                              makeRhsSpan (tok.value),
                                              makeRightBraceSpan()),
                                     tok.local ? [makeLeftBraceSpan(), makeRhsSpan (tok.local), makeRightBraceSpan()] : [])
          case 'alt':
            return tokSpan.append ($('<span class="syntax-alt-char">').text(leftSquareBraceChar),
                                   tok.opts.reduce (function (result, opt, n) {
                                     return result
                                       .concat (n ? [$('<span class="syntax-alt-char">').text(pipeChar)] : [])
                                       .concat ([makeRhsSpan(opt)])
                                   }, []),
                                   $('<span class="syntax-alt-char">').text(rightSquareBraceChar))
          case 'rep':
            return tokSpan.append (makeFuncSpan('rep'),
                                   makeLeftBraceSpan(),
                                   makeRhsSpan(tok.unit),
                                   makeRightBraceSpan(),
                                   makeLeftBraceSpan(),
                                   tok.min,
                                   (tok.max !== tok.min ? (',' + tok.max) : ''),
                                   makeRightBraceSpan())
          case 'cond':
            if (wm.ParseTree.isTraceryExpr (tok, wm.makeSymbolName.bind(wm)))
              return $('<span>').append (traceryChar, tok.test[0].varname, traceryChar)
            return tokSpan.append ($('<span class="syntax-if">').text(funcChar),
				   [['if',tok.test],
				    ['then',tok.t],
				    ['else',tok.f]].map (function (keyword_arg) {
                                      return $('<span>')
                                        .append ($('<span>')
                                                 .addClass ('syntax-cond-keyword')
                                                 .addClass ('syntax-' + keyword_arg)
                                                 .text (keyword_arg[0]),
                                                 makeLeftBraceSpan(),
                                                 makeRhsSpan (keyword_arg[1]),
                                                 makeRightBraceSpan()) }))
          case 'func':
            if (wm.ParseTree.isMeterExpr (tok)) {
              var status = wm.ParseTree.getMeterStatus (tok)
              return tokSpan.append (makeFuncSpan ('meter'),
                                     argSpanMaker ([wm.ParseTree.getMeterIcon (tok)]),
                                     argSpanMaker (wm.ParseTree.getMeterLevel (tok)),
                                     status ? argSpanMaker (status) : ' ')
            }
	    var sugaredName = wm.ParseTree.makeSugaredName (tok, wm.makeSymbolName.bind(wm))
	    if (sugaredName)
              return (sugaredName[0] === symChar
                      ? wm.makeSymbolSpanWithName (tok.args[0],
						   sugaredName[1],
						   function (evt) {
						     evt.stopPropagation()
						     loadSymbol (tok.args[0])
						   })
                      : sugaredName.join(''))
            var noBraces = tok.args.length === 1 && (tok.args[0].type === 'func' || tok.args[0].type === 'lookup' || tok.args[0].type === 'alt')
            var funcSpan = tokSpan.append ($('<span class="syntax-func-name">').append (funcChar, tok.funcname))
            switch (wm.ParseTree.funcType (tok.funcname)) {
            case 'link':
              return funcSpan.append ([[tok.args[0]],
                                       [tok.args[1]],
                                       tok.args[2].args].map (argSpanMaker))
            case 'parse':
              return funcSpan.append ([tok.args[0].args, [tok.args[1]]].map (argSpanMaker))
            case 'apply':
              return funcSpan.append (tok.args.map (wrapArgSpanMaker))
            case 'push':
              return funcSpan.append ($('<span class="syntax-var">').append (varChar, tok.args[0].args[0].varname),
                                      tok.args.length > 1 ? argSpanMaker(tok.args.slice(1)) : '')
            case 'match':
              return funcSpan.append ('/', makeRhsSpan ([tok.args[0]]), '/', tok.args[1])
                .append (tok.args.slice(2).map (function (arg, n) {
                  return makeRhsSpan (n ? arg.args : [arg])
                }))
            case 'map':
              if (tok.args[0].varname !== wm.ParseTree.defaultMapVar)
                funcSpan.append (varChar, tok.args[0].varname, ':')
              return funcSpan.append ([tok.args[0].value,
                                       tok.args[0].local[0].args].map (argSpanMaker))
            case 'reduce':
              if (tok.args[0].varname !== wm.ParseTree.defaultMapVar)
                funcSpan.append (varChar, tok.args[0].varname, ':')
              return funcSpan.append (argSpanMaker (tok.args[0].value),
                                      varChar, tok.args[0].local[0].varname, '=',
                                      argSpanMaker (tok.args[0].local[0].value),
                                      argSpanMaker (tok.args[0].local[0].local[0].args))
            case 'vars':
              return funcSpan
            case 'call':
              return funcSpan.append (argSpanMaker ([tok.args[0]]),
                                      tok.args[1].args.map (wrapArgSpanMaker))
            case 'quote':
            case 'math':
            default:
              return funcSpan.append (argSpanMaker (tok.args))
              break
            }
            break
          default:
          case 'sym':
            return wm.makeSymbolSpan (tok,
                                      function (evt) {
                                        evt.stopPropagation()
                                        loadSymbol (tok)
                                      })
          }
        }))
    },

    makeTemplateSpan: function (rhs) {
      return this.makeRhsSpan (rhs,
                               this.makeTemplateSpan.bind (this),
                               this.showGrammarLoadSymbol.bind (this))
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
        return wm.ParseTree.getSymbolNodes(rhs).filter (function (rhsSym) {
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

    makeTipButton: function() {
      var wm = this
      return wm.makeSubNavIcon ('help', function() {
	wm.dealStatusCard()
      })
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
                       wm.subnavbar = $('<div class="subnavbar">').append
                       (wm.makeSubNavIcon ({ iconName: 'new', text: 'new phrase', callback: newSymbol }),
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
											focus: 'playerSearchInput',
                                                                                        clearThread: true,
                                                                                        generateNewContent: true }) }) }))
					       }))
              })

            wm.grammarBarDiv.append (wm.modalExitDiv = $('<div class="wikimess-modalexit">')
                                     .on ('click', wm.hideMenu)
                                     .hide())
          })
        })
    },

    hideMenu: function() {
      $('.rulemenu').hide()
      if (wm.modalExitDiv)
	wm.modalExitDiv.hide()
      wm.setUnfocusCallback()
    },

    addHelpIcons: function (div) {
      var wm = this
      var icons = div.find('span.helpicon')
      icons.each (function (n) {
        var iconSpan = icons.slice(n,n+1), iconName = iconSpan.attr('icon')
        wm.getIconPromise(wm.iconFilename[iconName])
          .done (function (svg) {
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
                                                            clearThread: true,
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
      case 'update':
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

    handleBroadcastMessage: function (msg) {
      var wm = this
      if (this.verbose.messages)
        console.log (msg)
      this.updateBroadcasts (msg)
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
