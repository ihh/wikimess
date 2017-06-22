var BigHouse = (function() {
  var proto = function (config) {
    var bh = this
    config = config || {}
    $.extend (this, config)
    this.Label = bighouseLabel

    this.container = $('#'+this.containerID)
      .addClass("bighouse")

    this.localStorage = { playerLogin: undefined,
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
    this.socket_onSymbol (this.handleSymbolMessage.bind (this))

    this.preloadSounds.forEach (this.loadSound)
    io.socket.on('disconnect', function() {
      if (bh.suppressDisconnectWarning)
        location.reload()
      else
        bh.showModalMessage ("You have been disconnected. Attempting to re-establish connection",
			     location.reload.bind (location, true))
    })

    // prevent scrolling/viewport bump on iOS Safari
    document.addEventListener ('touchmove', function(e){
      e.preventDefault()
    }, {passive: false})

    this.themeSelector(this.theme,{silent:true}) ()
    
    this.pushedViews = []
    this.iconPromise = {}

    if (config.playerID) {
      this.playerID = config.playerID
      this.playerLogin = undefined  // we don't want to show the ugly generated login name if logged in via Facebook etc
      this.playerName = config.playerDisplayName
      this.showInboxPage()
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
                    search: 'magnifying-glass' },
    
    themes: [ {style: 'plain', text: 'Plain', iconColor: 'black'},
              {style: 'cardroom', text: 'Card room', iconColor: 'white'} ],

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

    REST_getLogout: function() {
      return $.post('/logout')
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
        evt.preventDefault()
        evt.stopPropagation()
        if (elementToDisable) {
          if (elementToDisable.hasClass('already-clicked'))
            return;
          elementToDisable.addClass('already-clicked')
        }
        if (sfx.length)
          bh.selectSound = bh.playSound (sfx)
        callback.call (bh, evt)
      }
    },

    makeSilentLink: function (text, callback) {
      return this.makeLink (text, callback, '', true)
    },

    makeLink: function (text, callback, sfx, allowMultipleClicks) {
      var bh = this
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
      var bh = this
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
          bh.page = page
        })
    },

    // login menu
    showLoginPage: function() {
      var bh = this
      this.setPage ('login')
        .then (function() {
          bh.container
            .empty()
            .append ($('<div class="inputbar">')
                     .append ($('<form>')
                              .append ($('<label for="player">')
                                       .text('Player name'))
                              .append (bh.nameInput = $('<input name="player" type="text">')
                                       .attr('maxlength', bh.maxPlayerNameLength))
                              .append ($('<label for="player">')
                                       .text('Password'))
                              .append (bh.passwordInput = $('<input name="password" type="password">'))))
            .append ($('<div class="menubar">')
                     .append ($('<ul>')
                              .append (bh.makeListLink ('Log in', bh.doReturnLogin))
                              .append (bh.makeListLink ('Sign up', bh.createPlayer))
                              .append (bh.makeListLink ($('<img>').attr('src',bh.facebookButtonImageUrl), bh.REST_loginFacebook)
                                       .addClass("noborder"))))
          if (bh.playerLogin)
            bh.nameInput.val (bh.playerLogin)
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
      return this.doLogin (this.showInitialUploadPage)
    },

    doLogin: function (showNextPage) {
      var bh = this
      var fail = this.showLoginPage.bind (this)
      this.validatePlayerName
      (function() {
        bh.REST_postLogin (bh.playerLogin, bh.playerPassword)
          .done (function (data) {
	    if (bh.verbose.server)
              console.log (data)
	    if (!data.player)
              bh.showModalMessage (data.message, fail)
	    else {
              bh.selectSound.stop()
              bh.playSound ('login')
	      bh.playerID = data.player.id
              bh.playerLogin = data.player.name
              bh.playerName = data.player.displayName
              bh.socket_getPlayerSubscribe (bh.playerID)
                .then (function() {
                  showNextPage.call(bh)
                })
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

    reloadOnFail: function() {
      var bh = this
      return function (err) {
        bh.showModalWebError (err, bh.reloadCurrentTab.bind(bh))
      }
    },
    
    reloadCurrentTab: function() {
      delete this.lastSavePromise  // prevent stalling on error
      this[this.currentTab.method] ()
    },

    showNavBar: function (currentTab) {
      var bh = this
      
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
        bh.getIconPromise(tab.icon)
          .done (function (svg) {
            span.append ($(svg).addClass('navicon'))
	    if (tab.name === 'inbox')
	      span.append (bh.messageCountDiv)
          })
          .fail (function (err) {
            console.log(err)
          })
        if (tab.name === currentTab) {
          bh.currentTab = tab
          span.addClass('active')
        } else
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
      var bh = this
      this.REST_getPlayerInboxCount (this.playerID)
	.then (function (result) {
	  bh.messageCount = result.count
	  bh.updateMessageCountDiv()
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
      var bh = this
      delete this.symbolCache
      delete this.lastPlayerSearch
      delete this.playerSearchResults
      delete this.lastSymbolSearch
      delete this.symbolSearchResults
      this.gamePosition = {}
      this.REST_getLogout()
      this.showLoginPage()
    },
    
    // settings menu
    showSettingsPage: function() {
      var bh = this

      this.setPage ('settings')
        .then (function() {
          bh.showNavBar ('settings')
          bh.container
            .append ($('<div class="menubar">')
                     .append ($('<ul>')
                              .append (bh.makeListLink ('Name', bh.showPlayerConfigPage))
                              .append (bh.makeListLink ('Audio', bh.showAudioPage))
                              .append (bh.makeListLink ('Themes', bh.showThemesPage))
                              .append (bh.makeListLink ('Log out', bh.doLogout))))
        })
    },
    
    // settings
    showPlayerConfigPage: function() {
      var bh = this
      this.pushView ('name')
        .then (function() {
          var backLink = bh.makeLink ('Back', function() {
            backLink.off()
            bh.nameInput.prop('disabled',true)
            var newName = bh.nameInput.val()
            if (newName.length) {
              bh.playerName = newName
              bh.REST_postPlayerConfig (bh.playerID, { displayName: newName })
            }
            bh.popView()
          })
          bh.container
            .append (bh.makePageTitle ("Player details"))
            .append ($('<div class="menubar">')
                     .append ($('<div class="inputbar">')
                              .append ($('<form>')
                                       .append ($('<span>').text('Full name'))
                                       .append (bh.nameInput = $('<input type="text">')
                                                .val(bh.playerName)
                                                .attr('maxlength', bh.maxPlayerNameLength))))
                     .append (backLink))
        })
    },

    showThemesPage: function() {
      var bh = this

      var fieldset
      this.pushView ('theme')
        .then (function() {
          bh.container
            .append (bh.makePageTitle ("Themes"))
            .append ($('<div class="menubar">')
                     .append (fieldset = $('<fieldset class="themegroup">')
                              .append ($('<legend>').text("Select theme")))
                     .append (bh.makeLink ('Back', bh.popView)))

          var label = {}, config = { silent: true }
          bh.themes.forEach (function (theme) {
            var id = 'theme-' + theme.style
            fieldset.append ($('<input type="radio" name="theme" id="'+id+'" value="'+theme.style+'">'))
	      .append (label[theme.style] = $('<label for="'+id+'" class="'+theme.style+'">')
                       .text(theme.text)
                       .on('click',bh.themeSelector(theme.style,config)))
          })

          label[bh.theme].click()
          config.silent = false
        })
    },

    themeSelector: function(style,config) {
      var bh = this
      var theme = bh.themes.find (function(t) { return t.style === style })
      return function() {
        if (!(config && config.silent))
          bh.playSound ('select')
	bh.themes.forEach (function (oldTheme) {
          bh.container.removeClass (oldTheme.style)
	})
        bh.container.addClass (theme.style)
        bh.theme = theme.style
        bh.themeInfo = theme
        bh.writeLocalStorage ('theme')
      }
    },

    showAudioPage: function() {
      var bh = this

      this.pushView ('audio')
        .then (function() {
          var soundInput
          bh.container
            .append (bh.makePageTitle ("Audio settings"))
            .append ($('<div class="menubar">')
                     .append ($('<div class="card">')
                              .append (soundInput = $('<input type="range" value="50" min="0" max="100">'))
                              .append ($('<span>').text("Sound FX volume")))
                     .append ($('<ul>')
                              .append (bh.makeListLink ('Back', bh.popView))))

          soundInput.val (bh.soundVolume * 100)
          soundInput.on ('change', function() {
            bh.soundVolume = soundInput.val() / 100
            bh.playSound ('select')
            bh.writeLocalStorage ('soundVolume')
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
      var bh = this
      var poppedView = this.pushedViews.pop()
      if (this.verbose.page)
	console.log ("Popping " + this.page + " view, returning to " + poppedView.page)
      this.container.find('.pushed').find('*').addBack().addClass('pushed')  // make sure any descendants added after the push are flagged as pushed
      this.container.find(':not(.pushed)').remove()
      poppedView.elements.find('*').addBack().removeClass('pushed').removeClass('already-clicked')
      return this.setPage (poppedView.page)
        .then (function() {
          bh.pageSuspend = poppedView.pageSuspend
          bh.pageResume = poppedView.pageResume
          bh.pageExit = poppedView.pageExit
          if (bh.pageResume)
            bh.pageResume()
        })
    },

    // compose message
    showComposePage: function() {
      var bh = this

      this.setPage ('compose')
        .then (function() {
          bh.showNavBar ('compose')

          bh.playerSearchInput = $('<textarea class="recipient">')
          bh.playerSearchResultsDiv = $('<div class="results">')

          bh.symbolSearchInput = $('<textarea class="symbol">')
          bh.symbolSearchResultsDiv = $('<div class="results">')

          bh.messageTitleInput = $('<textarea class="title">')
          bh.messageBodyDiv = $('<div class="messagebody">')
          bh.messageControlsDiv = $('<div class="messagecontrols">')

          bh.container
            .append ($('<div class="compose">')
                     .append ($('<div class="messageheader">')
                              .append ($('<div class="row">')
                                       .append ($('<span class="label">').text ('To:'),
                                                $('<span class="input">').html (bh.playerSearchInput)),
                                       bh.playerSearchResultsDiv,
                                       $('<div class="row">')
                                       .append ($('<span class="label">').text ('Source:'),
                                                $('<span class="input">').html (bh.symbolSearchInput)),
                                       bh.symbolSearchResultsDiv,
                                       $('<div class="row">')
                                       .append ($('<span class="label">').text ('Subject:'),
                                                $('<span class="input">').html (bh.messageTitleInput))),
                              bh.messageBodyDiv,
                              bh.messageControlsDiv.append
                              ($('<span>').html
                               (bh.makeIconButton ('randomize', function() {
                               })),
                               ($('<span>').html
                                (bh.makeIconButton ('message', function() {
                                }))),
                               ($('<span>').html
                                (bh.makeIconButton ('outbox', function() {
                                }))),
                               ($('<span>').html
                                (bh.makeIconButton ('send', function() {
                                }))))))

          bh.restoreScrolling (bh.messageBodyDiv)
          
        })
    },

    // inbox
    showInboxPage: function() {
      var bh = this

      this.setPage ('inbox')
        .then (function() {
          bh.showNavBar ('inbox')
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
      var bh = this
      this.setPage ('status')
        .then (function() {
          bh.showNavBar ('status')
          bh.showGameStatusPage (bh.REST_getPlayerStatus)
          bh.detailBarDiv.prepend ($('<div class="locbar">').html($('<h1>').text(bh.playerName)))
        })
    },

    showOtherStatusPage: function (follow) {
      var bh = this
      this.setPage ('otherStatus')
        .then (function() {
          bh.otherStatusID = follow.id
          bh.container.empty()
          bh.makeFollowDiv (follow)
          if (!follow.human) follow.buttonDiv.hide()
          bh.locBarDiv = $('<div class="locbar">')
          bh.showGameStatusPage (bh.REST_getPlayerStatusOther.bind (bh, bh.playerID, follow.id),
                                   function (status) {
                                     if (status.following)
                                       follow.makeUnfollowButton()
                                     bh.detailBarDiv
                                       .append ($('<div class="statusdiv">')
                                                .append (bh.locBarDiv))
                                   })
          bh.detailBarDiv.prepend (follow.followDiv)
          bh.container
	    .append ($('<div class="backbar">')
		     .append ($('<span>')
			      .html (bh.makeLink ('Back', bh.reloadCurrentTab))))
        })
    },

    pushGameStatusPage: function (info, getMethod) {
      var bh = this
      this.pushView ('status')
        .then (function() {
          bh.container
            .append (info.followDiv || bh.makePageTitle (info.name))
          bh.showGameStatusPage (getMethod, function (status) {
            if (info.followDiv) {
              if (status.human)
                info.buttonDiv.show()
              if (status.following)
                info.makeUnfollowButton()
            }
          })
          bh.container
	    .append ($('<div class="backbar">')
		     .append ($('<span>')
			      .html (bh.makeLink ('Back', bh.popView))))
        })
    },

    showGameStatusPage: function (getMethod, callback) {
      var bh = this
      this.container
        .append (this.detailBarDiv = $('<div class="detailbar">'))

      this.restoreScrolling (this.detailBarDiv)

      getMethod.call (this, this.playerID, this.gameID)
	.done (function (status) {
	  if (bh.verbose.server)
	    console.log (status)
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
      var bh = this
      return this.finishLastSave()
        .then (function() {
          var def
          if (bh.unfocusAndSave) {
            def = bh.unfocusAndSave()
            delete bh.unfocusAndSave
          } else {
            def = $.Deferred()
            def.resolve()
          }
          bh.lastSavePromise = def
          return def
        })
    },

    makeIconButton: function (iconName, callback, color) {
      var button = $('<span>').addClass('button').text(iconName)
      this.getIconPromise (this.iconFilename[iconName])
        .done (function (svg) {
          svg = bh.colorizeIcon (svg, color || bh.themeInfo.iconColor)
          button.html ($(svg))
        })
      if (callback)
        button.on ('click', callback)
      return button
    },

    populateEditableSpan: function (div, props) {
      var bh = this
      var sanitize = props.sanitize || function(x) { return x }
      var parse = props.parse || sanitize
      var renderText = props.renderText || function(x) { return x }
      var renderHtml = props.renderHtml || renderText
      var oldText = renderText(props.content)
      var editCallback = function (evt) {
        evt.stopPropagation()
        div.off ('click')
        bh.saveCurrentEdit()
          .then (function() {
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
            bh.unfocusAndSave = function() {
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
                  bh.populateEditableSpan (div, props)
                })
            }
            div.html (input)
            input.focus()
          })
      }
      
      var buttonsDiv = $('<span class="buttons">')
      div.empty().append (renderHtml (props.content), buttonsDiv)
      
      if (props.isConstant)
        buttonsDiv.append (bh.makeIconButton ('locked'))
      else {
        div.on ('click', editCallback)
        buttonsDiv.append (bh.makeIconButton ('edit', editCallback))
        if (props.destroyCallback)
          buttonsDiv.append (bh.makeIconButton ('destroy', function (evt) {
            evt.stopPropagation()
            bh.saveCurrentEdit()
              .then (function() {
                
                if (props.confirmDestroy())
                  bh.lastSavePromise = props.destroyCallback()
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
      var bh = this
      return bh.finishLastSave()
        .then (function() {
          bh.lastSavePromise = bh.REST_putPlayerSymbol (bh.playerID, symbol.id, bh.symbolName[symbol.id], symbol.rules)
            .then (function (result) {
              if (bh.verbose.server) console.log('putPlayerSymbol:',result)
              $.extend (bh.symbolName, result.name)
              return result.symbol
            })
          return bh.lastSavePromise
        })
    },

    renameSymbol: function (symbol, newName) {
      var bh = this
      return bh.finishLastSave()
        .then (function() {
          bh.lastSavePromise = bh.REST_putPlayerSymbol (bh.playerID, symbol.id, newName, symbol.rules)
            .then (function (result) {
              if (bh.verbose.server) console.log('putPlayerSymbol:',result)
              bh.updateSymbolCache (result)
            }).fail (function (err) {
              var reload = bh.reloadCurrentTab.bind(bh)
	      if (err.status == 400)
                bh.showModalMessage ("A symbol with that name already exists", reload)
              else
                bh.showModalWebError (err, reload)
            })
        })
    },

    updateSymbolCache: function (result) {
      var bh = this
      var symbol = result.symbol
      var oldName = this.symbolName[symbol.id]
      $.extend (this.symbolName, result.name)
      if (oldName) {
        if (oldName !== symbol.name) {
          bh.symbolName[symbol.id] = symbol.name
          bh.ruleDiv[symbol.id].remove()
          bh.placeGrammarRuleDiv (symbol)
          bh.referringSymbols(symbol).forEach (function (lhsSymbol) {
            if (lhsSymbol.id !== symbol.id)
              bh.populateGrammarRuleDiv (bh.ruleDiv[lhsSymbol.id], lhsSymbol)
          })
        } else if (this.symbolCache[symbol.id]) {
          this.symbolCache[symbol.id] = symbol
          if (this.ruleDiv[symbol.id])
            this.populateGrammarRuleDiv (this.ruleDiv[symbol.id], symbol)
        }
      }
    },

    parseRhs: function (rhs) {
      var bh = this
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
      console.log('parseRhs:',parsed)
      return parsed
    },

    symbolOwnedByPlayer: function (symbol) {
      return symbol.owner.id === this.playerID
    },

    symbolEditableByPlayer: function (symbol) {
      return this.symbolOwnedByPlayer(symbol) || typeof(symbol.owner.id) === 'undefined' || symbol.owner.id === null
    },
    
    makeGrammarRhsDiv: function (symbol, ruleDiv, rhs, n) {
      var span = bh.makeEditableSpan ({ className: 'rhs',
                                        content: rhs,
                                        isConstant: !bh.symbolEditableByPlayer (symbol),
                                        confirmDestroy: function() {
                                          return !symbol.rules[n].length || window.confirm('Delete this expansion for symbol #' + bh.symbolName[symbol.id] + '?')
                                        },
                                        destroyCallback: function() {
                                          symbol.rules.splice(n,1)
                                          bh.populateGrammarRuleDiv (ruleDiv, symbol)
                                          return bh.saveSymbol (symbol)
                                        },
                                        storeCallback: function (newRhs) {
                                          symbol.rules[n] = newRhs
                                          return bh.saveSymbol (symbol)
                                            .then (function (newSymbol) {
                                              return newSymbol.rules[n]
                                            })
                                        },
                                        parse: bh.parseRhs.bind(bh),
                                        renderText: function (rhs) {
                                          return rhs.map (function (rhsSym) {
                                            return (typeof(rhsSym) === 'object'
                                                    ? ('#' + (bh.symbolName[rhsSym.id] || rhsSym.name))
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
                                                if (typeof(rhsSym.id) !== 'undefined' && !bh.symbolName[rhsSym.id]) {
                                                  console.log('oops; empty symbol name')
                                                }
                                                if (typeof(rhsSym.id) !== 'undefined')
                                                  name.text (bh.symbolName[rhsSym.id])
                                                  .on ('click', function (evt) {
                                                    evt.stopPropagation()
                                                    bh.loadGrammarSymbol (rhsSym)
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
      var bh = this
      var lhs = bh.symbolName[symbol.id]
      function sanitize (text) { return '#' + text.replace(/ /g,'_').replace(/[^A-Za-z0-9_]/g,'') }
      var editable = bh.symbolEditableByPlayer (symbol)
      var owned = bh.symbolOwnedByPlayer (symbol)
      ruleDiv.empty()
        .append (this.makeEditableSpan
                 ({ className: 'lhs',
                    content: lhs,
                    renderText: function(lhs) { return '#' + lhs },
                    sanitize: sanitize,
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
                      return window.confirm('Relinquish ownership of symbol #' + bh.symbolName[symbol.id] + '?')
                    },
                    destroyCallback: owned && function() {
                      bh.removeGrammarRule (symbol)
                      return bh.REST_deletePlayerSymbol (bh.playerID, symbol.id)
                    },
                    storeCallback: function (newLhs) {
                      return bh.renameSymbol (symbol, newLhs)
                    },
                    otherButtonDivs: (owned
                             ? []
                             : [ bh.makeIconButton
                                 ('hide', function (evt) {
                                   evt.stopPropagation()
                                   bh.saveCurrentEdit()
                                     .then (function() {
                                       bh.removeGrammarRule (symbol)
                                     })
                                 })])
                    .concat ([bh.makeIconButton
                              ('randomize', function (evt) {
                                evt.stopPropagation()
                                bh.saveCurrentEdit()
                                  .then (function() {
                                    bh.saveCurrentEdit()
                                      .then (function() {
                                        bh.REST_expandPlayerSymbol (bh.playerID, symbol.id)
                                          .then (function (result) {
		                            bh.infoPaneTitle.text ('#' + bh.symbolName[symbol.id])
		                            bh.infoPaneContent.text (result.expansion)
		                            bh.infoPane.show()
                                          })
                                      })
                                  })
                              })])
                    .concat (editable
                             ? [ bh.makeIconButton
                                 ('create', function (evt) {
                                   evt.stopPropagation()
                                   bh.saveCurrentEdit()
                                     .then (function() {
                                       var newRhs = symbol.rules.length ? symbol.rules[symbol.rules.length-1] : []
                                       ruleDiv.append (bh.makeGrammarRhsDiv (symbol, ruleDiv, newRhs, symbol.rules.length))
                                       symbol.rules.push (newRhs)
                                       bh.selectGrammarRule (symbol)
                                       bh.saveSymbol (symbol)  // should probably give focus to new RHS instead, here
                                     })
                                 }) ]
                             : [])
                  }),
                 symbol.rules.map (function (rhs, n) {
                   return bh.makeGrammarRhsDiv (symbol, ruleDiv, rhs, n)
                 }))
    },

    loadGrammarSymbol: function (symbol) {
      var bh = this
      bh.saveCurrentEdit()
        .then (function() {
          if (bh.symbolCache[symbol.id])
            bh.scrollGrammarTo (bh.symbolCache[symbol.id])
          else
            bh.socket_getPlayerSymbol (bh.playerID, symbol.id)
            .then (function (result) {
              if (bh.verbose.server) console.log('getPlayerSymbol:',result)
              $.extend (bh.symbolName, result.name)
              bh.symbolCache[result.symbol.id] = result.symbol
              bh.placeGrammarRuleDiv (result.symbol)
              bh.scrollGrammarTo (result.symbol)
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
      var name = bh.symbolName[symbol.id]
      var nextSym = syms.find (function (s) { return bh.symbolName[s.id] > name })
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
      var bh = this
      $('.selected').removeClass('selected')
      bh.ruleDiv[symbol.id].addClass('selected')
    },
    
    cachedSymbols: function() {
      var bh = this
      return Object.keys(this.symbolCache).map (function (id) {
        return bh.symbolCache[id]
      }).sort (function (a, b) { return bh.symbolName[a.id] < bh.symbolName[b.id] ? -1 : +1 })
    },

    symbolNameToID: function() {
      var bh = this
      var name2id = {}
      Object.keys(this.symbolName).forEach (function (id) {
        name2id[bh.symbolName[id]] = parseInt (id)
      })
      return name2id
    },

    getSymbol: function (symbolName) {
      var bh = this
      return this.symbolCache[Object.keys(this.symbolName).find (function (id) { return bh.symbolName[id] === symbolName })]
    },
    
    lhsRefersTo: function (lhsSymbol, rhsSymbol) {
      return lhsSymbol.rules.find (function (rhs) {
        return rhs.find (function (rhsSym) {
          return typeof(rhsSym) === 'object' && rhsSym.id === rhsSymbol.id
        })
      })
    },

    referringSymbols: function (rhsSymbol) {
      var bh = this
      return this.cachedSymbols().filter (function (lhsSymbol) {
        return bh.lhsRefersTo (lhsSymbol, rhsSymbol)
      })
    },

    showGrammarEditPage: function() {
      var bh = this
      this.setPage ('grammar')
        .then (function() {
          bh.showNavBar ('grammar')

          var def
          if (bh.symbolCache) {
            def = $.Deferred()
            def.resolve()
          } else {
            def = bh.socket_getPlayerSymbols (bh.playerID)
              .then (function (result) {
                if (bh.verbose.server) console.log('getPlayerSymbols:',result)
                bh.symbolCache = {}
                result.symbols.forEach (function (symbol) {
                  bh.symbolCache[symbol.id] = symbol
                })
                bh.symbolName = result.name
              })
          }

          def.then (function() {
            
            bh.pageExit = function() {
	      bh.container.off ('click')
              return bh.saveCurrentEdit()
            }

            bh.container.on ('click', bh.saveCurrentEdit.bind(bh))
            bh.grammarBarDiv = $('<div class="grammarbar">')

            bh.infoPane = $('<div class="grammarinfopane">')
            bh.infoPaneContent = $('<div class="content">')
            bh.infoPaneTitle = $('<div class="title">')
            bh.infoPane.append ($('<span class="closebutton">').html
                                (bh.makeIconButton ('close', function() { bh.infoPane.hide() })),
		                bh.infoPaneTitle,
		                bh.infoPaneContent)

            bh.searchInput = $('<input>')
            bh.symbolSearchResultsDiv = $('<div class="results">')
            bh.endSearchResultsDiv = $('<div class="endresults">')
            var searchButton = $('<span>'), closeButton = $('<span>')

            bh.container
	      .append ($('<div class="search">')
                       .append ($('<div class="query">')
                                .append (searchButton, bh.searchInput, closeButton)),
                       bh.symbolSearchDiv = $('<div class="symbolsearch">')
                       .append (bh.symbolSearchResultsDiv,
                                bh.endSearchResultsDiv)
                       .hide(),
                       bh.grammarBarDiv,
                       bh.infoPane.hide(),
                       $('<div class="grammareditbuttons">').append
                       ($('<div class="help">').html
                        (bh.makeIconButton ('help', function() {
		          bh.REST_getHelpHtml().then (function (helpHtml) {
		            bh.saveCurrentEdit()
                              .then (function() {
		                bh.infoPaneTitle.text ('Help')
		                bh.infoPaneContent.html (helpHtml)
		                bh.infoPane.show()
                              })
		          })
                        })),
                        ($('<div class="newlhs">').html
                         (bh.makeIconButton ('create', function() {
		           bh.saveCurrentEdit()
                             .then (function() {
                               return bh.socket_getPlayerSymbolNew (bh.playerID)
                             }).then (function (result) {
                               if (bh.verbose.server) console.log('getPlayerSymbolNew:',result)
                               bh.symbolCache[result.symbol.id] = result.symbol
                               $.extend (bh.symbolName, result.name)
                               bh.placeGrammarRuleDiv (result.symbol)
                             })
                         })))))

            bh.searchInput.attr ('placeholder', 'Search symbols')
            bh.placeIcon (bh.iconFilename.search, searchButton)
            bh.placeIcon (bh.iconFilename.close, closeButton)
            searchButton.addClass('button')
              .on ('click', bh.doSymbolSearch.bind(bh))
            closeButton.addClass('button')
              .on ('click', bh.clearSymbolSearch.bind(bh))
            bh.searchInput.on ('keyup', function(event) {
              bh.doSymbolSearch()
            })
            bh.showSymbolSearchResults()

            bh.restoreScrolling (bh.symbolSearchResultsDiv)
            bh.restoreScrolling (bh.grammarBarDiv)
            bh.restoreScrolling (bh.infoPaneContent)

            bh.ruleDiv = {}
            bh.grammarBarDiv
              .append (bh.cachedSymbols().map (bh.makeGrammarRuleDiv.bind (bh)))
          })
        })
    },

    clearSymbolSearch: function() {
      this.searchInput.val('')
      this.doSymbolSearch()
    },
    
    doSymbolSearch: function() {
      var bh = this
      var searchText = this.searchInput.val()
      if (searchText !== this.lastSymbolSearch) {
        this.lastSymbolSearch = searchText
        delete this.symbolSearchResults
        this.REST_postPlayerSearchSymbolsAll (this.playerID, searchText)
          .then (function (ret) {
	    if (bh.verbose.server)
              console.log (ret)
            bh.symbolSearchResults = ret
            bh.showSymbolSearchResults()
          })
      }
    },

    continueSymbolSearch: function() {
      var bh = this
      if (this.searchInput.val() === this.lastSymbolSearch) {
        this.REST_postPlayerSearchSymbolsAll (this.playerID, this.lastSymbolSearch, this.symbolSearchResults.page + 1)
          .then (function (ret) {
	    if (bh.verbose.server)
              console.log (ret)
            bh.symbolSearchResults.results = bh.symbolSearchResults.results.concat (ret.results)
            bh.symbolSearchResults.more = ret.more
            bh.symbolSearchResults.page = ret.page
            bh.showSymbolSearchResults()
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
          .append ($('<div class="searchtitle">').text("Search results"),
                   this.makeSymbolDivs (this.symbolSearchResults.results, "There are no symbols matching '" + this.lastSymbolSearch + "'."))
        var more = $('<span>')
        this.endSearchResultsDiv.append(more)
        if (this.symbolSearchResults.more)
          more.addClass('more').text('More')
          .on ('click', function (evt) {
            evt.preventDefault()
            more.remove()
            bh.continueSymbolSearch()
          })
        else if (this.symbolSearchResults.results.length)
          more.text('All matching symbols shown')
      }
    },

    makeSymbolDivs: function (symbols, emptyMessage) {
      var bh = this
      return symbols.length
        ? symbols.map (function (symbol) {
          return $('<div class="symbol">')
            .append ($('<span class="lhslink">').append ('#', $('<span class="name">').text (symbol.name))
                     .on ('click', function (evt) {
                       evt.stopPropagation()
                       bh.loadGrammarSymbol (symbol)
                     })
                    )
        })
      : $('<span>').text (emptyMessage)
    },

    // follows
    showFollowsPage: function() {
      var bh = this
      
      this.setPage ('follows')
        .then (function() {
          bh.showNavBar ('follows')

          bh.searchInput = $('<input>')
          bh.playerSearchResultsDiv = $('<div class="results">')
          bh.endSearchResultsDiv = $('<div class="endresults">')
          var searchButton = $('<span>'), closeButton = $('<span>')
          bh.container
            .append (bh.whoBarDiv = $('<div class="whobar">')
                     .append ($('<div class="search">')
                              .append ($('<div class="query">')
                                       .append (searchButton, bh.searchInput, closeButton),
                                       $('<div class="followsection">')
                                       .append (bh.playerSearchResultsDiv,
                                                bh.endSearchResultsDiv))))
          bh.searchInput.attr ('placeholder', 'Search players')
          bh.placeIcon (bh.iconFilename.search, searchButton)
          bh.placeIcon (bh.iconFilename.close, closeButton)
          searchButton.addClass('button')
            .on ('click', bh.doPlayerSearch.bind(bh))
          closeButton.addClass('button')
            .on ('click', bh.clearPlayerSearch.bind(bh))
          bh.searchInput.on ('keyup', function(event) {
              bh.doPlayerSearch()
          })
          bh.showPlayerSearchResults()
          
          bh.restoreScrolling (bh.whoBarDiv)

          bh.followsById = {}
          
          bh.REST_getPlayerFollow (bh.playerID)
	    .done (function (data) {
	      if (bh.verbose.server)
	        console.log (data)
              bh.whoBarDiv
                .append ($('<div class="followsection">')
                         .append ($('<div class="title">').text("Address book"))
                         .append (bh.makeFollowDivs (data.followed, "Your address book is empty.")))
              var following = {}
              data.followed.map (function (follow) {
                following[follow.id] = true
              })
	    }).fail (bh.reloadOnFail())
        })
    },

    makeFollowDiv: function (follow) {
      var followClass = 'followcontrol-' + follow.id, followSelector = '.' + followClass
      var buttonDiv = $('<span class="followcontrol">').addClass(followClass)
      var doFollow, doUnfollow
      function makeUnfollowButton() {
        $(followSelector).add(buttonDiv)
          .off()
          .html (bh.makeIconButton ('unfollow',
                                    bh.callWithSoundEffect (doUnfollow, 'select', $(followSelector).add(buttonDiv))))
	  .removeClass('already-clicked')
      }
      function makeFollowButton() {
        $(followSelector).add(buttonDiv)
          .off()
          .html (bh.makeIconButton ('follow',
                                    bh.callWithSoundEffect (doFollow, 'select', $(followSelector).add(buttonDiv))))
	  .removeClass('already-clicked')
      }
      doFollow = function() {
        bh.REST_getPlayerFollowOther (bh.playerID, follow.id)
          .then (function() {
	    follow.setFollowing(true)
	    follow.makeUnfollowButton()
	  })
      }
      doUnfollow = function() {
        bh.REST_getPlayerUnfollowOther (bh.playerID, follow.id)
          .then (function() {
	    follow.setFollowing(false)
	    follow.makeFollowButton()
	  })
      }
      if (follow.following)
        makeUnfollowButton()
      else
        makeFollowButton()
      var nameDiv = $('<span class="name">').text (follow.name)
      var followDiv = $('<div class="follow">')
          .append (nameDiv, buttonDiv)
      $.extend (follow, { followDiv: followDiv,
                          nameDiv: nameDiv,
                          buttonDiv: buttonDiv,
                          setFollowing: function(flag) { follow.following = flag },
                          makeFollowButton: makeFollowButton,
                          makeUnfollowButton: makeUnfollowButton })
    },

    makeFollowDivs: function (followList, emptyMessage) {
      var bh = this
      return followList.length
        ? followList.map (function (follow) {
          bh.followsById[follow.id] = bh.followsById[follow.id] || []
          bh.followsById[follow.id].push (follow)
          bh.makeFollowDiv (follow)
          follow.setFollowing = function (flag) {
            bh.followsById[follow.id].forEach (function (f) { f.following = flag })
          }
          follow.followDiv
            .on ('click', bh.callWithSoundEffect (bh.showOtherStatusPage.bind (bh, follow)))
          return follow.followDiv
        })
      : $('<span>').text (emptyMessage)
    },

    clearPlayerSearch: function() {
      this.searchInput.val('')
      this.doPlayerSearch()
    },

    doPlayerSearch: function() {
      var bh = this
      var searchText = this.searchInput.val()
      if (searchText !== this.lastPlayerSearch) {
        this.lastPlayerSearch = searchText
        delete this.playerSearchResults
        this.REST_postPlayerSearchPlayersAll (this.playerID, searchText)
          .then (function (ret) {
	    if (bh.verbose.server)
              console.log (ret)
            bh.playerSearchResults = ret
            bh.showPlayerSearchResults()
          })
      }
    },

    continuePlayerSearch: function() {
      var bh = this
      if (this.searchInput.val() === this.lastPlayerSearch) {
        this.REST_postPlayerSearchPlayersAll (this.playerID, this.lastPlayerSearch, this.playerSearchResults.page + 1)
          .then (function (ret) {
	    if (bh.verbose.server)
              console.log (ret)
            bh.playerSearchResults.results = bh.playerSearchResults.results.concat (ret.results)
            bh.playerSearchResults.more = ret.more
            bh.playerSearchResults.page = ret.page
            bh.showPlayerSearchResults()
          })
      } else
        this.doPlayerSearch()
    },

    showPlayerSearchResults: function() {
      this.searchInput.val (this.lastPlayerSearch || '')
      this.playerSearchResults = this.playerSearchResults || { results: [] }
      this.playerSearchResultsDiv.empty()
      this.endSearchResultsDiv.empty()
      if (this.lastPlayerSearch && this.lastPlayerSearch.length) {
        this.playerSearchResultsDiv
        .append ($('<div class="searchtitle">').text("Search results"),
                 this.makeFollowDivs (this.playerSearchResults.results, "There are no players matching '" + this.lastPlayerSearch + "'."))
        var more = $('<span>')
        this.endSearchResultsDiv.append(more)
        if (this.playerSearchResults.more)
          more.addClass('more').text('More')
          .on ('click', function (evt) {
            evt.preventDefault()
            more.remove()
            bh.continuePlayerSearch()
          })
        else if (this.playerSearchResults.results.length)
          more.text('All matching players shown')
      }
    },
    
    // socket message handlers
    handlePlayerMessage: function (msg) {
      if (this.verbose.messages)
        console.log (msg)
      switch (msg.data.message) {
      case "incoming":
        // incoming message
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
