// api/services/GameService.js

var extend = require('extend')
var merge = require('deepmerge');

function isArray (obj) {
    return Object.prototype.toString.call(obj) === '[object Array]'
}

module.exports = {

    buildTextTree: function (texts, game) {
//        console.log('buildTextTree')
//        console.log(JSON.stringify(texts))
        var defaultNextHint = 'Next'
        var defaultAbsentText = 'Time passes...'

    	// rewire the array of trees into a single DAG; build name index
        var nextTree, nodeByName = {}
	texts.reverse().forEach (function (tree) {
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
                            }
                            head = prev
                        })
                        delete node.next
                        delete node.left
                        delete node.right
                        node.next = head
                        node.text = split[0]
                    }
                }
                
                if (!node.text) {
                    if (node.left || node.right || node.next) {
                        sails.log.debug ("Node has children but no text: " + node)
                        node.text = defaultAbsentText
                    } else if (nextTree) {
                        // bypass the empty leaf node
                        node.id = nextTree.id
                        node.depth = nextTree.depth
                        node.isLeaf = nextTree.isLeaf
                        return
                    }
                }

                node.isLeaf = !(node.next || node.left || node.right || nextTree || node.text)
                if (!node.isLeaf) {
		    if (node.next) {
                        connect (node.next)
                        node.left = node.right = node.next

		    } else {
                        if (node.left)
                            connect (node.left)
                        else
                            node.left = nextTree || { isLeaf: true }

                        if (node.right)
                            connect (node.right)
                        else
                            node.right = nextTree || { isLeaf: true }
		    }
                }

                if (node.name)
                    nodeByName[node.name] = node

		if (node.define) {
		    if (isArray (node.define))
			node.define.forEach (function (def) {
			    connect (def)
			})
		    else
			connect (node.define)
		}
            }
	    connect (tree)
            nextTree = tree
        })
        
        // resolve names, check for cycles, convert into an array of nodes
	var nodeList = []
        function linkSummary (node, defaultChoice) {
            var summary = {}
	    summary.hint = node.hint || defaultNextHint
            if (node.choice || node.menu) {
                summary.choice = node.choice
                summary.menu = node.menu
                summary.priority = node.priority
                summary.virtue = node.virtue
		summary.concat = node.concat
            } else if (!node.depth) {
                summary.choice = defaultChoice
                summary.priority = -1
            }
            summary.id = node.id
            return summary
        }

	function recurse (node) {
//            console.log("recurse: " + JSON.stringify(node))
            if (node.depth)
                return node

            if (node.goto) {
                var linkedNode = nodeByName[node.goto]
                if (!linkedNode) {
                    sails.log.debug ("Name " + node.goto + " unresolved - replacing with leaf node")
                    return { depth: 0, isLeaf: true }
                }
                node.ancestral = true
                linkedNode = recurse (linkedNode)
                node.ancestral = false

                node.id = linkedNode.id
                node.depth = linkedNode.depth
                node.isLeaf = linkedNode.isLeaf
                // hints are pretty context-sensitive, so use the default hint ("Next"), or the hint specified in the 'goto' node; don't just blindly inherit the linkedNode hint
                return node
            }

            if (node.ancestral) {
                sails.log.debug ("Cycle detected - replacing with leaf node")
                return { depth: 0, isLeaf: true }
            }
            
            if (node.isLeaf)
                node.depth = 0
            else {
                node.ancestral = true
                node.left = recurse (node.left)
                node.right = recurse (node.right)
                node.ancestral = false
                
                node.depth = 1 + Math.max (node.left.depth || 0,
                                           node.right.depth || 0)

                node.id = nodeList.length
                nodeList.push ({ id: node.id,
                                 left: linkSummary (node.left, 'l'),
                                 right: linkSummary (node.right, 'r'),
                                 depth: node.depth,
                                 choice: node.choice,
                                 menu: node.menu,
                                 priority: node.priority,
                                 virtue: node.virtue,
				 concat: node.concat,
                                 text: node.text })
            }

            return node
        }

        if (nextTree)
	    recurse (nextTree)

