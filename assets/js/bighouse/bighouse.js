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
    iconFilename: { edit: 'pencil', create: 'circle-plus', destroy: 'trash-can', up: 'up-arrow-button', down: 'down-arrow-button' },
    
    themes: [ {style: 'plain', text: 'Plain', iconColor: 'black'},
              {style: 'cardroom', text: 'Card room', iconColor: 'white'} ],

    tabs: [{ name: 'status', method: 'showStatusPage', icon: 'scroll-unfurled', },
           { name: 'compose', method: 'showComposePage', icon: 'quill-ink' },
           { name: 'inbox', method: 'showInboxPage', icon: 'envelope' },
           { name: 'follows', method: 'showFollowsPage', icon: 'address-book-black' },
           { name: 'grammar', method: 'showGrammarEditPage', icon: 'printing-press' },
           { name: 'settings', method: 'showSettingsPage', icon: 'pokecog' }],

    searchIcon: 'magnifying-glass',
    
    verbose: { page: false,
               server: true,
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

    REST_postPlayerSearch: function (playerID, queryText, page) {
      return $.post ('/p/' + playerID + '/search/', { query: queryText, page: page })
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
      return $.get ('/p/' + playerID + '/symbol/' + symbolID, { name: name, rules: rules })
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
      if (this.pageExit)
        this.pageExit()
      
      if (this.verbose.page)
	console.log ("Changing view from " + this.page + " to " + page)
      this.page = page
    },

    // login menu
    showLoginPage: function() {
      this.setPage ('login')
      this.container
        .empty()
        .append ($('<div class="inputbar">')
                 .append ($('<form>')
                          .append ($('<label for="player">')
                                   .text('Player name'))
                          .append (this.nameInput = $('<input name="player" type="text">')
                                   .attr('maxlength', this.maxPlayerNameLength))
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
      this[this.currentTab.method] ()
    },

    showNavBar: function (currentTab) {
      var bh = this
      
      var navbar
      this.container
        .empty()
        .append (navbar = $('<div class="navbar">'))

      this.messageCountDiv = $('<div class="gamecount">').hide()
      if (typeof(this.messageCount) === 'undefined')
	this.updateMessageCount()
      else
	this.updateMessageCountDiv()
	
      this.tabs.map (function (tab) {
        var span = $('<span>').addClass('navtab').addClass('nav-'+tab.name)
        bh.getIconPromise(tab.icon)
          .done (function (svg) {
            span.append ($(svg).addClass('navicon'))
	    if (tab.name === 'games')
	      span.append (bh.gameCountDiv)
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
      delete this.lastSearch
      delete this.searchResults
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
                          .append (this.makeListLink ('Name', this.showPlayerConfigPage))
                          .append (this.makeListLink ('Audio', this.showAudioPage))
                          .append (this.makeListLink ('Themes', this.showThemesPage))
                          .append (this.makeListLink ('Log out', this.doLogout))))
    },
    
    // settings
    showPlayerConfigPage: function() {
      var bh = this
      this.pushView ('name')
      var backLink = this.makeLink ('Back', function() {
        backLink.off()
        bh.nameInput.prop('disabled',true)
        var newName = bh.nameInput.val()
        if (newName.length) {
          bh.playerName = newName
          bh.REST_postPlayerConfig (bh.playerID, { displayName: newName })
        }
        bh.popView()
      })
      this.container
        .append (this.makePageTitle ("Player details"))
        .append ($('<div class="menubar">')
                 .append ($('<div class="inputbar">')
                          .append ($('<form>')
                                   .append ($('<span>').text('Full name'))
                                   .append (this.nameInput = $('<input type="text">')
                                            .val(this.playerName)
                                            .attr('maxlength', this.maxPlayerNameLength))))
                 .append (backLink))
    },

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

      var label = {}, config = { silent: true }
      this.themes.forEach (function (theme) {
        var id = 'theme-' + theme.style
        fieldset.append ($('<input type="radio" name="theme" id="'+id+'" value="'+theme.style+'">'))
	  .append (label[theme.style] = $('<label for="'+id+'" class="'+theme.style+'">')
                   .text(theme.text)
                   .on('click',bh.themeSelector(theme.style,config)))
      })

      label[this.theme].click()
      config.silent = false
    },

    themeSelector: function(style,config) {
      var bh = this
      var theme = this.themes.find (function(t) { return t.style === style })
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
      var soundInput
      this.container
        .append (this.makePageTitle ("Audio settings"))
        .append ($('<div class="menubar">')
                 .append ($('<div class="card">')
                          .append (soundInput = $('<input type="range" value="50" min="0" max="100">'))
                          .append ($('<span>').text("Sound FX volume")))
                 .append ($('<ul>')
                          .append (this.makeListLink ('Back', this.popView))))

      soundInput.val (this.soundVolume * 100)
      soundInput.on ('change', function() {
        bh.soundVolume = soundInput.val() / 100
        bh.playSound ('select')
        bh.writeLocalStorage ('soundVolume')
      })

      // restore disabled slide events for these controls
      soundInput.on('touchmove',function(e){e.stopPropagation()})
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
      poppedView.elements.find('*').addBack().removeClass('pushed').removeClass('already-clicked')
      this.setPage (poppedView.page)
      this.pageSuspend = poppedView.pageSuspend
      this.pageResume = poppedView.pageResume
      this.pageExit = poppedView.pageExit
      if (this.pageResume)
        this.pageResume()
    },

    // compose message
    showComposePage: function() {
      var bh = this

      this.setPage ('compose')
      this.showNavBar ('compose')
    },

    // inbox
    showInboxPage: function() {
      var bh = this

      this.setPage ('inbox')
      this.showNavBar ('inbox')
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
      this.setPage ('status')
      this.showNavBar ('status')
      this.showGameStatusPage (this.REST_getPlayerStatus)
      this.detailBarDiv.prepend ($('<div class="locbar">').html($('<h1>').text(this.playerName)))
    },

    showOtherStatusPage: function (follow) {
      var bh = this
      this.setPage ('otherStatus')
      this.otherStatusID = follow.id
      this.container.empty()
      this.makeFollowDiv (follow)
      if (!follow.human) follow.buttonDiv.hide()
      this.locBarDiv = $('<div class="locbar">')
        .append ($('<h1>').text('Games'))
      	.append ($('<span class="nogames">')
		 .text('You have no games with ' + follow.name + ' at present.'))
      this.showGameStatusPage (this.REST_getPlayerStatusOther.bind (this, this.playerID, follow.id),
                               function (status) {
                                 if (status.following)
                                   follow.makeUnfollowButton()
                                 bh.detailBarDiv
                                   .append ($('<div class="statusdiv">')
                                            .append (bh.locBarDiv))
 	                         bh.addEvents (status.events)
                               })
      this.detailBarDiv.prepend (follow.followDiv)
      this.container
	.append ($('<div class="backbar">')
		 .append ($('<span>')
			  .html (this.makeLink ('Back', bh.reloadCurrentTab))))
//      follow.showAvatar()
    },

    pushGameStatusPage: function (info, getMethod) {
      var bh = this
      this.pushView ('status')
      this.container
        .append (info.followDiv || this.makePageTitle (info.name))
      this.showGameStatusPage (getMethod, function (status) {
        if (info.followDiv) {
          if (status.human)
            info.buttonDiv.show()
          if (status.following)
            info.makeUnfollowButton()
        }
      })
      this.container
	.append ($('<div class="backbar">')
		 .append ($('<span>')
			  .html (this.makeLink ('Back', this.popView))))
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
    unfocusEditableSpan: function() {
      if (this.editableDivUnfocusCallback) {
        this.editableDivUnfocusCallback()
        delete this.editableDivUnfocusCallback
      }
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
      var renderText = props.renderText || function(x) { return x }
      var renderHtml = props.renderHtml || function(x) { return x }
      var parse = props.parse || function(x) { return x }
      var oldText = renderText(props.content)
      var editCallback = function (evt) {
        bh.unfocusEditableSpan()
        evt.stopPropagation()
        div.off ('click')
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
        bh.editableDivUnfocusCallback = function() {
          var newText = input.val()
          if (newText !== oldText) {
            var newContent = parse (newText)
            props.content = props.storeCallback(newContent) || newContent
          }
          bh.populateEditableSpan (div, props)
        }
        div.html (input)
        input.focus()
      }
      
      var buttonsDiv = $('<span class="buttons">')
      div.empty().append (renderHtml (props.content), buttonsDiv)
      
      if (!props.isConstant) {
        div.on ('click', editCallback)
        buttonsDiv.append (bh.makeIconButton ('edit', editCallback))
        if (props.destroyCallback)
          buttonsDiv.append (bh.makeIconButton ('destroy', function (evt) {
            evt.stopPropagation()
            bh.unfocusEditableSpan()
            if (!props.confirmDestroy() || window.confirm("Delete " + props.description + "?"))
              props.destroyCallback()
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
      return this.putPlayerSymbol (this.playerID, symbol.id, symbol.name, symbol.rules)
    },

    parseRhs: function (rhs) {
      var regex = /([^#]*)((#[A-Za-z0-9_]+)|.*)/g, match
      var parsed = []
      var syms = this.currentGrammarSymbols()
      while ((match = regex.exec(rhs)) && match[0].length) {
        if (match[1].length)
          parsed.push (match[1])
        var hashLhs = match[3]
        if (hashLhs) {
          var lhsName = hashLhs.substr(1)
          var lhsRef = { name: lhsName }
          var lhsSym = syms.find (function (sym) { return sym.name === lhsName })
          if (lhsSym)
            lhsRef.id = lhsSym.id
          parsed.push (lhsRef)
        }
      }
      return parsed
    },
    
    makeGrammarRhsDiv: function (symbol, ruleDiv, rhs, n) {
      var span = bh.makeEditableSpan ({ className: 'rhs',
                                        content: rhs,
                                        description: 'this expansion for symbol #' + symbol.name,
                                        destroyCallback: function() {
                                          symbol.rules.splice(n,1)
                                          bh.populateGrammarRuleDiv (ruleDiv, symbol)
                                          bh.saveSymbol()
                                        },
                                        confirmDestroy: function() {
                                          return symbol.rules[n].length
                                        },
                                        storeCallback: function (newRhs) {
                                          symbol.rules[n] = newRhs
                                        },
                                        renderHtml: function (rhs) {
                                          return $('<span>')
                                            .append (rhs.map (function (rhsSym) {
                                              return $('<span>')
                                                .text (typeof(rhsSym) === 'object'
                                                       ? ('#' + bh.symbolCache[rhsSym.id].name)
                                                       : rhsSym)
                                            }))
                                        }
                                      })
      return span
    },

    populateGrammarRuleDiv: function (ruleDiv, symbol) {
      var bh = this
      function sanitize (text) { return '#' + text.replace (/[^A-Za-z0-9_]/g, '') }
      ruleDiv.empty()
        .append (this.makeEditableSpan
                 ({ className: 'lhs',
                    text: '#' + lhs,
                    sanitize: sanitize,
                    keycodeFilter: function (keycode) {
                      return (keycode >= 65 && keycode <= 90)   // a...z
                        || (keycode >= 48 && keycode <= 57)  // 0...9
                        || (keycode === 189)   // -
                        || (keycode === 37 || keycode === 39)  // left, right arrow
                        || (keycode === 8)  // backspace/delete
                    },
                    description: 'symbol #' + lhs + ' and all its expansions',
                    confirmDestroy: function() {
                      return true
                    },
                    destroyCallback: function() {
                      // WRITE ME
                    },
                    storeCallback: function (hashNewLhs) {
                      hashNewLhs = sanitize(hashNewLhs)
                      // WRITE ME
                    },
                    otherButtonDivs: [
                      bh.makeIconButton ('create', function (evt) {
                        evt.stopPropagation()
                        bh.unfocusEditableSpan()
                        var newRhs = symbol.rules.length ? symbol.rules[symbol.rules.length-1] : []
                        ruleDiv.append (bh.makeGrammarRhsDiv (symbol, ruleDiv, newRhs, symbol.rules.length))
                        rhsList.push (newRhs)
                        bh.selectGrammarRule (symbol)
                        bh.saveSymbol()  // should probably give focus to new RHS instead, here
                      })
                    ]}),
                 symbol.rules.map (function (rhs, n) {
                   return bh.makeGrammarRhsDiv (symbol, ruleDiv, rhs, n)
                 }))
    },

    makeGrammarRuleDiv: function (symbol) {
      var ruleDiv = $('<div class="rule">')
      this.populateGrammarRuleDiv (ruleDiv, symbol)
      this.ruleDiv[symbol.id] = ruleDiv
      return ruleDiv
    },

    placeGrammarRuleDiv: function (symbol) {
      var ruleDiv = bh.makeGrammarRuleDiv (symbol)
      var syms = this.currentGrammarSymbols()
      var sym = syms.find (function (sym) { return sym.name > symbol.name })
      if (typeof(sym) === 'undefined')
        this.grammarBarDiv.append (ruleDiv)
      else
        ruleDiv.insertBefore (this.ruleDiv[sym.id])
      this.scrollGrammarTo (lhs)
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
      $('.selected').removeClass('selected')
      this.ruleDiv[symbol.id].addClass('selected')
    },
    
    currentGrammarSymbols: function() {
      var bh = this
      return Object.keys(this.symbolCache).map (function (id) {
        return bh.symbolCache[id]
      }).sort (function (a, b) { return a.name < b.name })
    },

    showGrammarEditPage: function() {
      var bh = this
      this.setPage ('grammar')
      this.showNavBar ('grammar')

      var def
      if (this.symbolCache) {
        def = $.Deferred()
        def.resolve()
      } else {
        def = this.socket_getPlayerSymbols (this.playerID)
          .then (function (result) {
            bh.symbolCache = {}
            result.symbols.forEach (function (symbol) {
              bh.symbolCache[symbol.id] = symbol
            })
          })
      }

      def.then (function() {
        
        bh.pageExit = function() {
          bh.unfocusEditableSpan()
	  bh.container.off ('click')
        }

        bh.container.on ('click', bh.unfocusEditableSpan.bind(bh))
        bh.grammarBarDiv = $('<div class="grammarbar">')

        var infoPane = $('<div class="grammarinfopane">')
        var infoPaneContent = $('<div class="content">')
        var infoPaneTitle = $('<div class="title">')
        infoPane.append ($('<span class="closebutton">').text('x')
		         .on ('click', function() { infoPane.hide() }),
		         infoPaneTitle,
		         infoPaneContent)
      
        bh.container
	  .append ($('<div class="backbar">').append
		   ($('<div>').html (bh.makeLink ('Help', function() {
		     $.get ('/html/grammar-editor-help.html').then (function (helpHtml) {
		       bh.unfocusEditableSpan()
		       infoPaneTitle.text ('Help')
		       infoPaneContent.html (helpHtml)
		       infoPane.show()
		     })
		   }, undefined, true)),
                    $('<div>').html (bh.makeLink ('Test', function() {
		      bh.unfocusEditableSpan()
                      // WRITE ME
		      infoPaneTitle.text()
		      infoPaneContent.text()
		      infoPane.show()
		    }, undefined, true))),
		   infoPane.hide(),
                   bh.grammarBarDiv,
                   $('<div class="newlhs">').html (bh.makeIconButton ('create', function() {
                     // WRITE ME: add new symbol
                   })))
        
        bh.restoreScrolling (bh.grammarBarDiv)
        bh.restoreScrolling (infoPaneContent)

        bh.ruleDiv = {}
        bh.grammarBarDiv
          .append (bh.currentGrammarSymbols().map (bh.makeGrammarRuleDiv.bind (bh)))
      })
    },
    
    // follows
    showFollowsPage: function() {
      var bh = this
      
      this.setPage ('follows')
      this.showNavBar ('follows')

      this.searchInput = $('<input>')
      this.searchResultsDiv = $('<div class="results">')
      this.endSearchResultsDiv = $('<div class="endresults">')
      var searchButton = $('<span>')
      this.container
        .append (this.whoBarDiv = $('<div class="whobar">')
                 .append ($('<div class="search">')
                          .append ($('<div class="query">')
                                   .append (this.searchInput, searchButton),
                                   $('<div class="followsection">')
                                   .append (this.searchResultsDiv,
                                            this.endSearchResultsDiv))))
      this.searchInput.attr ('placeholder', 'Player name')
      this.placeIcon (this.searchIcon, searchButton)
      searchButton.addClass('button')
        .on ('click', bh.doSearch.bind(bh))
      this.searchInput.on ('keypress', function(event) {
        if (event.keyCode == 13 || event.which == 13)
          bh.doSearch()
      })
      this.showSearchResults()
      
      this.restoreScrolling (this.whoBarDiv)

      bh.followsById = {}
      
      this.REST_getPlayerFollow (this.playerID)
	.done (function (data) {
	  if (bh.verbose.server)
	    console.log (data)
          bh.whoBarDiv
            .append ($('<div class="followsection">')
                     .append ($('<div class="title">').text("Following"))
                     .append (bh.makeFollowDivs (data.followed, "You are not currently following anyone.")))
          var following = {}
          data.followed.map (function (follow) {
            following[follow.id] = true
//            follow.showAvatar()
          })
	}).fail (function (err) {
          bh.showModalWebError (err, bh.showInboxPage.bind(bh))
        })
    },

    makeFollowDiv: function (follow) {
      var avatarDiv = $('<div class="avatar">')
      var followClass = 'follow-button-' + follow.id, followSelector = '.' + followClass
      var buttonDiv = $('<div class="button">').addClass(followClass)
      var doFollow, doUnfollow
      function makeUnfollowButton() {
        $(followSelector).add(buttonDiv).text ('Unfollow')
          .off()
          .on ('click', bh.callWithSoundEffect (doUnfollow, 'select', $(followSelector).add(buttonDiv)))
	  .removeClass('already-clicked')
      }
      function makeFollowButton() {
        $(followSelector).add(buttonDiv).text ('Follow')
          .off()
          .on ('click', bh.callWithSoundEffect (doFollow, 'select', $(followSelector).add(buttonDiv)))
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
      var followDiv = $('<div class="follow">')
          .append (avatarDiv)
          .append ($('<div class="name">').text (follow.name))
          .append (buttonDiv)
      $.extend (follow, { followDiv: followDiv,
                          avatarDiv: avatarDiv,
                          buttonDiv: buttonDiv,
                          setFollowing: function(flag) { follow.following = flag },
//                          showAvatar: bh.showMoodImage.bind (bh, follow.id, follow.mood, avatarDiv),
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
          follow.avatarDiv
            .on ('click', bh.callWithSoundEffect (bh.showOtherStatusPage.bind (bh, follow)))
          return follow.followDiv
        })
      : $('<span>').text (emptyMessage)
    },

    doSearch: function() {
      var bh = this
      var searchText = this.searchInput.val()
      if (searchText.length && searchText !== this.lastSearch) {
        this.lastSearch = searchText
        delete this.searchResults
        this.REST_postPlayerSearch (this.playerID, searchText)
          .then (function (ret) {
	    if (bh.verbose.server)
              console.log (ret)
            bh.searchResults = ret
            bh.showSearchResults()
          })
      }
    },

    continueSearch: function() {
      var bh = this
      if (this.searchInput.val() === this.lastSearch) {
        this.REST_postPlayerSearch (this.playerID, this.lastSearch, this.searchResults.page + 1)
          .then (function (ret) {
	    if (bh.verbose.server)
              console.log (ret)
            bh.searchResults.results = bh.searchResults.results.concat (ret.results)
            bh.searchResults.more = ret.more
            bh.searchResults.page = ret.page
            bh.showSearchResults()
          })
      } else
        this.doSearch()
    },

    showSearchResults: function() {
      this.searchInput.val (this.lastSearch || '')
      this.searchResults = this.searchResults || { results: [] }
      this.searchResultsDiv.empty()
      this.endSearchResultsDiv.empty()
      if (this.lastSearch && this.lastSearch.length) {
        this.searchResultsDiv
        .append ($('<div class="title">').text("Search results"),
                 this.makeFollowDivs (this.searchResults.results, "There are no players matching '" + this.lastSearch + "'."))
        var more = $('<span>')
        this.endSearchResultsDiv.append(more)
        if (this.searchResults.more)
          more.addClass('more').text('More')
          .on ('click', function (evt) {
            evt.preventDefault()
            more.remove()
            bh.continueSearch()
          })
        else if (this.searchResults.results.length)
          more.text('All matching players shown')
      }
//      this.searchResults.results.forEach (function (follow) { follow.showAvatar() })
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
