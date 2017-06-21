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

//    this.socket_onPlayer (this.handlePlayerMessage.bind (this))
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
    grammarRootSymbol: 'document',
    iconFilename: { edit: 'pencil', create: 'circle-plus', destroy: 'trash-can', up: 'up-arrow-button', down: 'down-arrow-button' },
    
    themes: [ {style: 'plain', text: 'Plain', iconColor: 'black'},
              {style: 'cardroom', text: 'Card room', iconColor: 'white'} ],

    tabs: [{ name: 'status', method: 'showStatusPage', icon: 'scroll-unfurled', },
           { name: 'compose', method: 'showComposePage', icon: 'quill-ink' },
           { name: 'inbox', method: 'showInboxPage', icon: 'envelope' },
           { name: 'follows', method: 'showFollowsPage', icon: 'address-book-black' },
           { name: 'grammars', method: 'showGrammarListPage', icon: 'printing-press' },
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

    REST_getPlayerGrammars: function (playerID) {
      return $.get ('/p/' + playerID + '/grammars')
    },

    REST_getPlayerGrammarNew: function (playerID) {
      return $.get ('/p/' + playerID + '/grammar')
    },

    REST_getPlayerGrammar: function (playerID, grammarID) {
      return $.get ('/p/' + playerID + '/grammar/' + grammarID)
    },

    REST_postPlayerGrammar: function (playerID, grammarID, name, rules) {
      return $.post ('/p/' + playerID + '/grammar/' + grammarID, { grammar: { name: name, rules: rules } })
    },

    REST_deletePlayerGrammar: function (playerID, grammarID) {
      return $.ajax ({ url: '/p/' + playerID + '/grammar/' + grammarID,
		       method: 'DELETE' })
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

      this.gameCountDiv = $('<div class="gamecount">').hide()
      if (typeof(this.gameCount) === 'undefined')
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
/*
      this.REST_getPlayerCount (this.playerID)
	.then (function (result) {
	  bh.messageCount = result.count
	  bh.updateMessageCountDiv()
	})
*/
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
      delete this.playerLocation
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
    showGrammarListPage: function() {
      var bh = this
      
      this.setPage ('grammars')
      this.showNavBar ('grammars')

      var createDiv = $('<div class="newgrammar">')
      var buttonDiv = $('<div class="button">').text ("New")
      buttonDiv.on ('click',
                    bh.callWithSoundEffect
                    (function() {
                      bh.REST_getPlayerGrammarNew (bh.playerID)
                        .then (function (result) {
                          bh.showGrammarEditPage (result.grammar)
                        })
                    },
                     'select',
                     buttonDiv))
      createDiv.append (buttonDiv)

      this.container
        .append (this.locBarDiv = $('<div class="gramlistbar">')
		 .append ($('<span>')
			  .text("This page shows the conversation templates you've crafted."),
		          $('<span class="nogames">')
			  .html('<br/> You have no conversation templates at present.'),
                         createDiv))

      this.restoreScrolling (this.locBarDiv)

      this.REST_getPlayerGrammars (this.playerID)
        .then (function (result) {
          if (result.grammars.length)
            bh.locBarDiv.find('.nogames')
            .hide()
            .before (result.grammars.map (function (grammar) {
              var grammarDiv = $('<div class="grammar">')
              var buttonDiv = $('<div class="button">').text ("Edit")
              buttonDiv.on ('click',
                            bh.callWithSoundEffect
                            (function() {
                              bh.REST_getPlayerGrammar (bh.playerID, grammar.id)
                                .then (function (result) {
                                  bh.showGrammarEditPage (result.grammar)
                                })
                            },
                             'select',
                             buttonDiv))
              grammarDiv.append ($('<span class="title">').text (grammar.name),
                                 buttonDiv)
              return grammarDiv
            }))
        })
    },

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
      var editCallback = function (evt) {
        bh.unfocusEditableSpan()
        evt.stopPropagation()
        div.off ('click')
        var divRows = Math.round (div.height() / parseFloat(div.css('line-height')))
        var input = $('<textarea>').val(props.text).attr('rows',divRows)
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
          if (newText !== props.text) {
            bh.setGrammarAutosaveTimer()
            newText = props.storeCallback(newText) || newText
            props.text = newText
          }
          bh.populateEditableSpan (div, props)
        }
        div.html (input)
        input.focus()
      }
      
      var text2html = props.text2html || function(x) { return x }
      var buttonsDiv = $('<span class="buttons">')
      div.empty().append (text2html (props.text), buttonsDiv)
      
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

    clearGrammarAutosaveTimer: function() {
      if (this.grammarAutosaveTimer) {
        window.clearTimeout (this.grammarAutosaveTimer)
        delete this.grammarAutosaveTimer
      }
    },

    setGrammarAutosaveTimer: function() {
      this.clearGrammarAutosaveTimer()
      this.currentGrammarUnsaved = true
      this.grammarAutosaveTimer = window.setTimeout (this.autosaveGrammar.bind (this), this.grammarAutosaveDelay)
    },

    autosaveGrammar: function() {
      var def
      if (this.currentGrammarUnsaved)
        def = this.REST_postPlayerGrammar (this.playerID, this.currentGrammar.id, this.currentGrammar.name, this.currentGrammar.rules)
      else {
	console.log ('already saved')
	def = $.Deferred()
	def.resolve()
      }
      delete this.currentGrammarUnsaved
      this.clearGrammarAutosaveTimer()
      return def
    },

    makeGrammarRhsDiv: function (lhs, ruleDiv, rhs, n) {
      var span = bh.makeEditableSpan ({ className: 'rhs',
                                        text: rhs,
                                        description: 'this expansion for symbol @' + lhs,
                                        destroyCallback: function() {
                                          bh.currentGrammar.rules[lhs].splice(n,1)
                                          bh.populateGrammarRuleDiv (ruleDiv, lhs)
                                          bh.setGrammarAutosaveTimer()
                                        },
                                        confirmDestroy: function() {
                                          return bh.currentGrammar.rules[lhs][n].match (/\S/)
                                        },
                                        storeCallback: function (newRhs) {
                                          bh.currentGrammar.rules[lhs][n] = newRhs
                                        },
                                        text2html: function (rhs) {
                                          var regex = /([^@]*)((@[A-Za-z0-9_]+)|.*)/g, match, elements = []
                                          while ((match = regex.exec(rhs)) && match[0].length) {
                                            elements.push ($('<span>').text (match[1]))
                                            var atLhs = match[3]
                                            if (atLhs) {
                                              var lhs = atLhs.substr(1)
                                              var lhsSpan = $('<span>').text (atLhs)
                                              if (bh.currentGrammar.rules[lhs])
                                                lhsSpan.addClass ('lhslink')
                                                .on ('click', function (evt) {
                                                  evt.stopPropagation()
                                                  bh.scrollGrammarTo (lhs)
                                                })
                                              else
                                                lhsSpan.addClass ('lhsbrokenlink')
                                                .on ('click', function (evt) {
                                                  evt.stopPropagation()
                                                  bh.addNewLhs (lhs)
                                                })
                                              elements.push (lhsSpan)
                                            }
                                          }
                                          return $('<span>').append (elements)
                                        }
                                      })
      return span
    },

    populateGrammarRuleDiv: function (ruleDiv, lhs) {
      var bh = this
      var rhsList = bh.currentGrammar.rules[lhs]
      function sanitize (text) { return '@' + text.replace (/[^A-Za-z0-9_]/g, '') }
      ruleDiv.empty()
        .append (this.makeEditableSpan
                 ({ className: 'lhs',
                    text: '@' + lhs,
                    sanitize: sanitize,
                    keycodeFilter: function (keycode) {
                      return (keycode >= 65 && keycode <= 90)   // a...z
                        || (keycode >= 48 && keycode <= 57)  // 0...9
                        || (keycode === 189)   // -
                        || (keycode === 37 || keycode === 39)  // left, right arrow
                        || (keycode === 8)  // backspace/delete
                    },
                    description: 'symbol @' + lhs + ' and all its expansions',
                    isConstant: lhs === bh.grammarRootSymbol,
                    confirmDestroy: function() {
                      return bh.lhsIsReferredTo(lhs) || bh.currentGrammar.rules[lhs].find (function (rhs) {
                        return rhs.match (/\S/)
                      })
                    },
                    destroyCallback: function() {
                      delete bh.currentGrammar.rules[lhs]
                      delete bh.ruleDiv[lhs]
                      ruleDiv.remove()
                      bh.redrawReferers (lhs)
                      bh.setGrammarAutosaveTimer()
                    },
                    storeCallback: function (atNewLhs) {
                      atNewLhs = sanitize(atNewLhs)
                      var oldLhs = lhs, atOldLhs = '@' + oldLhs, newLhs = atNewLhs.substr(1)
                      if (newLhs.length === 0)
                        return atOldLhs
                      if (newLhs in bh.currentGrammar.rules) {
                        alert ("The symbol @" + newLhs + " is already in use. Please choose another symbol")
                        return atOldLhs
                      }
                      var rhsList = bh.currentGrammar.rules[oldLhs]
                      bh.currentGrammar.rules[newLhs] = rhsList
                      delete bh.currentGrammar.rules[oldLhs]
                      delete bh.ruleDiv[oldLhs]
                      var regex = new RegExp (atOldLhs, 'g')
                      Object.keys(bh.currentGrammar.rules).forEach (function (otherLhs) {
                        bh.currentGrammar.rules[otherLhs] = bh.currentGrammar.rules[otherLhs].map (function (rhs) {
                          return rhs.replace (regex, atNewLhs)
                        })
                        if (otherLhs !== newLhs)
                          bh.populateGrammarRuleDiv (bh.ruleDiv[otherLhs], otherLhs)
                      })
                      ruleDiv.remove()
                      bh.placeGrammarRuleDiv (newLhs)
                    },
                    otherButtonDivs: [
                      bh.makeIconButton ('create', function (evt) {
                        evt.stopPropagation()
                        bh.unfocusEditableSpan()
                        var newRhs = rhsList.length ? rhsList[rhsList.length-1] : ''
                        ruleDiv.append (bh.makeGrammarRhsDiv (lhs, ruleDiv, newRhs, rhsList.length))
                        rhsList.push (newRhs)
                        bh.selectGrammarRule (lhs)
                        bh.setGrammarAutosaveTimer()
                      })
                    ]}),
                 rhsList.map (function (rhs, n) {
                   return bh.makeGrammarRhsDiv (lhs, ruleDiv, rhs, n)
                 }))
    },

    makeGrammarRuleDiv: function (lhs) {
      var ruleDiv = $('<div class="rule">')
      this.populateGrammarRuleDiv (ruleDiv, lhs)
      this.ruleDiv[lhs] = ruleDiv
      return ruleDiv
    },

    placeGrammarRuleDiv: function (lhs) {
      var ruleDiv = bh.makeGrammarRuleDiv (lhs)
      var syms = this.currentGrammarSymbolsExcludingRoot()
      var sym = syms.find (function (sym) { return sym > lhs })
      if (typeof(sym) === 'undefined')
        this.grammarBarDiv.append (ruleDiv)
      else
        ruleDiv.insertBefore (this.ruleDiv[sym])
      this.scrollGrammarTo (lhs)
    },

    scrollGrammarTo: function (lhs) {
      var ruleDiv = this.ruleDiv[lhs]
      this.grammarBarDiv.animate ({
        // Scroll parent to the new element. This arcane formula can probably be simplified
        scrollTop: this.grammarBarDiv.scrollTop() + ruleDiv.position().top - this.grammarBarDiv.position().top
      })
      this.selectGrammarRule (lhs)
    },

    selectGrammarRule: function (lhs) {
      $('.selected').removeClass('selected')
      this.ruleDiv[lhs].addClass('selected')
    },
    
    lhsRefersTo: function (lhs, refLhs) {
      return this.currentGrammar.rules[lhs].find (function (rhs) {
        return rhs.match ('@' + refLhs)
      })
    },

    lhsIsReferredTo: function (lhs) {
      var bh = this
      return Object.keys(this.currentGrammar.rules).find (function (otherLhs) {
        return bh.lhsRefersTo (otherLhs, lhs)
      })
    },

    lhsExists: function (lhs) {
      return this.currentGrammar.rules[lhs] || this.lhsIsReferredTo(lhs)
    },

    redrawReferers: function (lhs) {
      var bh = this
      Object.keys (this.currentGrammar.rules).forEach (function (otherLhs) {
        if (bh.lhsRefersTo (otherLhs, lhs))
          bh.populateGrammarRuleDiv (bh.ruleDiv[otherLhs], otherLhs)
      })
    },

    addNewLhs: function (lhs, renameFlag) {
      this.currentGrammar.rules[lhs] = ['']
      this.placeGrammarRuleDiv (lhs)
      this.redrawReferers (lhs)
      var focusElement = this.ruleDiv[lhs].find (renameFlag ? '.lhs' : '.rhs').first()
      window.setTimeout (function() { focusElement.trigger ('click') }, 0)
      this.setGrammarAutosaveTimer()
    },

    currentGrammarSymbolsExcludingRoot: function() {
      return Object.keys(this.currentGrammar.rules).filter (function (lhs) {
        return lhs !== bh.grammarRootSymbol
      }).sort()
    },

    showGrammarEditPage: function (grammar) {
      var bh = this
      this.setPage ('edit')
      
      this.currentGrammar = grammar
      delete this.currentGrammarUnsaved
      this.pageExit = function() {
        bh.unfocusEditableSpan()
	this.container.off ('click')
      }

      this.container.on ('click', this.unfocusEditableSpan.bind(this))
      this.grammarBarDiv = $('<div class="grammarbar">')

      var titleSpan = this.makeEditableSpan ({ className: 'grammartitle',
                                               text: grammar.name,
                                               maxLength: bh.maxGrammarTitleLength,
                                               storeCallback: function (name) {
                                                 bh.currentGrammar.name = name
                                               }
                                             })

      var infoPane = $('<div class="grammarinfopane">')
      var infoPaneContent = $('<div class="content">')
      var infoPaneTitle = $('<div class="title">')
      infoPane.append ($('<span class="closebutton">').text('x')
		       .on ('click', function() { infoPane.hide() }),
		       infoPaneTitle,
		       infoPaneContent)
      
      this.container
        .empty()
	.append ($('<div class="backbar">').append
		 ($('<div>').html (this.makeLink ('Help', function() {
		   $.get ('/html/grammar-editor-help.html').then (function (helpHtml) {
		     bh.unfocusEditableSpan()
		     infoPaneTitle.text ('Help')
		     infoPaneContent.html (helpHtml)
		     infoPane.show()
		   })
		 }, undefined, true)),
                  $('<div>').html (this.makeLink ('Test', function() {
		    bh.unfocusEditableSpan()
		    infoPaneTitle.text ('Example: ' + bh.currentGrammar.name)
		    infoPaneContent.text (bh.Label.expandGrammar (bh.currentGrammar))
		    infoPane.show()
		  }, undefined, true)),
                  $('<div>').html (this.makeLink ('Delete', function() {
		    bh.unfocusEditableSpan()
		    if (window.confirm ("Delete " + bh.currentGrammar.name + "?")) {
		      delete bh.currentGrammarUnsaved
		      bh.container.empty()
		      bh.REST_deletePlayerGrammar (bh.playerID, bh.currentGrammar.id)
			.then (bh.reloadCurrentTab.bind (bh))
		    }
		  }, undefined, true)),
                  $('<div>').html (this.makeLink ('Back', function() {
		    bh.unfocusEditableSpan()
		    bh.container.empty()
		    bh.autosaveGrammar().then (bh.reloadCurrentTab.bind (bh))
		  }))),
		 infoPane.hide(),
                 titleSpan,
                 this.grammarBarDiv,
                 $('<div class="newlhs">').html (this.makeIconButton ('create', function() {
                   var nSection = Object.keys(bh.currentGrammar.rules).length, lhs
                   do {
                     lhs = 'section' + (++nSection)
                   } while (bh.lhsExists(lhs))
                   bh.addNewLhs (lhs, true)
                 })))

      this.restoreScrolling (this.grammarBarDiv)
      this.restoreScrolling (infoPaneContent)

      this.ruleDiv = {}
      var lhsSyms = [this.grammarRootSymbol].concat (this.currentGrammarSymbolsExcludingRoot())
      this.grammarBarDiv
        .append (lhsSyms.map (this.makeGrammarRuleDiv.bind (this)))
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
