// api/services/GameService.js

var extend = require('extend')
var merge = require('deepmerge');

module.exports = {

    expandText: function (text, game, outcome, role) {
        var self, other
        if (role == 1) {
            self = game.player1.name
            other = game.player2.name
        } else {
            self = game.player2.name
            other = game.player1.name
        }

        var $c = game.common,
            $g1 = game.player1.global,
            $l1 = game.local1,
            $n1 = game.player1.name,
            $g2 = game.player2.global,
            $l2 = game.local2,
            $n2 = game.player2.name,

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

        return text
            .replace (/\{\{(.*?)\}\}/g, function (match, expr) {
                var val
                try {
                    val = eval(expr)
                } catch (e) {
                    // do nothing, ignore undefined values and other errors in eval()
                }
                return val && typeof(val) === 'string' ? val : ''
            })
            .replace(/\$player1/g,game.player1.name)
            .replace(/\$player2/g,game.player2.name)
            .replace(/\$self/g,self)
            .replace(/\$other/g,other)
    },

    swapTextRoles: function (text) {
        return text.replace(/\$player1/g,"$TMP_PLAYER1")  // placeholder
            .replace(/\$player2/g,"$player1")
            .replace(/\$TMP_PLAYER1/g,"$player2")
    },

    moveOutcomes: function (game, cb) {
        var query = Outcome.find ({ choice: game.current.id })
	if (game.move1 != 'none')
	    query.where ({ move1: game.move1 })
	if (game.move2 != 'none')
	    query.where ({ move2: game.move2 })
        query.exec (function (err, outcomes) {
            if (err)
                cb (err)
            else
                cb (null, outcomes)
        })
    },

    randomOutcome: function (game, cb) {
        GameService.moveOutcomes (game, function (err, outcomes) {
            if (err) {
                cb (err)
                return
            }
            var outcomeWeight = outcomes.map (function (outcome) {
                return GameService.evalOutcomeWeight (game, outcome)
            })
            var totalWeight = outcomeWeight.reduce (function (total, w) {
                return total + w
            }, 0)
            if (totalWeight) {
                var w = totalWeight * Math.random()
                for (var i = 0; i < outcomes.length; ++i)
                    if ((w -= outcomeWeight[i]) <= 0) {
                        cb (null, outcomes[i])
                        return
                    }
            }
            cb (null, null)
            return
        })
    },

    applyRandomOutcome: function (info, error) {
	var game = info.game
	var gotOutcome = info.gotOutcome
	var storeOutcome = info.storeOutcome
        GameService.randomOutcome
	(game,
         function (err, outcome) {
             if (err)
                 error (err)
             else if (!outcome)
                 error (new Error ("No outcome found"))
             else {
                 var future = outcome.next
                 if (!outcome.flush)
                     future = future.concat (game.future)
                 // prepare a function to update the state of everything
                 var updateGame = function (currentChoice, futureChoiceNames) {
		     var currentChoiceID = currentChoice ? currentChoice.id : null
		     var currentChoiceIntro = currentChoice ? currentChoice.intro : null
		     var autoExpandCurrentChoice = (currentChoiceID && !(currentChoiceIntro && /\S/.test(currentChoiceIntro)))
                     // evaluate updated player globals before updating game, so we get the correct $src
                     var p1global = GameService.evalUpdatedState (game, outcome, 1, false)
                     var p2global = GameService.evalUpdatedState (game, outcome, 2, false)
                     // update game state
		     var updateAttrs = { move1: 'none',
					 move2: 'none',
					 moves: game.moves + 1,
					 mood1: Outcome.mood1 (game, outcome),
					 mood2: Outcome.mood2 (game, outcome),
                                         common: GameService.evalUpdatedState (game, outcome, 0, true),
                                         local1: GameService.evalUpdatedState (game, outcome, 1, true),
                                         local2: GameService.evalUpdatedState (game, outcome, 2, true),
					 current: currentChoiceID,
                                         currentStartTime: new Date(),
					 future: futureChoiceNames,
					 finished: currentChoiceID ? false : true
				       }
		     if (storeOutcome)
			 updateAttrs.lastOutcome = outcome
                     Game.update
		     ( { id: game.id,
                         // add some extra criteria to guard against race conditions
                         moves: game.moves
                       },
                       updateAttrs,
                       function (err, updatedGames) {
                           if (err)
                               error (err)
                           else if (updatedGames.length != 1)
                               error ("Couldn't update Game")
                           else {
                               // update player1
                               Player.update
			       ( { id: game.player1.id },
                                 { global: p1global },
                                 function (err, updatedPlayer1s) {
                                     if (err)
                                         error (err)
                                     else if (updatedPlayer1s.length != 1)
                                         error ("Couldn't update player 1")
                                     else {
                                         // update player2
                                         Player.update
					 ( { id: game.player2.id },
                                           { global: p2global },
                                           function (err, updatedPlayer2s) {
                                               if (err)
                                                   error (err)
                                               else if (updatedPlayer2s.length != 1)
                                                   error ("Couldn't update player 2")
                                               else {
						   Game.find ({ id: game.id })
						       .populate ('player1')
						       .populate ('player2')
						       .populate ('current')
						       .exec (function (err, refreshedGames) {
							   var up1 = updatedPlayer1s[0]
							   var up2 = updatedPlayer2s[0]
							   if (err)
							       error(err)
							   else if (refreshedGames.length != 1)
							       error(new Error("Couldn't reload game"))
							   else {
							       if (!autoExpandCurrentChoice) {
								   GameService
								       .playBotMoves (refreshedGames[0],
										      function() {
											  gotOutcome (outcome,
												      refreshedGames[0],
												      up1,
												      up2)},
										      error)
							       } else
								   GameService.applyRandomOutcome ({ game: refreshedGames[0],
											             gotOutcome: function (dummyOutcome, game, p1, p2) {
												         gotOutcome (outcome, game, p1, p2)  // do not show the client the dummy outcome text of this auto-expansion; only the first outcome that led us here
											             },
											             storeOutcome: false },
											           error)
							   }
						       })
					       }
                                           })
                                     }
                                 })
                           }
                       })
                 }
                 // find the ID of the next scene, if there is one
                 if (future.length)
                     Choice.findOne ({ name:future[0] }).exec (function (err, choice) {
                         if (err)
                             error (err)
                         else
                             updateGame (choice, future.slice(1))
                     })
                 else
                     updateGame (null, [])
             }
         })
    },

    evalUpdatedState: function (game, outcome, role, local) {
        var p1 = { name: game.player1.name,
                   local: { state: game.local1, expr: outcome.local1 },
                   global: { state: game.player1.global, expr: outcome.global1 } }
        var p2 = { name: game.player2.name,
                   local: { state: game.local2, expr: outcome.local2 },
                   global: { state: game.player2.global, expr: outcome.global2 } }
        var info, context = local ? 'local' : 'global'
        if (role == 1)
            info = { self: p1, other: p2 }
        else
            info = { self: p2, other: p1 }

        var $c = game.common,
            $s1 = p1[context].state,
            $g1 = p1.global.state,
            $l1 = p1.local.state,
            $n1 = p1.name,
            $s2 = p2[context].state,
            $g2 = p2.global.state,
            $l2 = p2.local.state,
            $n2 = p2.name,

            $src = game.current.name,
            $next = outcome.next,
            $dest = outcome.next.length == 1 ? outcome.next[0] : undefined,

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
            $n = info.self.name
            $so = info.other[context].state
            $go = info.other.global
            $lo = info.other.local
            $no = info.other.name
        }

        var updatedState = {}
        extend (true, updatedState, role ? $s : $c)
        var newStateExpr = (role ? info.self[context].expr : outcome.common) || {}
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
	console.log (outcome)
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
            $n1 = game.player1.name,
            $g2 = game.player2.global,
            $l2 = game.local2,
            $n2 = game.player2.name,

            $src = game.current.name,
            $next = outcome.next,
            $dest = outcome.next.length == 1 ? outcome.next[0] : undefined,

            $common = $c,
            $global1 = $g1,
            $global2 = $g2,
            $local1 = $l1,
            $local2 = $l2,
            $name1 = $n1,
            $name2 = $n2

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
	return game.move1 != 'none' && game.move2 != 'none'
    },

    recordMove: function (info, gotOutcome, playerWaiting, error) {
        var game = info.game
        var moveNumber = info.moveNumber
	var update = info.update
	console.log ('recordMove')
	console.log (info)
        Game.update ({ id: game.id,
                       // add some extra criteria to guard against race conditions
                       moves: game.moves,
                       move1: game.move1,
                       move2: game.move2 },
                     update,
                     function (err, updated) {
                         if (err)
                             error (err)
			 else if (updated.length == 0)
			     error (new Error ("No Games updated"))
                         else {
			     // ensure Game.applyRandomOutcome gets to see the move
                             game.move1 = update.move1 || game.move1
                             game.move2 = update.move2 || game.move2
                             if (GameService.gotBothMoves (game))
			         GameService
                                 .applyRandomOutcome ({ game: game,
						        gotOutcome,
						        storeOutcome: true },
						      error)
                             else
                                 playerWaiting()
                         }
                     })
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

    playBotMoves: function (game, success, error) {
	var cb = function(err) {
	    if (err)
		error(err)
	    else
		success()
	}
	if (!game.player1.human)
	    Game.update({id:game.id},{move1:MiscPlayerService.randomMove(game.player1,game)},cb)
	else if (!game.player2.human)
	    Game.update({id:game.id},{move2:MiscPlayerService.randomMove(game.player2,game)},cb)
	else
	    success()
    },

};
