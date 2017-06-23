var GramBot = (function() {
  var proto = function (config) {
    var gb = this
    config = config || {}
    $.extend (this, config)
    this.Label = grambotLabel

    this.container = $('#'+this.containerID)
      .addClass("grambot")

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
    Object.keys(this.iconFilename).forEach (function (icon) { gb.getIconPromise (gb.iconFilename[icon]) })
    this.tabs.forEach (function (tab) { gb.getIconPromise (tab.icon) })

    // monitor connection
    io.socket.on('disconnect', function() {
      if (gb.suppressDisconnectWarning)
        location.reload()
      else
        gb.showModalMessage ("You have been disconnected. Attempting to re-establish connection",
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
    this.composition = {}

    // log in
    if (config.playerID) {
      this.playerID = config.playerID
      this.playerLogin = undefined  // we don't want to show the ugly generated login name if logged in via Facebook etc
      this.playerName = config.playerDisplayName
      this.socket_getPlayerSubscribe (this.playerID)
        .then (this.showInboxPage.bind (this))
    } else
      this.showLoginPage()
  }

  $.extend (proto.prototype, {
    // default constants
    containerID: 'grambot',
    localStorageKey: 'grambot',
    iconPrefix: '/images/icons/',
    iconSuffix: '.svg',
    blankImageUrl: '/images/1x1blank.png',
    facebookButtonImageUrl: '/images/facebook.png',
    maxPlayerNameLength: 16,
    maxGrammarTitleLength: 128,
    grammarAutosaveDelay: 5000,
    iconFilename: { edit: 'pencil',
                    create: 'circle-plus',
                    destroy: 'trash-can',
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
                    message: 'document',
                    follow: 'circle-plus',
                    unfollow: 'trash-can',
                    search: 'magnifying-glass',
                    compose: 'typewriter-icon',
                    forward: 'forward',
                    reply: 'reply',
                    reload: 'refresh' },
    
    themes: [ {style: 'plain', text: 'Plain', iconColor: 'black'},
              {style: 'l33t', text: 'L33t', iconColor: 'white'} ],

    tabs: [{ name: 'status', method: 'showStatusPage', icon: 'take-my-money', },
           { name: 'compose', method: 'showComposePage', icon: 'typewriter-icon' },
           { name: 'inbox', method: 'showInboxPage', icon: 'envelope' },
           { name: 'follows', method: 'showFollowsPage', icon: 'address-book-black' },
           { name: 'grammar', method: 'showGrammarEditPage', icon: 'printing-press' },
           { name: 'settings', method: 'showSettingsPage', icon: 'pokecog' }],
    
    verbose: { page: false,
               server: true,
               messages: true,
               timer: false,
               errors: true,
	       stack: false },

    suppressDisconnectWarning: true,

    preloadSounds: ['error','select','login','logout','gamestart'],

    // REST API
    REST_loginFacebook: function() {
      window.location.replace ('/login/facebook')
    },

    REST_postPlayer: function (playerName, playerPassword) {
      return $.post('/p/new', { name: playerName, password: playerPassword })
    },

    REST_postLogin: function (playerName, playerPassword) {
      return $.post('/login', { name: playerName, password: playerPassword })
    },

    REST_postLogout: function() {
      return $.post ('/logout')
    },

    REST_postPlayerSearchPlayersAll: function (playerID, queryText, page) {
      return $.post ('/p/' + playerID + '/search/players/all', { query: queryText, page: page })
    },

    REST_postPlayerSearchPlayersFollowed: function (playerID, queryText) {
      return $.post ('/p/' + playerID + '/search/players/followed', { query: queryText })
    },

    REST_postPlayerSearchSymbolsAll: function (playerID, queryText, page) {
      return $.post ('/p/' + playerID + '/search/symbols/all', { query: queryText, page: page })
    },

    REST_postPlayerSearchSymbolsOwned: function (playerID, queryText) {
      return $.post ('/p/' + playerID + '/search/symbols/owned', { query: queryText })
    },

    REST_postPlayerConfig: function (playerID, config) {
      return $.post ('/p/' + playerID + '/config', config)
    },

    REST_getPlayerFollow: function (playerID) {
      return $.get ('/p/' + playerID + '/follow')
    },

    REST_getPlayerFollowOther: function (playerID, otherID) {
      return $.get ('/p/' + playerID + '/follow/' + otherID)
    },

    REST_getPlayerUnfollowOther: function (playerID, otherID) {
      return $.get ('/p/' + playerID + '/unfollow/' + otherID)
    },

    REST_getPlayerStatus: function (playerID) {
      return $.get ('/p/' + playerID + '/status')
    },

    REST_getPlayerStatusOther: function (playerID, otherID) {
      return $.get ('/p/' + playerID + '/status/' + otherID)
    },

    REST_postId: function (playerName) {
      return $.post ('/id', { name: playerName })
    },

    REST_getPlayerInbox: function (playerID) {
      return $.get ('/p/' + playerID + '/inbox')
    },

    REST_getPlayerInboxCount: function (playerID) {
      return $.get ('/p/' + playerID + '/inbox/count')
    },

    REST_getPlayerOutbox: function (playerID) {
      return $.get ('/p/' + playerID + '/outbox')
    },

    REST_getPlayerMessage: function (playerID, messageID) {
      return $.get ('/p/' + playerID + '/message/' + messageID)
    },

    REST_getPlayerMessageHeader: function (playerID, messageID) {
      return $.get ('/p/' + playerID + '/message/' + messageID + '/header')
    },

    REST_getPlayerMessageSent: function (playerID, messageID) {
      return $.get ('/p/' + playerID + '/message/' + messageID + '/sent')
    },

    REST_postPlayerMessage: function (playerID, recipientID, symbolID, title, body) {
      return $.post ('/p/' + playerID + '/message', { recipient: recipientID,
                                                      symbol: symbolID,
                                                      title: title,
                                                      body: body })
    },

    REST_deletePlayerMessage: function (playerID, messageID) {
      return $.ajax ({ url: '/p/' + playerID + '/message/' + messageID,
		       method: 'DELETE' })
    },

    REST_putPlayerSymbol: function (playerID, symbolID, name, rules) {
      return $.ajax ({ url: '/p/' + playerID + '/symbol/' + symbolID,
                       method: 'PUT',
                       contentType: 'application/json',
                       data: JSON.stringify ({ name: name, rules: rules }) })
    },

    REST_deletePlayerSymbol: function (playerID, symbolID) {
      return $.ajax ({ url: '/p/' + playerID + '/symbol/' + symbolID,
                       method: 'DELETE' })
    },

    REST_expandPlayerSymbol: function (playerID, symbolID) {
      return $.get ('/p/' + playerID + '/expand/' + symbolID)
    },

    REST_getHelpHtml: function() {
      return $.get ('/html/grammar-editor-help.html')
    },

    // WebSockets interface
    socket_onPlayer: function (callback) {
      io.socket.on ('player', callback)
    },

    socket_onSymbol: function (callback) {
      io.socket.on ('symbol', callback)
    },

    socket_getPlayerSubscribe: function (playerID) {
      return this.socketGetPromise ('/p/' + playerID + '/subscribe')
    },

    socket_getPlayerUnsubscribe: function (playerID) {
      return this.socketGetPromise ('/p/' + playerID + '/unsubscribe')
    },
    
    socket_getPlayerSymbolNew: function (playerID) {
      return this.socketGetPromise ('/p/' + playerID + '/symbol')
    },

    socket_getPlayerSymbols: function (playerID) {
      return this.socketGetPromise ('/p/' + playerID + '/symbols')
    },

    socket_getPlayerSymbol: function (playerID, symbolID) {
      return this.socketGetPromise ('/p/' + playerID + '/symbol/' + symbolID)
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

    socketPostPromise: function (url, data) {
      var def = $.Deferred()
      io.socket.post (url, data, function (resData, jwres) {
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
      var gb = this
      return function (evt) {
        evt.preventDefault()
        evt.stopPropagation()
        if (elementToDisable) {
          if (elementToDisable.hasClass('already-clicked'))
            return;
          elementToDisable.addClass('already-clicked')
        }
        if (sfx.length)
          gb.selectSound = gb.playSound (sfx)
        callback.call (gb, evt)
      }
    },

    makeSilentLink: function (text, callback) {
      return this.makeLink (text, callback, '', true)
    },

    makeLink: function (text, callback, sfx, allowMultipleClicks) {
      var gb = this
      sfx = sfx || 'select'
      var link = $('<a href="#">')
          .text (text)
          .attr ('title', text)
      link.on ('click', this.callWithSoundEffect (callback, sfx, !allowMultipleClicks && link))
      return link
    },

    makeListLink: function (text, callback, sfx, allowMultipleClicks) {
      sfx = sfx || 'select'
      var li = $('<li>')
          .append ($('<span>')
                   .html(text))
      li.on ('click', this.callWithSoundEffect (callback, sfx, !allowMultipleClicks && li))
      return li
    },

    setPage: function (page) {
      var gb = this
      if (this.verbose.page)
	console.log ("Changing view from " + this.page + " to " + page)
      
      var def
      if (this.pageExit)
        def = this.pageExit()
      else {
        def = $.Deferred()
        def.resolve()
      }

      return def
        .then (function() {
          gb.page = page
        })
    },

    // login menu
    showLoginPage: function() {
      var gb = this
      return this.setPage ('login')
        .then (function() {
          gb.container
            .empty()
            .append ($('<div class="inputbar">')
                     .append ($('<form>')
                              .append ($('<label for="player">')
                                       .text('Player name'))
                              .append (gb.nameInput = $('<input name="player" type="text">')
                                       .attr('maxlength', gb.maxPlayerNameLength))
                              .append ($('<label for="player">')
                                       .text('Password'))
                              .append (gb.passwordInput = $('<input name="password" type="password">'))))
            .append ($('<div class="menubar">')
                     .append ($('<ul>')
                              .append (gb.makeListLink ('Log in', gb.doReturnLogin))
                              .append (gb.makeListLink ('Sign up', gb.createPlayer))
                              .append (gb.makeListLink ($('<img>').attr('src',gb.facebookButtonImageUrl), gb.REST_loginFacebook)
                                       .addClass("noborder"))))
          if (gb.playerLogin)
            gb.nameInput.val (gb.playerLogin)
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
      return this.doLogin (this.showInboxPage)
    },

    doInitialLogin: function() {
      return this.doLogin (this.showInboxPage)  // replace showInboxPage with login flow
    },

    doLogin: function (showNextPage) {
      var gb = this
      var fail = this.showLoginPage.bind (this)
      this.validatePlayerName
      (function() {
        gb.REST_postLogin (gb.playerLogin, gb.playerPassword)
          .done (function (data) {
	    if (gb.verbose.server)
              console.log ('doLogin:', data)
	    if (!data.player)
              gb.showModalMessage (data.message, fail)
	    else {
              gb.selectSound.stop()
              gb.playSound ('login')
	      gb.playerID = data.player.id
              gb.playerLogin = data.player.name
              gb.playerName = data.player.displayName
              gb.socket_getPlayerSubscribe (gb.playerID)
                .then (function() {
                  showNextPage.call(gb)
                })
	    }
          })
          .fail (function (err) {
	    gb.showModalWebError (err, fail)
          })
      }, fail)
    },

    createPlayer: function() {
      var gb = this
      var fail = this.showLoginPage.bind (this)
      this.validatePlayerName
      (function() {
        gb.REST_postPlayer (gb.playerLogin, gb.playerPassword)
          .done (function (data) {
	    gb.selectSound.stop()
	    gb.playSound ('login')
	    gb.doInitialLogin()
          })
          .fail (function (err) {
	    if (err.status == 400)
              gb.showModalMessage ("A player with that name already exists", fail)
	    else
              gb.showModalWebError (err, fail)
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

    reloadOnFail: function() {
      var gb = this
      return function (err) {
        gb.showModalWebError (err, gb.reloadCurrentTab.bind(gb))
      }
    },
    
    reloadCurrentTab: function() {
      delete this.lastSavePromise  // prevent stalling on error
      this[this.currentTab.method] ()
    },

    showNavBar: function (currentTab) {
      var gb = this
      
      var navbar
      this.container
        .empty()
        .append (navbar = $('<div class="navbar">'))

      this.messageCountDiv = $('<div class="messagecount">').hide()
      if (typeof(this.messageCount) === 'undefined')
	this.updateMessageCount()
      else
	this.updateMessageCountDiv()
	
      this.tabs.map (function (tab) {
        var span = $('<span>').addClass('navtab').addClass('nav-'+tab.name)
        gb.getIconPromise(tab.icon)
          .done (function (svg) {
            span.append ($(svg).addClass('navicon'))
	    if (tab.name === 'inbox')
	      span.append (gb.messageCountDiv)
          })
          .fail (function (err) {
            console.log(err)
          })
        if (tab.name === currentTab) {
          gb.currentTab = tab
          span.addClass('active')
        } else
          span.on ('click', gb.callWithSoundEffect (gb[tab.method]))
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
      var gb = this
      this.REST_getPlayerInboxCount (this.playerID)
	.then (function (result) {
	  gb.messageCount = result.count
	  gb.updateMessageCountDiv()
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
      var gb = this
      delete this.symbolCache
      delete this.lastPlayerSearch
      delete this.playerSearchResults
      delete this.lastSymbolSearch
      delete this.symbolSearchResults
      this.gamePosition = {}
      this.socket_getPlayerUnsubscribe (this.playerID)
	.then (function() {
	  gb.REST_postLogout()
	  gb.showLoginPage()
	})
    },
    
    // settings menu
    showSettingsPage: function() {
      var gb = this

      return this.setPage ('settings')
        .then (function() {
          gb.showNavBar ('settings')
          gb.container
            .append ($('<div class="menubar">')
                     .append ($('<ul>')
                              .append (gb.makeListLink ('Name', gb.showPlayerConfigPage))
                              .append (gb.makeListLink ('Audio', gb.showAudioPage))
                              .append (gb.makeListLink ('Themes', gb.showThemesPage))
                              .append (gb.makeListLink ('Log out', gb.doLogout))))
        })
    },
    
    // settings
    showPlayerConfigPage: function() {
      var gb = this
      return this.pushView ('name')
        .then (function() {
          var backLink = gb.makeLink ('Back', function() {
            backLink.off()
            gb.nameInput.prop('disabled',true)
            var newName = gb.nameInput.val()
            if (newName.length) {
              gb.playerName = newName
              gb.REST_postPlayerConfig (gb.playerID, { displayName: newName })
            }
            gb.popView()
          })
          gb.container
            .append (gb.makePageTitle ("Player details"))
            .append ($('<div class="menubar">')
                     .append ($('<div class="inputbar">')
                              .append ($('<form>')
                                       .append ($('<span>').text('Full name'))
                                       .append (gb.nameInput = $('<input type="text">')
                                                .val(gb.playerName)
                                                .attr('maxlength', gb.maxPlayerNameLength))))
                     .append (backLink))
        })
    },

    showThemesPage: function() {
      var gb = this

      var fieldset
      return this.pushView ('theme')
        .then (function() {
          gb.container
            .append (gb.makePageTitle ("Themes"))
            .append ($('<div class="menubar">')
                     .append (fieldset = $('<fieldset class="themegroup">')
                              .append ($('<legend>').text("Select theme")))
                     .append (gb.makeLink ('Back', gb.popView)))

          var label = {}, config = { silent: true }
          gb.themes.forEach (function (theme) {
            var id = 'theme-' + theme.style
            fieldset.append ($('<input type="radio" name="theme" id="'+id+'" value="'+theme.style+'">'))
	      .append (label[theme.style] = $('<label for="'+id+'" class="'+theme.style+'">')
                       .text(theme.text)
                       .on('click',gb.themeSelector(theme.style,config)))
          })

          label[gb.theme].click()
          config.silent = false
        })
    },

    themeSelector: function(style,config) {
      var gb = this
      var theme = gb.themes.find (function(t) { return t.style === style })
      return function() {
        if (!(config && config.silent))
          gb.playSound ('select')
	gb.themes.forEach (function (oldTheme) {
          gb.container.removeClass (oldTheme.style)
	})
        gb.container.addClass (theme.style)
        gb.theme = theme.style
        gb.themeInfo = theme
        gb.writeLocalStorage ('theme')
      }
    },

    showAudioPage: function() {
      var gb = this

      return this.pushView ('audio')
        .then (function() {
          var soundInput
          gb.container
            .append (gb.makePageTitle ("Audio settings"))
            .append ($('<div class="menubar">')
                     .append ($('<div class="card">')
                              .append (soundInput = $('<input type="range" value="50" min="0" max="100">'))
                              .append ($('<span>').text("Sound FX volume")))
                     .append ($('<ul>')
                              .append (gb.makeListLink ('Back', gb.popView))))

          soundInput.val (gb.soundVolume * 100)
          soundInput.on ('change', function() {
            gb.soundVolume = soundInput.val() / 100
            gb.playSound ('select')
            gb.writeLocalStorage ('soundVolume')
          })

          // restore disabled slide events for these controls
          soundInput.on('touchmove',function(e){e.stopPropagation()})
        })
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
      return this.setPage (newPage)
    },

    popView: function() {
      var gb = this
      var poppedView = this.pushedViews.pop()
      if (this.verbose.page)
	console.log ("Popping " + this.page + " view, returning to " + poppedView.page)
      this.container.find('.pushed').find('*').addBack().addClass('pushed')  // make sure any descendants added after the push are flagged as pushed
      this.container.find(':not(.pushed)').remove()
      poppedView.elements.find('*').addBack().removeClass('pushed').removeClass('already-clicked')
      return this.setPage (poppedView.page)
        .then (function() {
          gb.pageSuspend = poppedView.pageSuspend
          gb.pageResume = poppedView.pageResume
          gb.pageExit = poppedView.pageExit
          if (gb.pageResume)
            gb.pageResume()
        })
    },

    // compose message
    showComposePage: function (config) {
      var gb = this

      return this.setPage ('compose')
        .then (function() {
          gb.showNavBar ('compose')

          gb.playerSearchInput = $('<textarea class="recipient">')
          gb.playerSearchResultsDiv = $('<div class="results">')

          gb.symbolSearchInput = $('<textarea class="symbol">')
          gb.symbolSearchResultsDiv = $('<div class="results">')

          function inputSanitizer (allowHash) {
            return function() {
              var text = gb.symbolSearchInput.val()
              gb.symbolSearchInput.val (text === '' || (text === '#' && !allowHash) ? '' : gb.sanitizeSymbolName (text))
            }
          }
          gb.symbolSearchInput
            .on('keyup',inputSanitizer(true))
            .on('change',inputSanitizer(false))

          if (config.title)
            gb.composition.title = config.title
          
          gb.messageTitleInput = $('<textarea class="title">')
            .val (gb.composition.title)
            .on ('keyup', function() {
              gb.composition.title = gb.messageTitleInput.val()
            })

          if (config.body)
            gb.composition.body = config.body

          gb.messageBodyDiv = $('<div class="messagebody">')
          gb.showMessageBody()

          function send() {
            if (!gb.composition.recipient)
              gb.showCompose ("Please select a message recipient.")
            else if (!gb.composition.symbol)
              gb.showCompose ("Please select a source.")
            else if (!(gb.composition.body && gb.composition.body.length))
              gb.showCompose ("Please generate a nonempty message.")
            else if (!(gb.composition.title && gb.composition.title.length))
              gb.showCompose ("Please enter a message title.")
            else {
              gb.sendButton.off ('click')
              gb.REST_postPlayerMessage (gb.playerID, gb.composition.recipient.id, gb.composition.symbol.id, gb.composition.title, gb.composition.body)
                .then (function (result) {
                  gb.clearComposeRecipient()
                  gb.sendButton.on ('click', send)
                  gb.showOutbox()
                })
            }
          }
                    
          gb.container
            .append (gb.composeDiv = $('<div class="compose">')
                     .append ($('<div class="messageheader">')
                              .append ($('<div class="row">')
                                       .append ($('<span class="label">').text ('To:'),
                                                $('<span class="input">').append (gb.playerSearchInput,
                                                                                  gb.playerSearchResultsDiv)),
                                       $('<div class="row">')
                                       .append ($('<span class="label">').text ('Source:'),
                                                $('<span class="input">').append (gb.symbolSearchInput,
                                                                                 gb.symbolSearchResultsDiv)),
                                       $('<div class="row">')
                                       .append ($('<span class="label">').text ('Subject:'),
                                                $('<span class="input">').append (gb.messageTitleInput))),
                              gb.messageBodyDiv),
                     gb.mailboxDiv = $('<div class="mailbox">').hide(),
                     gb.readMessageDiv = $('<div class="readmessage">').hide(),
                     $('<div class="messagecontrols">').append
                     ($('<span>').append
                      (gb.randomizeButton = gb.makeIconButton ('randomize', function() {
                        gb.showCompose()
                        gb.generateMessageBody()
                      }),
                       gb.composeButton = gb.makeIconButton ('message', function() {
                         gb.showCompose()
                       }).hide(),
                       gb.destroyButton = gb.makeIconButton ('destroy', function(){}).hide()),
                      $('<span>').html
                      (gb.sendButton = gb.makeIconButton ('send', send),
                       gb.forwardButton = gb.makeIconButton ('forward', function(){}).hide()),
                      $('<span>').append
                      (gb.mailboxButton = gb.makeIconButton ('outbox', function() {
                        gb.showOutbox()
                      }),
                       gb.reloadButton = gb.makeIconButton ('reload', function() {
                         // clear screen and introduce a short delay so it looks more like a refresh
                         gb.mailboxDiv.empty()
                         window.setTimeout (gb.showOutbox.bind(gb), 10)
                       }).hide())))

          gb.restoreScrolling (gb.messageBodyDiv)

          if (config.recipient) {
            gb.composition.recipient = config.recipient
            gb.lastComposePlayerSearchText = config.recipient.name
          }

          gb.playerSearchInput.attr ('placeholder', 'Player name')
            .val (gb.lastComposePlayerSearchText)
          gb.playerSearchInput
            .on ('keyup', gb.doComposePlayerSearch.bind(gb))
            .on ('click', gb.doComposePlayerSearch.bind(gb,true))
          if (!gb.composition.recipient) {
            delete gb.lastComposePlayerSearchText
            gb.doComposePlayerSearch()
          }

          if (config.symbol)
            gb.composition.symbol = config.symbol
          // doing the following test separately of config.symbol guards against symbol being renamed
          if (gb.composition.symbol && gb.symbolName[gb.composition.symbol.id])
            gb.lastComposeSymbolSearchText = gb.symbolName[gb.composition.symbol.id]
          
          gb.symbolSearchInput.attr ('placeholder', 'Symbol name')
            .val (gb.lastComposeSymbolSearchText ? ('#' + gb.lastComposeSymbolSearchText) : undefined)
          gb.symbolSearchInput
            .on ('keyup', gb.doComposeSymbolSearch.bind(gb))
            .on ('click', gb.doComposeSymbolSearch.bind(gb,true))
          if (!gb.composition.symbol) {
            delete gb.lastComposeSymbolSearchText
            gb.doComposeSymbolSearch()
          }
        })
    },

    clearComposeRecipient: function() {
      var gb = this
      delete gb.composition.recipient
      gb.playerSearchInput.val('')
      gb.doComposePlayerSearch()
    },

    showCompose: function (error) {
      this.composeDiv.show()
      this.randomizeButton.show()
      this.sendButton.show()
      this.mailboxButton.show()
      this.composeButton.hide()
      this.forwardButton.hide()
      this.destroyButton.hide()
      this.reloadButton.hide()
      this.mailboxDiv.hide()
      this.readMessageDiv.hide()
      if (error)
        window.setTimeout (function() { alert(error) }, 10)
    },
    
    showOutbox: function() {
      var gb = this
      gb.mailboxDiv.show()
      gb.composeButton.show()
      gb.reloadButton.show()
      gb.mailboxButton.hide()
      gb.sendButton.hide()
      gb.forwardButton.hide()
      gb.randomizeButton.hide()
      gb.destroyButton.hide()
      gb.readMessageDiv.hide()
      gb.composeDiv.hide()
      gb.REST_getPlayerOutbox (gb.playerID)
        .then (function (result) {
          if (gb.verbose.server)
            console.log ('showOutbox:', result)
          gb.populateMailboxDiv ({ refresh: gb.showOutbox,
                                   title: 'Sent messages',
                                   messages: result.messages,
                                   method: 'REST_getPlayerMessageSent',
                                   verb: 'Sent',
                                   preposition: 'To',
                                   object: 'recipient',
                                   showMessage: function (message) {
                                     gb.composeButton.hide()
                                     gb.randomizeButton.hide()
                                     gb.sendButton.hide()
                                     gb.composeDiv.hide()
                                   }})
        })
    },

    populateMailboxDiv: function (props) {
      var gb = this
      gb.messageHeaderCache = {}
      gb.mailboxDiv
        .empty()
        .append ($('<span class="mailboxname">').text (props.title),
                 gb.mailboxContentsDiv = $('<span class="contents">')
                 .append (props.messages.map (gb.makeMailboxEntryDiv.bind (gb, props))))
    },

    makeMailboxEntryDiv: function (props, message) {
      var gb = this
      gb.messageHeaderCache[message.id] = message
      var deleteMessage = function (evt) {
        evt.stopPropagation()
        gb.REST_deletePlayerMessage (gb.playerID, message.id)
          .then (props.refresh.bind(gb))
      }
      var div = $('<div class="message">')
          .append ($('<div class="title">').text (message.title),
                   $('<span class="buttons">')
                   .append (gb.makeIconButton ('destroy', deleteMessage)),
                   $('<div class="player">').text (message[props.object].name))
          .on ('click', function() {
            gb[props.method] (gb.playerID, message.id)
              .then (function (result) {
                if (gb.verbose.server)
                  console.log ('populateMailboxDiv:', result)
                if (message.unread) {
                  div.removeClass ('unread')
                  delete message.unread
                  --gb.messageCount
                  gb.updateMessageCountDiv()
                }
                gb.populateReadMessageDiv ({ div: gb.readMessageDiv,
                                             verb: props.verb,
                                             preposition: props.preposition,
                                             object: props.object,
                                             message: result.message })
                gb.readMessageDiv.show()
                gb.mailboxButton.show()
                gb.destroyButton.show()
                  .off('click')
                  .on('click', deleteMessage)
                gb.forwardButton.show()
                  .off('click')
                  .on('click', function (evt) {
                    evt.stopPropagation()
                    gb.showComposePage
                    ({ symbol: result.message.symbol,
                       title: result.message.title,
                       body: result.message.body })
                  })
                gb.reloadButton.hide()
                gb.mailboxDiv.hide()
                props.showMessage (result.message)
              })
          })
      if (message.unread)
        div.addClass ('unread')
      return div
    },

    populateReadMessageDiv: function (props) {
      var gb = this
      var other = props.message[props.object]
      this.symbolName[props.message.symbol.id] = props.message.symbol.name
      props.div
        .empty()
        .append ($('<div class="messageheader">')
                 .append ($('<div class="row">')
                          .append ($('<span class="label">').text (props.preposition + ':'),
                                   $('<span class="field">').html ($('<span class="player">').text (other.name)
                                                                   .on ('click', function (evt) {
                                                                     gb.showOtherStatusPage (other)
                                                                   }))),
                          $('<div class="row">')
                          .append ($('<span class="label">').text ('Source:'),
                                   $('<span class="field">').append ($('<span class="lhslink">')
                                                                     .append ('#', $('<span class="name">').text (props.message.symbol.name)))),
                          $('<div class="row">')
                          .append ($('<span class="label">').text ('Subject:'),
                                   $('<span class="field">').text (props.message.title)),
                         $('<div class="row">')
                          .append ($('<span class="label">').text (props.verb + ':'),
                                   $('<span class="field">').text (new Date (props.message.date).toString()))),
                 $('<div class="messagebody">').text (props.message.body))
    },
    
    doComposePlayerSearch: function (forceNewSearch) {
      var gb = this
      var searchText = this.playerSearchInput.val()
      delete gb.composition.recipient
      if (forceNewSearch || searchText !== this.lastComposePlayerSearchText) {
        this.lastComposePlayerSearchText = searchText
        if (searchText.length)
          this.REST_postPlayerSearchPlayersFollowed (this.playerID, searchText)
          .then (function (result) {
	    if (gb.verbose.server)
              console.log ('doComposePlayerSearch:', result)
            gb.showComposePlayerSearchResults (result.results)
          })
        else
          gb.showComposePlayerSearchResults()
      }
    },
    
    showComposePlayerSearchResults: function (results) {
      var gb = this
      this.playerSearchResultsDiv
        .empty()
      if (results) {
        if (results.length)
          this.playerSearchResultsDiv
          .append (results.map (function (player) {
            return $('<span class="name">').text (player.name)
              .on ('click', function() {
                gb.playerSearchResultsDiv.empty()
                gb.composition.recipient = player
                gb.playerSearchInput.val (gb.lastComposePlayerSearchText = player.name)
              })
          }))
        else
          this.playerSearchResultsDiv.append ($('<span class="warning">').text ("No matching players found"))
      }
    },
    
    doComposeSymbolSearch: function (forceNewSearch) {
      var gb = this
      var searchText = this.symbolSearchInput.val().substr(1)
      delete gb.composition.symbol
      if (forceNewSearch || searchText !== this.lastComposeSymbolSearchText) {
        this.lastComposeSymbolSearchText = searchText
        if (searchText.length)
          this.REST_postPlayerSearchSymbolsOwned (this.playerID, searchText)
          .then (function (result) {
	    if (gb.verbose.server)
              console.log ('doComposeSymbolSearch:', result)
            gb.showComposeSymbolSearchResults (result.results)
          })
        else
          gb.showComposeSymbolSearchResults()
      }
    },
    
    showComposeSymbolSearchResults: function (results) {
      var gb = this
      this.symbolSearchResultsDiv
        .empty()
      if (results) {
        if (results.length)
          this.symbolSearchResultsDiv
          .append (results.map (function (symbol) {
            return $('<span class="lhslink">')
              .append ('#', $('<span class="name">').text (symbol.name))
              .on ('click', function() {
                gb.symbolSearchResultsDiv.empty()
                gb.composition.symbol = symbol
                gb.symbolSearchInput.val ('#' + (gb.lastComposeSymbolSearchText = symbol.name))
                if (!gb.messageTitleInput.val().length)
                  gb.messageTitleInput.val (gb.composition.title = symbol.name.replace (/_/g, ' '))
                gb.generateMessageBody()
              })
          }))
        else
          this.symbolSearchResultsDiv.append ($('<span class="warning">').text ("No matching symbols found"))
      }
    },

    showMessageBody: function() {
      var gb = this
      if (gb.composition.body && gb.composition.body.length)
        gb.messageBodyDiv.text (gb.composition.body)
      else
        gb.messageBodyDiv.empty().html ($('<span class="placeholder">')
                                        .text ('Select a source symbol to generate some message text.'))
    },
    
    generateMessageBody: function() {
      var gb = this
      gb.showMessageBody()
      gb.composition.body = ''
      if (gb.composition.symbol)
        gb.REST_expandPlayerSymbol (gb.playerID, gb.composition.symbol.id)
        .then (function (result) {
          if (gb.verbose.server)
            console.log ('generateMessageBody:', result)
          gb.composition.body = result.expansion
          if (result.expansion && result.expansion.length)
            gb.showMessageBody()
          else
            gb.messageBodyDiv.html ($('<span class="placeholder">')
                                    .text ('This symbol generated an empty message. Try re-rolling, or try a different symbol.'))
        })
      else
        gb.showCompose ('Please select a source symbol.')
    },

    // inbox
    showInboxPage: function() {
      var gb = this

      return this.setPage ('inbox')
        .then (function() {
          gb.showNavBar ('inbox')

          gb.container
            .append (gb.mailboxDiv = $('<div class="mailbox">'),
                     gb.readMessageDiv = $('<div class="readmessage">').hide(),
                     $('<div class="messagecontrols">').append
                     ($('<span>').append
                      (gb.replyButton = gb.makeIconButton ('reply', function(){}).hide()),
                      $('<span>').append
                      (gb.forwardButton = gb.makeIconButton ('forward', function(){}).hide()),
                      $('<span>').append
                      (gb.destroyButton = gb.makeIconButton ('destroy', function(){}).hide()),
                      $('<span>').append
                      (gb.mailboxButton = gb.makeIconButton ('inbox', function() {
                        gb.showInbox()
                      }),
                       gb.reloadButton = gb.makeIconButton ('reload', function() {
                         // clear screen and introduce a short delay so it looks more like a refresh
                         gb.mailboxDiv.empty()
                         window.setTimeout (gb.showInbox.bind(gb), 10)
                       }))))

          gb.showInbox()
        })
    },

    showInbox: function() {
      var gb = this
      gb.mailboxDiv.show()
      gb.reloadButton.show()
      gb.readMessageDiv.hide()
      gb.replyButton.hide()
      gb.forwardButton.hide()
      gb.destroyButton.hide()
      gb.mailboxButton.hide()
      gb.REST_getPlayerInbox (gb.playerID)
        .then (function (result) {
          if (gb.verbose.server)
            console.log ('showInbox:', result)
          gb.populateMailboxDiv ($.extend ({ messages: result.messages },
                                           gb.inboxProps()))
        })
    },

    inboxProps: function() {
      var gb = this
      return { refresh: gb.showInbox,
               title: 'Received messages',
               method: 'REST_getPlayerMessage',
               verb: 'Received',
               preposition: 'From',
               object: 'sender',
               showMessage: function (message) {
                 gb.replyButton
                   .off('click')
                   .on('click', function (evt) {
                     evt.stopPropagation()
                     var replyTitle = message.title
                     if (!replyTitle.match(/^re:/i))
                       replyTitle = 'Re: ' + replyTitle
                     gb.showComposePage
                     ({ recipient: message.sender,
                        symbol: message.symbol,
                        title: replyTitle,
                        body: '' })
                       .then (function() {
                         gb.generateMessageBody()
                       })
                   })
                 gb.replyButton.show()
               }}
    },

    updateInbox: function (messageID) {
      var gb = this
      this.updateMessageCount()
      if (this.page === 'inbox')
        this.REST_getPlayerMessageHeader (this.playerID, messageID)
        .then (function (result) {
          if (gb.verbose.server)
            console.log ('updateInbox:', result)
          if (gb.page === 'inbox')  // check again in case player switched pages while loading
            if (!gb.messageHeaderCache[result.message.id])
              gb.mailboxContentsDiv.append (gb.makeMailboxEntryDiv (gb.inboxProps(), result.message))
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
      var gb = this
      return this.setPage ('status')
        .then (function() {
          gb.showNavBar ('status')
          gb.showGameStatusPage (gb.REST_getPlayerStatus)
          gb.detailBarDiv.prepend ($('<div class="locbar">').html($('<h1>').text(gb.playerName)))
        })
    },

    showOtherStatusPage: function (follow) {
      var gb = this
      return this.pushView ('otherStatus')
        .then (function() {
          gb.otherStatusID = follow.id
          gb.makeFollowDiv (follow)
          gb.locBarDiv = $('<div class="locbar">')
          gb.showGameStatusPage (gb.REST_getPlayerStatusOther.bind (gb, gb.playerID, follow.id),
                                   function (status) {
                                     if (status.following)
                                       follow.makeUnfollowButton()
                                     gb.detailBarDiv
                                       .append ($('<div class="statusdiv">')
                                                .append (gb.locBarDiv))
                                   })
          gb.detailBarDiv.prepend (follow.followDiv)
          gb.container
	    .append ($('<div class="backbar">')
		     .append ($('<span>')
			      .html (gb.makeLink ('Back', gb.popView.bind(gb)))))
        })
    },

    showGameStatusPage: function (getMethod, callback) {
      var gb = this
      this.container
        .append (this.detailBarDiv = $('<div class="detailbar">'))

      this.restoreScrolling (this.detailBarDiv)

      getMethod.call (this, this.playerID, this.gameID)
	.done (function (status) {
	  if (gb.verbose.server)
	    console.log ('showGameStatusPage:', status)
          // render status
          if (callback)
            callback (status)
	})
        .fail (function (err) {
          console.log(err)
        })
    },

    // edit
    finishLastSave: function() {
      var lastSavePromise
      if (this.lastSavePromise)
        lastSavePromise = this.lastSavePromise
      else {
        lastSavePromise = $.Deferred()
        lastSavePromise.resolve()
      }
      return lastSavePromise
    },
    
    saveCurrentEdit: function() {
      var gb = this
      return this.finishLastSave()
        .then (function() {
          var def
          if (gb.unfocusAndSave) {
            def = gb.unfocusAndSave()
            delete gb.unfocusAndSave
          } else {
            def = $.Deferred()
            def.resolve()
          }
          gb.lastSavePromise = def
          return def
        })
    },

    makeIconButton: function (iconName, callback, color) {
      var button = $('<span>').addClass('button').text(iconName)
      this.getIconPromise (this.iconFilename[iconName])
        .done (function (svg) {
          svg = gb.colorizeIcon (svg, color || gb.themeInfo.iconColor)
          button.html ($(svg))
        })
      if (callback)
        button.on ('click', callback)
      return button
    },

    populateEditableSpan: function (div, props) {
      var gb = this
      var sanitize = props.sanitize || function(x) { return x }
      var parse = props.parse || sanitize
      var renderText = props.renderText || function(x) { return x }
      var renderHtml = props.renderHtml || renderText
      var oldText = renderText(props.content)
      var editCallback = function (evt) {
        evt.stopPropagation()
        div.off ('click')
        gb.saveCurrentEdit()
          .then (function() {
            if (props.locateSpan)
              div = props.locateSpan()
            var divRows = Math.round (div.height() / parseFloat(div.css('line-height')))
            var input = $('<textarea>').val(oldText).attr('rows',divRows)
            function sanitizeInput() { input.val (sanitize (input.val())) }
            input
              .on('keyup',sanitizeInput)
              .on('change',sanitizeInput)
              .on('click',function(evt){evt.stopPropagation()})
            if (props.keycodeFilter)
              input.on ('keydown', function (evt) {
                if (!props.keycodeFilter (evt.keyCode))
                  evt.preventDefault()
              })
            if (props.maxLength)
              input.attr ('maxlength', props.maxLength)
            gb.unfocusAndSave = function() {
              var def
              var newText = input.val()
              if (newText !== oldText) {
                var newContent = parse (newText)
                def = props.storeCallback (newContent)
                  .then (function (modifiedNewContent) {
                    props.content = modifiedNewContent || newContent
                  })
              } else {
                def = $.Deferred()
                def.resolve()
              }
              return def
                .then (function() {
                  gb.populateEditableSpan (div, props)
                })
            }
            div.html (input)
            input.focus()
          })
      }
      
      var buttonsDiv = $('<span class="buttons">')
      div.empty().append (renderHtml (props.content), buttonsDiv)
      
      if (props.isConstant)
        buttonsDiv.append (gb.makeIconButton ('locked'))
      else {
        div.on ('click', editCallback)
        buttonsDiv.append (gb.makeIconButton ('edit', editCallback))
        if (props.destroyCallback)
          buttonsDiv.append (gb.makeIconButton ('destroy', function (evt) {
            evt.stopPropagation()
            gb.saveCurrentEdit()
              .then (function() {
                
                if (props.confirmDestroy())
                  gb.lastSavePromise = props.destroyCallback()
              })
          }))
      }
      if (props.otherButtonDivs)
        buttonsDiv.append.apply (buttonsDiv, props.otherButtonDivs)
    },

    makeEditableSpan: function (props) {
      var span = $('<span>').addClass(props.className)
      this.populateEditableSpan (span, props)
      return span
    },

    saveSymbol: function (symbol) {
      var gb = this
      return gb.finishLastSave()
        .then (function() {
          gb.lastSavePromise = gb.REST_putPlayerSymbol (gb.playerID, symbol.id, gb.symbolName[symbol.id], symbol.rules)
            .then (function (result) {
              if (gb.verbose.server)
                console.log('putPlayerSymbol:',result)
              $.extend (gb.symbolName, result.name)
              return result.symbol
            })
          return gb.lastSavePromise
        })
    },

    renameSymbol: function (symbol, newName) {
      var gb = this
      return gb.finishLastSave()
        .then (function() {
          gb.lastSavePromise = gb.REST_putPlayerSymbol (gb.playerID, symbol.id, newName, symbol.rules)
            .then (function (result) {
              if (gb.verbose.server)
                console.log('putPlayerSymbol:',result)
              gb.updateSymbolCache (result)
            }).fail (function (err) {
              var reload = gb.reloadCurrentTab.bind(gb)
	      if (err.status == 400)
                gb.showModalMessage ("A symbol with that name already exists", reload)
              else
                gb.showModalWebError (err, reload)
            })
        })
    },

    updateSymbolCache: function (result) {
      var gb = this
      var symbol = result.symbol
      var oldName = this.symbolName[symbol.id]
      $.extend (this.symbolName, result.name)
      if (oldName) {
        if (oldName !== symbol.name) {
          gb.symbolName[symbol.id] = symbol.name
          gb.ruleDiv[symbol.id].remove()
          gb.placeGrammarRuleDiv (symbol)
          gb.referringSymbols(symbol).forEach (function (lhsSymbol) {
            if (lhsSymbol.id !== symbol.id)
              gb.populateGrammarRuleDiv (gb.ruleDiv[lhsSymbol.id], lhsSymbol)
          })
        } else if (this.symbolCache[symbol.id]) {
          $.extend (this.symbolCache[symbol.id], symbol)
          if (this.ruleDiv[symbol.id])
            this.populateGrammarRuleDiv (this.ruleDiv[symbol.id], this.symbolCache[symbol.id])
        }
      }
    },

    parseRhs: function (rhs) {
      var gb = this
      var regex = /((.*?)#([A-Za-z0-9_]+)|(.+))/g, match
      var parsed = []
      var name2id = this.symbolNameToID()
      while ((match = regex.exec(rhs))) {
        if (match[4] && match[4].length)
          parsed.push (match[4])
        else {
          if (match[2].length)
            parsed.push (match[2])
          var lhsName = match[3]
          if (lhsName) {
            var lhsRef = { name: lhsName }
            var lhsID = name2id[lhsName]
          if (lhsID)
            lhsRef.id = lhsID
            parsed.push (lhsRef)
          }
        }
      }
      return parsed
    },

    symbolOwnedByPlayer: function (symbol) {
      return symbol.owner.id === this.playerID
    },

    symbolEditableByPlayer: function (symbol) {
      return this.symbolOwnedByPlayer(symbol) || typeof(symbol.owner.id) === 'undefined' || symbol.owner.id === null
    },
    
    makeGrammarRhsDiv: function (symbol, ruleDiv, rhs, n) {
      var span = gb.makeEditableSpan ({ className: 'rhs',
                                        content: rhs,
                                        isConstant: !gb.symbolEditableByPlayer (symbol),
                                        confirmDestroy: function() {
                                          return !symbol.rules[n].length || window.confirm('Delete this expansion for symbol #' + gb.symbolName[symbol.id] + '?')
                                        },
                                        destroyCallback: function() {
                                          symbol.rules.splice(n,1)
                                          gb.populateGrammarRuleDiv (ruleDiv, symbol)
                                          return gb.saveSymbol (symbol)
                                        },
                                        storeCallback: function (newRhs) {
                                          symbol.rules[n] = newRhs
                                          return gb.saveSymbol (symbol)
                                            .then (function (newSymbol) {
					      console.log ('old='+JSON.stringify(symbol.rules)+' new='+JSON.stringify(newSymbol.rules))
                                              return newSymbol.rules[n]
                                            })
                                        },
                                        locateSpan: function() {
                                          return gb.ruleDiv[symbol.id].find('.rhs').eq(n)
                                        },
                                        parse: gb.parseRhs.bind(gb),
                                        renderText: function (rhs) {
                                          return rhs.map (function (rhsSym) {
                                            return (typeof(rhsSym) === 'object'
                                                    ? ('#' + (gb.symbolName[rhsSym.id] || rhsSym.name))
                                                    : rhsSym)
                                          }).join('')
                                        },
                                        renderHtml: function (rhs) {
                                          return $('<span>')
                                            .append (rhs.map (function (rhsSym) {
                                              var span = $('<span>')
                                              if (typeof(rhsSym) === 'object') {
                                                var name = $('<span class="name">')
                                                span.addClass('lhslink').append ('#', name)
                                                if (typeof(rhsSym.id) !== 'undefined' && !gb.symbolName[rhsSym.id]) {
                                                  console.log('oops; empty symbol name')
                                                }
                                                if (typeof(rhsSym.id) !== 'undefined')
                                                  name.text (gb.symbolName[rhsSym.id])
                                                  .on ('click', function (evt) {
                                                    evt.stopPropagation()
                                                    gb.loadGrammarSymbol (rhsSym)
                                                  })
                                                else {
                                                  console.log('renderHtml: using placeholder for '+rhsSym.name)
                                                  name.text (rhsSym.name)
                                                }
                                              } else
                                                span.text (rhsSym)
                                              return span
                                            }))
                                        }
                                      })
      return span
    },
    
    populateGrammarRuleDiv: function (ruleDiv, symbol) {
      var gb = this
      var lhs = gb.symbolName[symbol.id]
      var editable = gb.symbolEditableByPlayer (symbol)
      var owned = gb.symbolOwnedByPlayer (symbol)
      ruleDiv.empty()
        .append (this.makeEditableSpan
                 ({ className: 'lhs',
                    content: lhs,
                    renderText: function(lhs) { return '#' + lhs },
                    sanitize: gb.sanitizeSymbolName,
                    parse: function(hashLhs) { return hashLhs.substr(1) },
                    keycodeFilter: function (keycode) {
                      return (keycode >= 65 && keycode <= 90)   // a...z
                        || (keycode >= 48 && keycode <= 57)  // 0...9
                        || (keycode === 189)   // -
                        || (keycode === 32)  // space
                        || (keycode === 37 || keycode === 39)  // left, right arrow
                        || (keycode === 8)  // backspace/delete
                    },
                    description: 'symbol #' + lhs + ' and all its expansions',
                    isConstant: !editable,
                    confirmDestroy: function() {
                      return window.confirm('Relinquish ownership of symbol #' + gb.symbolName[symbol.id] + '?')
                    },
                    destroyCallback: owned && function() {
                      gb.removeGrammarRule (symbol)
                      return gb.REST_deletePlayerSymbol (gb.playerID, symbol.id)
                    },
                    storeCallback: function (newLhs) {
                      return gb.renameSymbol (symbol, newLhs)
                    },
                    otherButtonDivs: (owned
                             ? []
                             : [ gb.makeIconButton
                                 ('hide', function (evt) {
                                   evt.stopPropagation()
                                   gb.saveCurrentEdit()
                                     .then (function() {
                                       gb.removeGrammarRule (symbol)
                                     })
                                 })])
                    .concat ([gb.makeIconButton
                              ('randomize', function (evt) {
                                evt.stopPropagation()
                                gb.saveCurrentEdit()
                                  .then (function() {
                                    gb.saveCurrentEdit()
                                      .then (function() {
                                        gb.REST_expandPlayerSymbol (gb.playerID, symbol.id)
                                          .then (function (result) {
                                            if (gb.verbose.server)
                                              console.log ('populateGrammarRuleDiv:', result)
                                            gb.showingHelp = false
		                            gb.infoPaneTitle.text ('#' + gb.symbolName[symbol.id])
		                            gb.infoPaneContent.text (result.expansion)
                                            gb.infoPaneControls
                                              .html (gb.makeIconButton
                                                     ('compose',
                                                      function (evt) {
                                                        evt.stopPropagation()
                                                        gb.saveCurrentEdit()
                                                          .then (function() {
                                                            gb.showComposePage
                                                            ({ symbol: symbol,
                                                               title: gb.symbolName[symbol.id].replace(/_/g,' '),
                                                               body: result.expansion })
                                                          })
                                                      }))
		                            gb.infoPane.show()
                                          })
                                      })
                                  })
                              })])
                    .concat (editable
                             ? [ gb.makeIconButton
                                 ('create', function (evt) {
                                   evt.stopPropagation()
                                   gb.saveCurrentEdit()
                                     .then (function() {
                                       var newRhs = symbol.rules.length ? symbol.rules[symbol.rules.length-1] : []
                                       ruleDiv.append (gb.makeGrammarRhsDiv (symbol, ruleDiv, newRhs, symbol.rules.length))
                                       symbol.rules.push (newRhs)
                                       gb.selectGrammarRule (symbol)
                                       gb.saveSymbol (symbol)  // should probably give focus to new RHS instead, here
                                     })
                                 }) ]
                             : [])
                  }),
                 symbol.rules.map (function (rhs, n) {
                   return gb.makeGrammarRhsDiv (symbol, ruleDiv, rhs, n)
                 }))
    },

    sanitizeSymbolName: function (text) {
      return '#' + text.replace(/ /g,'_').replace(/[^A-Za-z0-9_]/g,'')
    },

    loadGrammarSymbol: function (symbol) {
      var gb = this
      gb.saveCurrentEdit()
        .then (function() {
          if (gb.symbolCache[symbol.id])
            gb.scrollGrammarTo (gb.symbolCache[symbol.id])
          else
            gb.socket_getPlayerSymbol (gb.playerID, symbol.id)
            .then (function (result) {
              if (gb.verbose.server)
                console.log('getPlayerSymbol:',result)
              $.extend (gb.symbolName, result.name)
              gb.symbolCache[result.symbol.id] = result.symbol
              gb.placeGrammarRuleDiv (result.symbol)
              gb.scrollGrammarTo (result.symbol)
            })
        })
    },
    
    removeGrammarRule: function (symbol) {
      this.ruleDiv[symbol.id].remove()
      delete this.ruleDiv[symbol.id]
      delete this.symbolCache[symbol.id]
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
      var name = gb.symbolName[symbol.id]
      var nextSym = syms.find (function (s) { return gb.symbolName[s.id] > name })
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
      var gb = this
      $('.selected').removeClass('selected')
      gb.ruleDiv[symbol.id].addClass('selected')
    },
    
    cachedSymbols: function() {
      var gb = this
      return Object.keys(this.symbolCache).map (function (id) {
        return gb.symbolCache[id]
      }).sort (function (a, b) { return gb.symbolName[a.id] < gb.symbolName[b.id] ? -1 : +1 })
    },

    symbolNameToID: function() {
      var gb = this
      var name2id = {}
      Object.keys(this.symbolName).forEach (function (id) {
        name2id[gb.symbolName[id]] = parseInt (id)
      })
      return name2id
    },

    getSymbol: function (symbolName) {
      var gb = this
      return this.symbolCache[Object.keys(this.symbolName).find (function (id) { return gb.symbolName[id] === symbolName })]
    },
    
    lhsRefersTo: function (lhsSymbol, rhsSymbol) {
      return lhsSymbol.rules.find (function (rhs) {
        return rhs.find (function (rhsSym) {
          return typeof(rhsSym) === 'object' && rhsSym.id === rhsSymbol.id
        })
      })
    },

    referringSymbols: function (rhsSymbol) {
      var gb = this
      return this.cachedSymbols().filter (function (lhsSymbol) {
        return gb.lhsRefersTo (lhsSymbol, rhsSymbol)
      })
    },

    showGrammarEditPage: function() {
      var gb = this
      return this.setPage ('grammar')
        .then (function() {
          gb.showNavBar ('grammar')

          var def
          if (gb.symbolCache) {
            def = $.Deferred()
            def.resolve()
          } else {
            def = gb.socket_getPlayerSymbols (gb.playerID)
              .then (function (result) {
                if (gb.verbose.server)
                  console.log('getPlayerSymbols:',result)
                gb.symbolCache = {}
                result.symbols.forEach (function (symbol) {
                  gb.symbolCache[symbol.id] = symbol
                })
                $.extend (gb.symbolName, result.name)
              })
          }

          def.then (function() {
            
            gb.pageExit = function() {
	      gb.container.off ('click')
              return gb.saveCurrentEdit()
            }

            gb.container.on ('click', gb.saveCurrentEdit.bind(gb))
            gb.grammarBarDiv = $('<div class="grammarbar">')

            gb.infoPane = $('<div class="grammarinfopane">')
            gb.infoPaneContent = $('<div class="content">')
            gb.infoPaneTitle = $('<div class="title">')
            gb.infoPane.append ($('<span class="closebutton">').html
                                (gb.makeIconButton ('close', function() {
                                  gb.infoPane.hide()
                                  gb.showingHelp = false
                                })),
		                gb.infoPaneTitle,
		                gb.infoPaneContent,
                                gb.infoPaneControls = $('<span class="controls">'))

            gb.showingHelp = false

            gb.searchInput = $('<input>')
            gb.symbolSearchResultsDiv = $('<div class="results">')
            gb.endSearchResultsDiv = $('<div class="endresults">')
            var searchButton = $('<span>')

            gb.container
	      .append ($('<div class="search">')
                       .append ($('<div class="query">')
                                .append (searchButton, gb.searchInput)),
                       gb.symbolSearchDiv = $('<div class="symbolsearch">')
                       .append (gb.symbolSearchResultsDiv,
                                gb.endSearchResultsDiv)
                       .hide(),
                       gb.grammarBarDiv,
                       gb.infoPane.hide(),
                       $('<div class="grammareditbuttons">').append
                       ($('<span class="help">').html
                        (gb.makeIconButton ('help', function() {
                          if (gb.showingHelp) {
                            gb.infoPane.hide()
                            gb.showingHelp = false
                          } else                            
		            gb.REST_getHelpHtml().then (function (helpHtml) {
		              gb.saveCurrentEdit()
                                .then (function() {
                                  gb.showingHelp = true
		                  gb.infoPaneTitle.text ('Help')
		                  gb.infoPaneContent.html (helpHtml)
                                  gb.infoPaneControls.empty()
		                  gb.infoPane.show()
                                })
		            })
                        })),
                        ($('<span class="newlhs">').html
                         (gb.makeIconButton ('create', function() {
		           gb.saveCurrentEdit()
                             .then (function() {
                               return gb.socket_getPlayerSymbolNew (gb.playerID)
                             }).then (function (result) {
                               if (gb.verbose.server)
                                 console.log('getPlayerSymbolNew:',result)
                               gb.symbolCache[result.symbol.id] = result.symbol
                               $.extend (gb.symbolName, result.name)
                               gb.placeGrammarRuleDiv (result.symbol)
                             })
                         })))))

            gb.searchInput.attr ('placeholder', 'Search symbols')
            gb.placeIcon (gb.iconFilename.search, searchButton)
            searchButton.addClass('button')
              .on ('click', gb.doSymbolSearch.bind(gb))
            gb.searchInput.on ('keyup', function(event) {
              gb.doSymbolSearch()
            })
            gb.showSymbolSearchResults()

            gb.restoreScrolling (gb.symbolSearchResultsDiv)
            gb.restoreScrolling (gb.grammarBarDiv)
            gb.restoreScrolling (gb.infoPaneContent)

            gb.ruleDiv = {}
            gb.grammarBarDiv
              .append (gb.cachedSymbols().map (gb.makeGrammarRuleDiv.bind (gb)))
          })
        })
    },

    clearSymbolSearch: function() {
      this.searchInput.val('')
      this.doSymbolSearch()
    },
    
    doSymbolSearch: function() {
      var gb = this
      var searchText = this.searchInput.val()
      if (searchText !== this.lastSymbolSearch) {
        this.lastSymbolSearch = searchText
        delete this.symbolSearchResults
        this.REST_postPlayerSearchSymbolsAll (this.playerID, searchText)
          .then (function (ret) {
	    if (gb.verbose.server)
              console.log ('doSymbolSearch:', ret)
            gb.symbolSearchResults = ret
            gb.showSymbolSearchResults()
          })
      }
    },

    continueSymbolSearch: function() {
      var gb = this
      if (this.searchInput.val() === this.lastSymbolSearch) {
        this.REST_postPlayerSearchSymbolsAll (this.playerID, this.lastSymbolSearch, this.symbolSearchResults.page + 1)
          .then (function (ret) {
	    if (gb.verbose.server)
              console.log ('continueSymbolSearch:', ret)
            gb.symbolSearchResults.results = gb.symbolSearchResults.results.concat (ret.results)
            gb.symbolSearchResults.more = ret.more
            gb.symbolSearchResults.page = ret.page
            gb.showSymbolSearchResults()
          })
      } else
        this.doSymbolSearch()
    },

    showSymbolSearchResults: function() {
      this.searchInput.val (this.lastSymbolSearch || '')
      this.symbolSearchResults = this.symbolSearchResults || { results: [] }
      this.symbolSearchResultsDiv.empty()
      this.endSearchResultsDiv.empty()
      this.symbolSearchDiv.hide()
      if (this.lastSymbolSearch && this.lastSymbolSearch.length) {
        this.symbolSearchDiv.show()
        this.symbolSearchResultsDiv
          .append ($('<span class="closebutton">').html
                   (gb.makeIconButton ('close', gb.clearSymbolSearch.bind(gb))),
                   $('<div class="searchtitle">').text("Search results"),
                   this.makeSymbolDivs (this.symbolSearchResults.results, "There are no symbols matching '" + this.lastSymbolSearch + "'."))
        var more = $('<span>')
        this.endSearchResultsDiv.append(more)
        if (this.symbolSearchResults.more)
          more.addClass('more').text('More')
          .on ('click', function (evt) {
            evt.preventDefault()
            more.remove()
            gb.continueSymbolSearch()
          })
        else if (this.symbolSearchResults.results.length)
          more.text('All matching symbols shown')
      }
    },

    makeSymbolDivs: function (symbols, emptyMessage) {
      var gb = this
      return symbols.length
        ? symbols.map (function (symbol) {
          return $('<div class="symbol">')
            .append ($('<span class="lhslink">').append ('#', $('<span class="name">').text (symbol.name))
                     .on ('click', function (evt) {
                       evt.stopPropagation()
                       gb.loadGrammarSymbol (symbol)
                     })
                    )
        })
      : $('<span>').text (emptyMessage)
    },

    // follows
    showFollowsPage: function() {
      var gb = this
      
      return this.setPage ('follows')
        .then (function() {
          gb.showNavBar ('follows')

          gb.searchInput = $('<input>')
          gb.playerSearchResultsDiv = $('<div class="results">')
          gb.endSearchResultsDiv = $('<div class="endresults">')
          var searchButton = $('<span>')
          gb.container
            .append (gb.whoBarDiv = $('<div class="whobar">')
                     .append ($('<div class="search">')
                              .append ($('<div class="query">')
                                       .append (searchButton, gb.searchInput),
                                       gb.playerSearchDiv = $('<div class="followsection">')
                                       .append (gb.playerSearchResultsDiv,
                                                gb.endSearchResultsDiv))))
          gb.searchInput.attr ('placeholder', 'Search players')
          gb.placeIcon (gb.iconFilename.search, searchButton)
          searchButton.addClass('button')
            .on ('click', gb.doPlayerSearch.bind(gb))
          gb.searchInput.on ('keyup', function(event) {
              gb.doPlayerSearch()
          })
          
          gb.restoreScrolling (gb.whoBarDiv)

          gb.followsById = {}
          gb.whoBarDiv.append (gb.addressBookDiv = $('<div>'))

          gb.showPlayerSearchResults()
          gb.updateAddressBook()
        })
    },

    updateAddressBook: function() {
      var gb = this
      gb.REST_getPlayerFollow (gb.playerID)
	.done (function (data) {
	  if (gb.verbose.server)
	    console.log ('updateAddressBook:', data)
          gb.addressBookDiv
            .empty()
            .append ($('<div class="followsection">')
                     .append ($('<div class="title">').text("Address book"))
                     .append (gb.makeFollowDivs (data.followed, "Your address book is empty.")))
          var following = {}
          data.followed.map (function (follow) {
            following[follow.id] = true
          })
	}).fail (gb.reloadOnFail())
    },
    
    makeFollowDiv: function (follow) {
      var followClass = 'followcontrol-' + follow.id, followSelector = '.' + followClass
      var buttonDiv = $('<span class="followcontrol">').addClass(followClass)
      var composeDiv =  $('<span class="followcontrol">')
          .html (gb.makeIconButton ('compose',
                                    function (evt) {
                                      evt.stopPropagation()
                                      gb.showComposePage ({ recipient: follow })
                                    }))
      var doFollow, doUnfollow
      function makeUnfollowButton() {
        $(followSelector).add(buttonDiv)
          .off()
          .html (gb.makeIconButton ('unfollow',
                                    gb.callWithSoundEffect (doUnfollow, 'select', $(followSelector).add(buttonDiv))))
	  .removeClass('already-clicked')
      }
      function makeFollowButton() {
        $(followSelector).add(buttonDiv)
          .off()
          .html (gb.makeIconButton ('follow',
                                    gb.callWithSoundEffect (doFollow, 'select', $(followSelector).add(buttonDiv))))
	  .removeClass('already-clicked')
      }
      doFollow = function() {
        gb.REST_getPlayerFollowOther (gb.playerID, follow.id)
          .then (function() {
	    follow.setFollowing(true)
	    follow.makeUnfollowButton()
            gb.updateAddressBook()
	  })
      }
      doUnfollow = function() {
        gb.REST_getPlayerUnfollowOther (gb.playerID, follow.id)
          .then (function() {
	    follow.setFollowing(false)
	    follow.makeFollowButton()
            gb.updateAddressBook()
	  })
      }
      if (follow.following)
        makeUnfollowButton()
      else
        makeFollowButton()
      var nameDiv = $('<span class="name">').text (follow.name)
      var followDiv = $('<div class="follow">')
          .append (nameDiv, composeDiv, buttonDiv)
      $.extend (follow, { followDiv: followDiv,
                          nameDiv: nameDiv,
                          buttonDiv: buttonDiv,
                          setFollowing: function(flag) { follow.following = flag },
                          makeFollowButton: makeFollowButton,
                          makeUnfollowButton: makeUnfollowButton })
    },

    makeFollowDivs: function (followList, emptyMessage) {
      var gb = this
      return followList.length
        ? followList.map (function (follow) {
          gb.followsById[follow.id] = gb.followsById[follow.id] || []
          gb.followsById[follow.id].push (follow)
          gb.makeFollowDiv (follow)
          follow.setFollowing = function (flag) {
            gb.followsById[follow.id].forEach (function (f) { f.following = flag })
          }
          follow.followDiv
            .on ('click', gb.callWithSoundEffect (gb.showOtherStatusPage.bind (gb, follow)))
          return follow.followDiv
        })
      : $('<span>').text (emptyMessage)
    },

    clearPlayerSearch: function() {
      this.searchInput.val('')
      this.doPlayerSearch()
    },

    doPlayerSearch: function() {
      var gb = this
      var searchText = this.searchInput.val()
      if (searchText !== this.lastPlayerSearch) {
        this.lastPlayerSearch = searchText
        delete this.playerSearchResults
        this.REST_postPlayerSearchPlayersAll (this.playerID, searchText)
          .then (function (ret) {
	    if (gb.verbose.server)
              console.log ('doPlayerSearch:', ret)
            gb.playerSearchResults = ret
            gb.showPlayerSearchResults()
          })
      }
    },

    continuePlayerSearch: function() {
      var gb = this
      if (this.searchInput.val() === this.lastPlayerSearch) {
        this.REST_postPlayerSearchPlayersAll (this.playerID, this.lastPlayerSearch, this.playerSearchResults.page + 1)
          .then (function (ret) {
	    if (gb.verbose.server)
              console.log ('continuePlayerSearch:', ret)
            gb.playerSearchResults.results = gb.playerSearchResults.results.concat (ret.results)
            gb.playerSearchResults.more = ret.more
            gb.playerSearchResults.page = ret.page
            gb.showPlayerSearchResults()
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
          .append ($('<span class="closebutton">').html
                   (gb.makeIconButton ('close', gb.clearPlayerSearch.bind(gb))),
                   $('<div class="searchtitle">').text("Search results"),
                   this.makeFollowDivs (this.playerSearchResults.results, "There are no players matching '" + this.lastPlayerSearch + "'."))
        var more = $('<span>')
        this.endSearchResultsDiv.append(more)
        if (this.playerSearchResults.more)
          more.addClass('more').text('More')
          .on ('click', function (evt) {
            evt.preventDefault()
            more.remove()
            gb.continuePlayerSearch()
          })
        else if (this.playerSearchResults.results.length)
          more.text('All matching players shown')
      }
    },
    
    // socket message handlers
    handlePlayerMessage: function (msg) {
      var gb = this
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
