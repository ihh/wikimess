// api/services/GameService.js

var extend = require('extend')
var merge = require('deepmerge')
var Promise = require('bluebird')

module.exports = {

  buildTextTree: function (texts, game) {
    texts = texts.filter (function (node) { return node })  // filter out nulls
    
    // build name index
    var nodeByName = {}
    texts.forEach (function (tree, nTree) {
      function connect (node) {
        if (node.goto)
          return  // handle named links later

        if (node.text) {
          var split = node.text.split(/\s*;;\s*/)
              .filter (function (text) { return /\S/.test(text) })
          if (split.length == 0)
            delete node.text
          else if (split.length == 1)
            node.text = split[0]
          else {  // split.length > 1
            var head
            split.slice(1).reverse().forEach (function (text) {
              var prev = { text: text }
              if (head)
                prev.next = head
              else {
                prev.next = node.next
                prev.left = node.left
                prev.right = node.right
		prev.menu = node.menu
              }
              head = prev
            })
            delete node.next
            delete node.left
            delete node.right
	    delete node.menu
	    delete node.sequence
            node.next = head
            node.text = split[0]
          }
        }

        node.isLeaf = !(node.next || node.left || node.right || node.menu || node.sequence)
        if (!node.isLeaf) {
	  if (node.menu) {
	    node.menu.map (connect)

	  } else if (node.sequence) {
	    node.sequence.map (connect)

	  } else if (node.next) {
            connect (node.next)

	  } else {
            if (node.left)
              connect (node.left)
            else
              node.left = { isLeaf: true }

            if (node.right)
              connect (node.right)
            else
              node.right = { isLeaf: true }
	  }
        }

        if (node.name)
          nodeByName[node.name] = node

	if (node.define) {
	  if (GameService.isArray (node.define))
	    node.define.map (connect)
	  else
	    connect (node.define)
	}
      }
      connect (tree)
    })
    
    // resolve names, check for cycles, convert into an array of nodes
    var rootNode = { id: 0 }
    var nodeList = [rootNode]

    function linkSummary (node) {
      if (typeof(node) === 'undefined')
	return undefined
      return { id: node.id,
	       hint: node.hint,
	       visible: node.visible }
    }

    function recurse (node) {
      //            console.log("recurse: " + JSON.stringify(node))
      if (node.hasOwnProperty('id'))  // guard against cycles
        return node
      
      if (node.goto) {
        var linkedNode = nodeByName[node.goto]
        if (!linkedNode) {
          sails.log.debug ("Name " + node.goto + " unresolved - replacing with leaf node")
          return { isLeaf: true }
        }
        linkedNode = recurse (linkedNode)

        node.id = linkedNode.id
        node.isLeaf = linkedNode.isLeaf
        // hints are pretty context-sensitive, so use the default hint ("Next"), or the hint specified in the 'goto' node; don't just blindly inherit the linkedNode hint
        return node
      }
      
      node.id = nodeList.length
      var descriptor = { label: node.label,
                         labexpr: node.labexpr,
                         text: node.text }
      nodeList.push (descriptor)

      if (!node.isLeaf) {
	if (node.sequence)
          descriptor.sequence = node.sequence.map (function (child, n) { return linkSummary (recurse(child)) })
	else if (node.menu)
          descriptor.menu = node.menu.map (function (child, n) { return linkSummary (recurse(child)) })
	else if (node.next)
          descriptor.next = linkSummary (recurse(node.next))
        else {
          descriptor.left = linkSummary (recurse(node.left))
          descriptor.right = linkSummary (recurse(node.right))
        }
      }

      return node
    }

    texts.map(recurse)
    var queue = texts.map (function (root) { return root.id })
    
    if (nodeList.length == 1 && !game.finished)
      rootNode.wait = true
    else {
      queue.push (nodeList.length)
      nodeList.push ({ wait: true })
      rootNode.sequence = queue.map (function (id) { return { id: id } })
    }

    return nodeList
  },

  expandText: function (text, game, outcome, role) {
    var promise
    if (!text)
      promise = Promise.resolve(text)

    else if (GameService.isArray(text))
      promise = Promise.map (text, function (t) {
        return GameService.expandText (t, game, outcome, role)
      }).then (function (expandedArray) {
	return expandedArray
      })

    else if (typeof(text) === 'object') {
      // sample?
      if (text.sample)
	promise = GameService.expandText (GameService.expandSample (text.sample, game, outcome, role),
					  game, outcome, role)
      else {
	// initialize with ref, switch, or expr/symexpr
	var initPromise
	if (text.ref)
	  initPromise = Text.findOne({ name: text.ref })
	  .then (function (ref) {
	    delete ref.id   // hack: prevent clash of Text attribute 'id' with internally used 'id' passed to client
	    return ref
	  })
	if (!initPromise && text['switch']
	    && (typeof(role) === 'undefined' ? text['switch'].symmetric : !text['switch'].symmetric))
          initPromise = Promise.resolve (GameService.expandSwitch (text['switch'], game, outcome, role))
	if (!initPromise) {
	  var exprKey = (typeof(role) === 'undefined') ? 'symexpr' : 'expr'
	  var expr = text[exprKey]
	  if (expr)
            initPromise = Promise.resolve (GameService.evalTextExpr (expr, game, outcome, role))
	}
	if (initPromise)
	  initPromise = initPromise.then (function (init) {
	    return GameService.expandText (init, game, outcome, role)
	  })
	else
	  initPromise = Promise.resolve ({})

	// expand all properties & merge with whatever was returned by ref, switch, expr/symexpr
	promise = initPromise
	  .then (function (expanded) {
	    return Promise.map (Object.keys(text).filter (function (key) {
	      return key !== 'id'   // prevent clash of Text attribute 'id' with internally used 'id' passed to client
		&& !expanded.hasOwnProperty(key)  // ref, switch, expr/symexpr can override defaults
	    }), function (key) {
	      return GameService.expandText (text[key], game, outcome, role)
		.then (function (expandedVal) {
		  expanded[key] = expandedVal
		})
	    }).then (function() {
	      return expanded
	    })
	  })
      }

    } else if (typeof(text) === 'string')
      promise = Promise.resolve (GameService.expandTextString (text, game, outcome, role))

    else
      promise = Promise.resolve (text)

    return promise
  },

  evalTextExpr: function (expr, game, outcome, role) {
    var $c = game.common,
        $g1 = game.player1.global,
        $inv1 = $g1.inv,
        $l1 = game.local1,
        $n1 = game.player1.displayName,
        $id1 = game.player1.id,
        $p1 = game.player1,
        $g2 = game.player2.global,
        $inv2 = $g2.inv,
        $l2 = game.local2,
        $n2 = game.player2.displayName,
        $id2 = game.player2.id,
        $p2 = game.player2,

        $common = $c,
        $global1 = $g1,
        $global2 = $g2,
        $local1 = $l1,
        $local2 = $l2,
        $name1 = $n1,
        $name2 = $n2

    var $g, $inv, $l, $n, $id,
        $go, $invo, $lo, $no, $ido,
        $p, $po

    if (typeof(role) !== 'undefined') {
      $p = role == 1 ? $p1 : $p2
      $po = role == 1 ? $p2 : $p1

      $g = $p.global
      $inv = $g.inv
      $l = Game.getRoleAttr (game, role, 'local')
      $n = $p.displayName
      $id = $p.id

      $go = $po.global
      $invo = $go.inv
      $lo = Game.getOtherRoleAttr (game, role, 'local')
      $no = $po.displayName
      $ido = $po.id
    }

    var $current, $src, $next, $dest
    if (outcome) {
      $src = outcome.choice.name
      $next = outcome.next
      $dest = outcome.next.length == 1 ? outcome.next[0] : undefined
    } else {
      $current = game.current.name
    }

    var val
    try {
      val = eval(expr)
    } catch (e) {
      sails.log.debug ("When evaluating: " + braceMatch[1])
      sails.log.debug ("Error: " + e)
      // do nothing, ignore undefined values and other errors in eval()
    }

    return val
  },

  expandTextString: function (text, game, outcome, role) {
    function evalReplace (match, expr) {
      var val = GameService.evalTextExpr (expr, game, outcome, role)
      return val && (typeof(val) === 'string' || typeof(val) === 'number') ? val : ''
    }

    if (typeof(role) === 'undefined') {
      text = GameService.replaceAll (text, '{{', '}}', '<<', '>>', game, outcome, role)
      text = text.replace(/\$player1/g,game.player1.displayName)
      text = text.replace(/\$player2/g,game.player2.displayName)
    } else {
      text = GameService.replaceAll (text, '#{', '}#', '#<', '>#', game, outcome, role)
      text = text.replace(/\$self/g,Game.getRoleAttr(game,role,'player').displayName)
      text = text.replace(/\$other/g,Game.getOtherRoleAttr(game,role,'player').displayName)
    }
    return text
  },

  replaceAll: function (text, lbEval, rbEval, lbOpt, rbOpt, game, outcome, role) {
    var evalRegex = new RegExp (lbEval + "(.*?)" + rbEval, 'g')
    var optRegex = new RegExp (lbOpt + "([^#<>{}]*?\|[^#<>{}]*?)" + rbOpt)
    function evalReplace (match, expr) {
      var val = GameService.evalTextExpr (expr, game, outcome, role)
      return val && (typeof(val) === 'string' || typeof(val) === 'number') ? val : ''
    }
    var foundOptRegex
    function randomOption (_match, optionList) {
      foundOptRegex = true
      var options = optionList.split('|')
      return options[Math.floor (Math.random() * options.length)]
    }
    text = text.replace (evalRegex, evalReplace)
    do {
      foundOptRegex = false
      text = text.replace (optRegex, randomOption)
    } while (foundOptRegex)
    return text
  },

  expandSwitch: function (caseList, game, outcome, role) {
    var result, defaultResult
    for (var n = 0; n < caseList.length && !result; ++n) {
      var caseNode = caseList[n]
      if (caseNode['default'])
	defaultResult = caseNode['default']
      else
	if (GameService.evalTextExpr (caseNode.test, game, outcome, role))
	  result = caseNode['case']
    }
    return result || defaultResult || {}
  },
  
  expandSample: function (sampleExpr, game, outcome, role) {
    var groups = sampleExpr.groups.map (function (group) {
      var opts = GameService.expandSampleGroup (group, game, outcome, role)
      if (group.shuffle || (sampleExpr.shuffle && sampleExpr.cluster && (group.shuffle !== false)))
        GameService.knuthShuffle (opts)
      return opts
    })
    if (sampleExpr.shuffle && sampleExpr.cluster)
      GameService.knuthShuffle (groups)
    var list = Array.prototype.concat.apply ([], groups)
    if (sampleExpr.shuffle && !sampleExpr.cluster)
      GameService.knuthShuffle (list)
    return list
  },

  expandSampleGroup: function (group, game, outcome, role) {
    var n = group.n || 1
    var opts = group.opts.map (function (opt) {
      return opt.option ? opt : { option: opt }
    })
    var keep = new Array(opts.length).fill(false)
    var weights = opts.map (function (opt, i) {
      if (opt.exclusive === false) {
        if (keep[i] = (Math.random() < opt.weight))
          --n
        return 0
      } else if (opt.weight)
	return Math.max (0, Number (GameService.expandTextExpr (opt.weight, game, outcome, role)))
      return 1
    })
    var totalWeight = weights.reduce (function (total, w) { return total + w }, 0)
    while (n > 0 && totalWeight > 0) {
      var w = totalWeight * Math.random()
      for (var i = 0; i < weights.length; ++i)
	if ((w -= weights[i]) <= 0) {
          keep[i] = true
	  totalWeight -= weights[i]
	  weights[i] = 0
	  break
	}
      --n
    }
    return opts
      .filter (function (opt, i) { return keep[i] })
      .map (function (opt) { return opt.option })
  },

  knuthShuffle: function (array) {
    for (var i = 0; i < array.length - 1; ++i) {
      var j = i + Math.floor (Math.random() * (array.length - i))
      var tmp = array[i]
      array[i] = array[j]
      array[j] = tmp
    }
  },
  
  expandOutcomeText: function (text, game, outcome, role) {
    var outro = GameService.expandText (text, game, outcome, role)
    var verb = Outcome.outcomeVerb (game, outcome, role)
    if (verb.length) {
      if (outro.length == 0)
        outro.push ({ text: '' })
      outro[0].text = verb + outro[0].text
    }
    return outro
  },

  moveOutcomes: function (game, cb) {
    //	console.log('moveOutcomes')
    //	console.log(game)
    var query = Outcome.find ({ choice: game.current.id })
    var move1 = GameService.moveString(game.move1)
    var move2 = GameService.moveString(game.move2)
    if (move1)
      query.where ({ move1: [move1, null] })
    if (move2)
      query.where ({ move2: [move2, null] })
//    sails.log.debug("move1="+move1+" move2="+move2)
    query.populate('outro').populate('outro2')
    query.exec (function (err, outcomes) {
//      sails.log.debug("outcomes:\n",outcomes)
      if (err)
        cb (err)
      else
        cb (null, outcomes)
    })
  },

  randomOutcomes: function (game, cb) {
    GameService.moveOutcomes (game, function (err, outcomes) {
      if (err) {
        cb (err)
        return
      }
      var outcomeWeight = outcomes.map (function (outcome) {
        return GameService.evalOutcomeWeight (game, outcome)
      })
      var exclusiveOutcomeWeight = outcomeWeight.filter (function (outcome, n) {
	return outcomes[n].exclusive ? true : false
      })
      
      //	    console.log ("outcomes: " + JSON.stringify(outcomes))
      //	    console.log ("randomOutcomes weights: " + JSON.stringify(outcomeWeight))
      var totalWeight = exclusiveOutcomeWeight.reduce (function (total, w) {
        return total + w
      }, 0)
      var theOutcomes = []
      var w = totalWeight * Math.random()
      for (var i = 0; i < outcomes.length; ++i)
	if (!outcomes[i].exclusive && Math.random() < outcomeWeight[i]
	    || (outcomes[i].exclusive && w > 0 && (w -= outcomeWeight[i]) <= 0)) {
	  theOutcomes.push (outcomes[i])
	}
      cb (null, theOutcomes)
      return
    })
  },

  updateGameAndPlayers: function (query, game, success, error) {
    game.finished = game.current ? false : true
    GameService.prepareTextTrees (game)
    GameService.playBotMoves (game)
    // these database updates (Game, Player 1, Player 2, Turn) should really be wrapped in a transaction,
    // to ensure consistency
    // e.g. see http://stackoverflow.com/questions/25079408/how-to-handle-async-concurrent-requests-correctly/25100188#25100188
    // unfortunately, no transaction support in Waterline as of Sept.2016

    // update the Game
    GameService.updateGame
    (query,
     game,
     function() {
       // update the Players
       // we are committed at this point, but we've locked the Players, so...
       GameService.updatePlayers
       (game,
	function() {
	  Turn.create
	  ({ game: game.id,
	     move: game.moves + 1,
	     text1: game.text1,
	     text2: game.text2 })
	    .exec (function (err, turn) {
	      if (err)
		error (err)  // disastrous! (updated Game & Players, couldn't create Turn)
	      else
		success()
	    })
	},
	error)  // disastrous! (updated Game, couldn't update Players or create Turn)
     },
     error)  // not so disastrous (couldn't update anything)
  },

  updateGame: function (query, game, success, error) {
    var updateAttrs = { text1: game.text1,
			text2: game.text2,
			moves: game.moves,
			missed1: game.missed1,
			missed2: game.missed2,
			move1: game.move1,
			move2: game.move2,
			mood1: game.mood1,
			mood2: game.mood2,
                        common: game.common,
                        local1: game.local1,
                        local2: game.local2,
			current: game.current ? game.current.id : null,
			currentStartTime: game.currentStartTime,
			future: game.future,
			finished: game.finished
		      }

    Game.update
    (query,
     updateAttrs,
     function (err, updatedGames) {
       if (err)
         error (err)
       else if (updatedGames.length != 1)
         error (new Error ("Couldn't update Game (colliding updates from both players?)"))
       else
	 success()
     })
  },

  updatePlayers: function (game, success, error) {
    // update player1
    Player.update
    ( { id: game.player1.id },
      { global: game.player1.global },
      function (err, updatedPlayer1s) {
        if (err)
          error (err)
        else if (updatedPlayer1s.length != 1)
          error (new Error ("Couldn't update player 1"))
        else {
          // update player2
          Player.update
	  ( { id: game.player2.id },
            { global: game.player2.global },
            function (err, updatedPlayer2s) {
              if (err)
                error (err)
              else if (updatedPlayer2s.length != 1)
                error (new Error ("Couldn't update player 2"))
              else
		success()
	    })
	}
      })
  },

  wrapError: function (error, firstErr) {
    return function (laterErr) {
      error (firstErr)
      if (laterErr)
	sails.log.debug (laterErr)
    }
  },

  resolveNextChoice: function (game, success, error) {
    // find the ID of the next scene, if there is one
    if (game.future.length) {
      var nextChoiceName = game.future[0]
      game.future = game.future.slice(1)
      //	    console.log ("Attempting to resolve "+nextChoiceName)
      Choice.findOne ({ name: nextChoiceName })
	.populate('intro')
	.populate('intro2')
	.exec (function (err, choice) {
	if (err)
	  error (err)
	else if (!choice)
	  GameService.resolveNextChoice (game, success, error)
	else {
	  sails.log.debug ("Updating game #" + game.id + " from " + game.current.name + " (move #" + (game.moves+1) + ") to " + choice.name + " (move #" + (game.moves+2) + ")")

	  game.current = choice
	  GameService.expandCurrentChoice (game, success, error)
	}
      })
    } else {
      // no future for England's dreaming
      game.current = null
      success()
    }
  },

  expandCurrentChoice: function (game, success, error) {
    var choice = game.current
    
    // evaluate updated vars
    var p1global = GameService.evalUpdatedState (game, choice, 1, false)
    var p2global = GameService.evalUpdatedState (game, choice, 2, false)
    var common = GameService.evalUpdatedState (game, choice, 0, true)
    var p1local = GameService.evalUpdatedState (game, choice, 1, true)
    var p2local = GameService.evalUpdatedState (game, choice, 2, true)

    // update game state
    game.mood1 = Choice.mood1 (game, choice)
    game.mood2 = Choice.mood2 (game, choice)
    game.common = common
    game.local1 = p1local
    game.local2 = p2local
    game.player1.global = p1global
    game.player2.global = p2global

    GameService.expandText (choice.intro, game, null)
      .then (function (sharedIntro) {
	return GameService.expandText (sharedIntro, game, null, 1)
	  .then (function (intro) {
	    game.tree1.push (intro)
	    return sharedIntro
	  })
      }).then (function (sharedIntro) {
	if (choice.intro2)
	  return GameService.expandText (choice.intro2, game, null)
	else
	  return Promise.resolve (sharedIntro)
      }).then (function (sharedIntro2) {
	return GameService.expandText (sharedIntro2, game, null, 2)
      }).then (function (intro2) {
	game.tree2.push (intro2)

	// auto-expand or update
	if (choice.autoexpand)
	  GameService
	  .applyRandomOutcomes (game,
				success,
				error)
	else
	  success()
      })
  },

  applyRandomOutcomes: function (game, success, error) {
    // find a random outcome
    GameService.randomOutcomes
    (game,
     function (err, outcomes) {
       if (err)
	 error (err)
       else
	 Promise.map (outcomes, function (outcome) {

           //		     console.log (outcome)

           var future = outcome.next
           if (!outcome.flush)
	     future = future.concat (game.future)
	   game.future = future

	   // evaluate updated vars
	   var p1global = GameService.evalUpdatedState (game, outcome, 1, false)
	   var p2global = GameService.evalUpdatedState (game, outcome, 2, false)
	   var common = GameService.evalUpdatedState (game, outcome, 0, true)
	   var p1local = GameService.evalUpdatedState (game, outcome, 1, true)
	   var p2local = GameService.evalUpdatedState (game, outcome, 2, true)

	   // update game state
	   game.mood1 = Outcome.mood1 (game, outcome)
	   game.mood2 = Outcome.mood2 (game, outcome)
	   game.common = common
	   game.local1 = p1local
	   game.local2 = p2local
	   game.player1.global = p1global
	   game.player2.global = p2global

	   return GameService.expandText (outcome.outro, game, outcome)
	     .then (function (sharedOutro) {
	       return GameService.expandOutcomeText (sharedOutro, game, outcome, 1)
		 .then (function (outro) {
		   game.tree1.push (outro)
		   return sharedOutro
		 })
	     }).then (function (sharedOutro) {
	       if (outcome.outro2)
		 return GameService.expandText (outcome.outro2, game, outcome)
	       else
		 return Promise.resolve(sharedOutro)
	     }).then (function (sharedOutro2) {
		 return GameService.expandText (sharedOutro2, game, outcome)
	     }).then (function (outro2) {
	       game.tree2.push (outro2)
	     })
	 }).then (function() {
	   game.move1 = game.move2 = null
	   GameService.resolveNextChoice (game, success, error)
	 })
     })
  },

  evalUpdatedState: function (game, scene, role, local) {  // scene can be an Outcome or a Choice
    var p1 = { name: game.player1.displayName,
               local: { state: game.local1, expr: scene.local1 || {} },
               global: { state: game.player1.global, expr: scene.global1 || {} } }
    var p2 = { name: game.player2.displayName,
               local: { state: game.local2, expr: scene.local2 || {} },
               global: { state: game.player2.global, expr: scene.global2 || {} } }
    var info, context = local ? 'local' : 'global'
    if (role == 1)
      info = { self: p1, other: p2 }
    else
      info = { self: p2, other: p1 }

    var $c = game.common,
        $s1 = p1[context].state,
        $g1 = p1.global.state,
        $inv1 = p1.global.state.inv,
        $l1 = p1.local.state,
        $n1 = p1.displayName,
        $p1 = p1,
        $id1 = p1.id,
        $s2 = p2[context].state,
        $g2 = p2.global.state,
        $inv2 = p2.global.state.inv,
        $l2 = p2.local.state,
        $n2 = p2.displayName,
        $p2 = p2,
        $id2 = p2.id,
	
        $src = game.current.name,
        $next = scene.next,
        $dest = scene.next && scene.next.length == 1 ? scene.next[0] : undefined,

        $common = $c,
        $global1 = $g1,
        $global2 = $g2,
        $local1 = $l1,
        $local2 = $l2,
        $name1 = $n1,
        $name2 = $n2

    var $s, $g, $inv, $l, $n, $id, $so, $go, $invo, $lo, $no, $ido
    if (role) {
      $s = info.self[context].state
      $g = info.self.global.state
      $inv = info.self.global.state.inv
      $l = info.self.local.state
      $n = info.self.displayName
      $id = info.self.id
      $so = info.other[context].state
      $go = info.other.global.state
      $invo = info.other.global.state.inv
      $lo = info.other.local
      $no = info.other.displayName
      $ido = info.other.id
    }

    var updatedState = {}
    extend (true, updatedState, role ? $s : $c)
    var newStateExpr = (role ? info.self[context].expr : (scene.common || {})) || {}
    var recurse = function (newExpr, newState, commonState, selfState, otherState, p1State, p2State) {
      Object.keys(newExpr).forEach (function (key) {
        var expr = newExpr[key]
        if (typeof(expr) == 'object') {
          if (!newState.hasOwnProperty(key))
            newState[key] = {}
          recurse (expr,
                   newState[key],
                   commonState[key] || {},
                   selfState[key] || {},
                   otherState[key] || {},
                   p1State[key] || {},
                   p2State[key] || {})
        } else {
          var $$ = commonState[key]
          var $, $o, $1, $2
          if (role) {
            $ = selfState[key] || 0
            $o = otherState[key] || 0
            $1 = p1State[key] || 0
            $2 = p2State[key] || 0
          } else
            $ = $$

          // common shorthands
          if (expr == '++') expr = '($||0)+1'
          if (expr == '--') expr = '($||0)-1'

          // do the eval
          var val
          try {
            val = eval(expr)
          } catch (e) {
            sails.log.debug ("When evaluating: " + expr)
            sails.log.debug ("Error: " + e)
            // do nothing, ignore undefined values and other errors in eval()
          }

          newState[key] = val
        }
      })
    }
    recurse (newStateExpr, updatedState, $c, $s, $so, $s1, $s2)

    /*
      console.log ("In evalUpdatedState: role="+role+" local="+local)
      console.log (game)
      console.log (scene)
      console.log ($s)
      console.log (newStateExpr)
      console.log (updatedState)
    */

    return updatedState
  },

  evalOutcomeWeight: function (game, outcome) {
    var $c = game.common,
        $g1 = game.player1.global,
        $l1 = game.local1,
        $n1 = game.player1.displayName,
	$p1 = game.player1,
	$id1 = game.player1.id,
        $m1 = game.mood1,
        $g2 = game.player2.global,
        $l2 = game.local2,
        $n2 = game.player2.displayName,
	$p2 = game.player2,
	$id2 = game.player2.id,
        $m2 = game.mood2,

        $src = game.current.name,
        $next = outcome.next,
        $dest = outcome.next.length == 1 ? outcome.next[0] : undefined,

        $common = $c,
        $global1 = $g1,
        $global2 = $g2,
        $local1 = $l1,
        $local2 = $l2,
        $name1 = $n1,
        $name2 = $n2,
        $mood1 = $m1,
        $mood2 = $m2,

	$1 = game.move1,
	$2 = game.move2

    if ($1) {
      $1.label = GameService.moveLabel.bind (GameService, $1)
      $1.move = GameService.moveString.bind (GameService, $1)
    }
    if ($2) {
      $2.label = GameService.moveLabel.bind (GameService, $2)
      $2.move = GameService.moveString.bind (GameService, $2)
    }

    var $s1 = {}, $s2 = {}
    extend (true, $s1, $g1)
    merge ($s1, $l1)
    extend (true, $s2, $g2)
    merge ($s2, $l2)

    // handle negation as a special case; if anything is undefined in the negation return true
    var negRegex = /^\s*\!\s*\((.*)\)\s*$/;
    var negMatch = negRegex.exec (outcome.weight)
    var func, expr, val
    if (negMatch) {
      expr = negMatch[1]
      func = function(w) { return !w }
    } else {
      expr = outcome.weight
      func = function(w) { return w }
    }

    try {
      val = eval(expr)
    } catch (e) {
      sails.log.debug ("When evaluating: " + expr)
      sails.log.debug ("Error: " + e)
      // do nothing, ignore undefined values and other errors in eval()
    }

    return func (GameService.toWeight (val))
  },

  toWeight: function (w) {
    return w ? (typeof(w) === 'string' ? parseFloat(w) : w) : 0
  },

  gotBothMoves: function (game) {
    return game.move1 !== null && game.move2 !== null
  },

  createGame: function (game, success, error) {
    Game.create
    (game,
     function (err, g) {
       if (err)
	 error (err)
       else {
	 game.id = g.id
	 game.moves = g.moves
         game.common = g.common
         game.local1 = g.local1
         game.local2 = g.local2
         game.future = g.future

         game.tree1 = []
         game.tree2 = []
         game.move1 = game.move2 = null
         
	 GameService.expandCurrentChoice
	 (game,
          function() {
	    game.currentStartTime = new Date()
            GameService.updateGameAndPlayers ({ id: game.id },
                                              game,
                                              success,
                                              error)
          },
          error)
       }
     })
  },

  recordMove: function (info, gotOutcome, playerWaiting, error) {
    var game = info.game
    var moveNumber = info.moveNumber
    var update = info.update
    var turnUpdate = { mood1: game.mood1,
		       mood2: game.mood2 }
    extend (turnUpdate, info.turnUpdate || {})
    var query = { id: game.id,
		  moves: game.moves,
		  move1: game.move1,
		  move2: game.move2 }
    sails.log.debug ("Recording " + JSON.stringify(update) + " for game #" + game.id + " move #" + moveNumber + (turnUpdate ? (", turn update: " + JSON.stringify(turnUpdate)) : ""))

    // time, as a proportion of lock duration, that we allow for GameService.updateGameAndPlayers to run
    var updateTimeBudget = .1

    // callback to record the turn
    function turnUpdater (success, error) {
      return function() {
	Turn.update ({ game: game.id,
		       move: moveNumber },
		     turnUpdate,
		     function (err, updated) {
		       if (err)
			 error (err)
		       else
			 success()
		     })
      }
    }
    
    // update
    extend (game, update)
    if (update.move1)
      game.missed1 = update.move1.bot ? (game.missed1 + 1) : 0
    if (update.move2)
      game.missed2 = update.move2.bot ? (game.missed2 + 1) : 0
    if (!GameService.gotBothMoves (game))
      GameService.updateGame (query, game, turnUpdater(playerWaiting,error), error)
    else {
      game.tree1 = []
      game.tree2 = []
      PlayerService.runWithLock
      ( [ game.player1.id, game.player2.id ],
        function (lockedSuccess, lockedError, lockExpiryTime, lockDuration) {
	  function update() {
	    ++game.moves
            // check that we have enough time left to update the game state before the lock expires
            // we allow a proportion updateTimeBudget of the entire lockDuration for this game update
            // this is at best a half-assed estimate. updateGameAndPlayers could take longer to run, and the lock would expire.
	    game.currentStartTime = new Date()
            if (Date.now() < lockExpiryTime - updateTimeBudget*lockDuration)
	      GameService.updateGameAndPlayers (query, game, turnUpdater(lockedSuccess,lockedError), lockedError)
            else
              lockedError (new Error ("lock expired"))
          }
	  // refresh the Players, in case they changed state before we got the lock
	  Player.find ({ id: [game.player1.id, game.player2.id] })
	    .exec (function (err, players) {
	      if (err)
		lockedError (err)
	      else if (players.length != 2)
		lockedError (new Error ("couldn't refresh Players"))
	      else {
		if (game.player1.id === players[0].id) {
		  game.player1 = players[0]
		  game.player2 = players[1]
		} else {
		  game.player2 = players[0]
		  game.player1 = players[1]
		}
		GameService.applyRandomOutcomes (game, update, lockedError)
	      }
	    })
        },
        function() {
	  gotOutcome (game, game.player1, game.player2)
        },
        error)
    }
  },
  
  updateMood: function (info, success, error) {
    var game = info.game
    var role = info.role
    var moveNumber = info.moveNumber
    var newMood = info.mood
    var moodAttr = "mood" + role
    var oldMood = game[moodAttr]
    if (game.moves + 1 != moveNumber)
      error (new Error ("Can't change mood for move " + moveNumber + " in game " + game.id + " since game is at move " + (game.moves + 1)))
    else if (oldMood == newMood)
      success (null)
    else {
      var update = {}
      update[moodAttr] = newMood
      Game.update ( { id: game.id }, update, function (err, updated) {
        if (err)
          error (err)
        else
          success (updated)
      })
    }
  },

  prepareTextTrees: function (game) {
    game.text1 = GameService.buildTextTree (game.tree1, game)
    game.text2 = GameService.buildTextTree (game.tree2, game)
  },
  
  playBotMoves: function (game) {
    if (!game.finished) {
      if (!game.player1.human)
	game.move1 = BotService.randomMove (game.text1)
      if (!game.player2.human)
	game.move2 = BotService.randomMove (game.text2)
    }
  },

  forRole: function (game, role) {
    var text, verb, self, other, selfMood, otherMood, waiting
    var current = game.current
    if (role == 1) {
      if (current)
        verb = current.verb1
      self = game.player1
      other = game.player2
      selfMood = game.mood1
      otherMood = game.mood2
      text = game.text1
    } else {  // role == 2
      if (current)
        verb = current.verb2
      self = game.player2
      other = game.player1
      selfMood = game.mood2
      otherMood = game.mood1
      text = game.text2
    }
    return { game: game.id,
	     finished: game.finished,
             waiting: Game.isWaitingForMove (game, role),
             text: text,
             verb: verb,
             self: { mood: selfMood },
             other: { id: other.id, name: other.displayName, mood: otherMood },
             startline: game.currentStartTime,
             deadline: Game.deadline(game),
             move: game.moves + 1 }
    return json
  },

  moveString: function (move) {
    return GameService.moveLabel (move, 'move')
  },

  moveLabel: function (move, label) {
    var s
    if (move) {
      s = (move.label && move.label[label]) ? move.label[label] : ''
      if (move.children) s += move.children.map(function(c){return GameService.moveLabel(c,label)}).join('')
    } else
      s = ''
    return s
  },

  objectsEqual: function (obj1, obj2) {
    if (typeof(obj1) !== typeof(obj2))
      return false
    if (typeof(obj1) !== 'object')
      return obj1 === obj2
    var eq = true
    Object.keys(obj1).forEach (function(k1) {
      eq = eq && obj2.hasOwnProperty(k1) && GameService.objectsEqual(obj1,obj2)
    })
    Object.keys(obj2).forEach (function(k2) {
      eq = eq && obj1.hasOwnProperty(k2)
    })
    return eq
  },
  
  isArray: function (obj) {
    return Object.prototype.toString.call(obj) === '[object Array]'
  }
};