//        console.log(JSON.stringify(nodeList))
        if (!nodeList.length && !game.finished) {
            nodeList= [{ id: 0,
                         text: defaultAbsentText,
                         left: { hint: defaultNextHint, choice: 'l' },
                         right: { hint: defaultNextHint, choice: 'r' },
                         depth: 1 }]
        }
        return nodeList
    },

    expandText: function (text, game, outcome, role, allowNonStringEvals) {
	if (!text)
	    return []

        if (isArray(text)) {
            return text.map (function (t) {
                return GameService.expandText (t, game, outcome, role, false)
            })
        } else if (typeof(text) == 'object') {
            var expanded
            if (text.expr)
                expanded = GameService.expandText ('{{' + text.expr + '}}', game, outcome, role, true)
            else
	        expanded = {}
	    Object.keys(text).forEach (function (key) {
		if (key == 'text' || typeof(text[key]) == 'object')
		    expanded[key] = GameService.expandText (text[key], game, outcome, role, false)
		else if (key != 'expr')
		    expanded[key] = text[key]
	    })
	    return expanded
	}

        var self, other
        if (role == 1) {
            self = game.player1.displayName
            other = game.player2.displayName
        } else {
            self = game.player2.displayName
            other = game.player1.displayName
        }

        var $c = game.common,
            $g1 = game.player1.global,
            $l1 = game.local1,
            $n1 = game.player1.displayName,
            $g2 = game.player2.global,
            $l2 = game.local2,
            $n2 = game.player2.displayName,

            $common = $c,
            $global1 = $g1,
            $global2 = $g2,
            $local1 = $l1,
            $local2 = $l2,
            $name1 = $n1,
            $name2 = $n2,

            $g = role == 1 ? $g1 : $g2,
            $l = role == 1 ? $l1 : $l2,
            $n = role == 1 ? $n1 : $n2,
            
            $go = role == 1 ? $g2 : $g1,
            $lo = role == 1 ? $l2 : $l1,
            $no = role == 1 ? $n2 : $n1

        var $current, $src, $next, $dest
        if (outcome) {
            $src = outcome.choice.name
            $next = outcome.next
            $dest = outcome.next.length == 1 ? outcome.next[0] : undefined
        } else {
            $current = game.current.name
        }

        if (allowNonStringEvals) {
            var braceRegex = /\s*\{\{(.*?)\}\}\s*/;
            var braceMatch = braceRegex.exec(text)
            if (braceMatch && braceMatch[0].length == text.length) {
                // entire text string matches pattern {{...}}, so eval the code inside without coercing result to a string
                var val = ''
                try {
                    val = eval(braceMatch[1])
                } catch (e) {
                    // do nothing, ignore undefined values and other errors in eval()
                }
                return val
            }
        }
        
        return text
            .replace (/\{\{(.*?)\}\}/g, function (match, expr) {
                var val
                try {
                    val = eval(expr)
                } catch (e) {
                    // do nothing, ignore undefined values and other errors in eval()
                }
                return val && (typeof(val) === 'string' || typeof(val) === 'number') ? val : ''
            })
            .replace(/\$player1/g,game.player1.displayName)
            .replace(/\$player2/g,game.player2.displayName)
            .replace(/\$self/g,self)
            .replace(/\$other/g,other)
    },
    
    expandOutcomeText: function (text, game, outcome, role) {
        var outro = GameService.expandText (text, game, outcome, role, true)
        var verb = Outcome.outcomeVerb (game, outcome, role)
        if (verb.length) {
            if (outro.length == 0)
                outro.push ({ text: '' })
            outro[0].text = verb + outro[0].text
        }
        return outro
    },

    swapTextRoles: function (x) {
        if (isArray(x)) {
	    return x.map (function (elem) { return GameService.swapTextRoles(elem) })
	} else if (typeof(x) == 'object') {
	    var swapped = {}
	    Object.keys(x).forEach (function (key) {
		if (typeof(x[key]) == 'object' || key == 'text')
		    swapped[key] = GameService.swapTextRoles(x[key])
		else
		    swapped[key] = x[key]
	    })
	    return swapped
	}
        return x.replace(/\$player1/g,"$TMP_PLAYER1")  // placeholder
            .replace(/\$player2/g,"$player1")
            .replace(/\$TMP_PLAYER1/g,"$player2")
    },

    moveOutcomes: function (game, cb) {
//	console.log('moveOutcomes')
//	console.log(game)
        var query = Outcome.find ({ choice: game.current.id })
	if (game.move1 != '')
	    query.where ({ move1: [game.move1, '*'] })
	if (game.move2 != '')
	    query.where ({ move2: [game.move2, '*'] })
        query.exec (function (err, outcomes) {
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
	GameService.updateGame (query,
				game,
				function() {
				    GameService.updatePlayers (game, success, error)
				},
				error)
    },

    updateGame: function (query, game, success, error) {
	GameService.playBotMoves (game)
	var updateAttrs = { text1: game.text1,
			    text2: game.text2,
			    defaultMove1: game.defaultMove1,
			    defaultMove2: game.defaultMove2,
			    moves: game.moves,
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
	    Choice.findOne ({ name: nextChoiceName }).exec (function (err, choice) {
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

	game.tree1 = game.tree1.concat (GameService.expandText (choice.intro, game, null, 1, true))
	game.tree2 = game.tree2.concat (GameService.expandText (choice.intro2 || choice.intro, game, null, 2, true))

	// auto-expand or update
	if (choice.autoexpand)
	    GameService
	    .applyRandomOutcomes (game,
				  success,
				  error)
	else
	    success()
    },

    applyRandomOutcomes: function (game, success, error) {
	// find a random outcome
        GameService.randomOutcomes
	(game,
         function (err, outcomes) {
             if (err)
		 error (err)
	     else {
		 outcomes.forEach (function (outcome) {

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

		     game.tree1 = game.tree1.concat (GameService.expandOutcomeText (outcome.outro, game, outcome, 1))
		     game.tree2 = game.tree2.concat (GameService.expandOutcomeText (outcome.outro2 || outcome.outro, game, outcome, 2))
		 })

		 game.move1 = game.move2 = ''
		 GameService.resolveNextChoice (game, success, error)
	     }
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
            $l1 = p1.local.state,
            $n1 = p1.displayName,
            $s2 = p2[context].state,
            $g2 = p2.global.state,
            $l2 = p2.local.state,
            $n2 = p2.displayName,
	
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

        var $s, $g, $l, $n, $so, $go, $lo, $no
        if (role) {
            $s = info.self[context].state
            $g = info.self.global.state
            $l = info.self.local.state
            $n = info.self.displayName
            $so = info.other[context].state
            $go = info.other.global
            $lo = info.other.local
            $no = info.other.displayName
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
            $g2 = game.player2.global,
            $l2 = game.local2,
            $n2 = game.player2.displayName,

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

	    $1 = game.move1,
	    $2 = game.move2

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
            // do nothing, ignore undefined values and other errors in eval()
        }

        return func (GameService.toWeight (val))
    },

    toWeight: function (w) {
        return w ? (typeof(w) === 'string' ? parseFloat(w) : w) : 0
    },

    gotBothMoves: function (game) {
	return game.move1 != '' && game.move2 != ''
    },

    createGame: function (game, success, error) {
	game.currentStartTime = new Date()
	var create = function() {
            game.finished = game.current ? false : true
	    GameService.prepareTextTrees (game)
	    GameService.playBotMoves (game)
	    Game.create (game,
			 function (err, g) {
			     if (err)
				 error (err)
			     else {
				 game.id = g.id
				 success()
			     }
			 })
	}
	game.tree1 = []
	game.tree2 = []
	GameService.expandCurrentChoice (game, create, error)
    },

    recordMove: function (info, gotOutcome, playerWaiting, error) {
        var game = info.game
        var moveNumber = info.moveNumber
	var update = info.update
	var query = { id: game.id,
		      moves: game.moves,
		      move1: game.move1,
		      move2: game.move2 }
	sails.log.debug ("Recording " + JSON.stringify(update) + " for game #" + game.id + " move #" + moveNumber)
	// prepare some callbacks
	var success = function() {
	    gotOutcome (game, game.player1, game.player2)
	}
	var updateWithPlayerWaiting = function() {
	    GameService.updateGame (query, game, playerWaiting, error)
	}
	var updateWithOutcome = function() {
	    ++game.moves
	    game.currentStartTime = new Date()
	    GameService.updateGameAndPlayers (query, game, success, error)
	}
	// update
	extend (game, update)
	if (GameService.gotBothMoves (game)) {
	    game.tree1 = []
	    game.tree2 = []
	    GameService.applyRandomOutcomes (game, updateWithOutcome, error)
	} else
	    updateWithPlayerWaiting()
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
        // call prepareTextTrees first
        if (!game.finished) {
	    BotService.decorate (game.player1, game)
	    BotService.decorate (game.player2, game)
	    if (!game.player1.human)
	        game.move1 = game.defaultMove1
            if (!game.player2.human)
	        game.move2 = game.defaultMove2
        }
    },

};
