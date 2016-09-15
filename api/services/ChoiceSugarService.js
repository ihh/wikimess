// api/services/ChoiceSugarService.js

var extend = require('extend');

module.exports = {

    createChoice: function (config, successCallback, errorCallback) {
//        console.log ('createChoice')
//        console.log (config)

	// keys for Choices
        var asymKeys = ['local', 'global', 'mood']
        var aliasKeys = { 'l': 'local',
			  'g': 'global',
			  'm': 'mood',
			  'l1': 'local1',
			  'l2': 'local2',
			  'g1': 'global1',
			  'g2': 'global2',
			  'm1': 'mood1',
			  'm2': 'mood2' }

	function expandAliases (obj) {
            Object.keys(aliasKeys).forEach (function (key) {
                if (obj.hasOwnProperty(key)) {
                    obj[aliasKeys[key]] = obj[key]
                    delete obj[key]
                }
            })
            asymKeys.forEach (function (key) {
                if (obj.hasOwnProperty(key)) {
                    // various ways of specifying asymmetric things
                    if (Object.prototype.toString.call(obj[key]) === '[object Array]') {
                        obj[key+'1'] = obj[key][0]
                        obj[key+'2'] = obj[key][1]
                    } else if (typeof(obj[key]) === 'object') {
                        obj[key+'1'] = obj[key]['1']
                        obj[key+'2'] = obj[key]['2']
                    } else
                        obj[key+'1'] = obj[key+'2'] = obj[key]
                }
                delete obj[key]
            })
	}

        // keys for Outcomes
        var symOutcomeKeys = ['weight', 'next', 'flush', 'common']
        
        var outcomes = [], nestedChoices = []
        var addOutcome = function (move1, move2, json) {
            var oc = {}
            extend (oc, json)
            oc.move1 = move1
            oc.move2 = move2
            outcomes.push (oc)
        }

        var addOutcomes = function (tag, adders) {
            if (Object.prototype.toString.call(tag) === '[object Array]') {
                tag.forEach (function(t) { addOutcomes(t,adders) })
                return
            }
            if (config.hasOwnProperty(tag)) {
                var outs = config[tag]
                if (Object.prototype.toString.call(outs) !== '[object Array]')
                    outs = [outs]
                outs.forEach (function (out) {
                    if (typeof(out) == 'string')
                        out = { outro: out }
		    expandAliases (out)
                    if (out.next) {
                        if (Object.prototype.toString.call(out.next) !== '[object Array]')
                            out.next = [out.next]
                        out.next = out.next.map (function (next) {
                            if (typeof(next) === 'object') {
                                var count = nestedChoices.length + 1
                                next.parent = config.name
                                next.name = config.name + '.' + count
                                nestedChoices.push (next)
                                return next.name
                            } else
                                return next
                        })
                    }
                    adders.forEach (function (adder) {
                        adder.call (null, out)
                    })
                })
                delete config[tag]
            }
        }

        var flip_cd = function (outcome) {
            var flipped = {}
            var outro = outcome.outro ? GameService.swapTextRoles (outcome.outro) : null
            var outro2 = outcome.outro2 ? GameService.swapTextRoles (outcome.outro2) : null
            if (outro2) {
                flipped.outro2 = outro
                flipped.outro = outro2
            } else
                flipped.outro = outro
            symOutcomeKeys.concat(asymKeys).forEach (function (key) {
                if (outcome.hasOwnProperty(key))
                    flipped[key] = outcome[key]
            })
            asymKeys.forEach (function (key) {
                if (outcome.hasOwnProperty(key+'1'))
                    flipped[key+'2'] = outcome[key+'1']
                if (outcome.hasOwnProperty(key+'2'))
                    flipped[key+'1'] = outcome[key+'2']
            })
            return flipped
        }

        var add_cc = function (outcome) { addOutcome ('c', 'c', outcome) }
        var add_cd = function (outcome) { addOutcome ('c', 'd', outcome) }
        var add_dc = function (outcome) { addOutcome ('d', 'c', outcome) }
        var add_dd = function (outcome) { addOutcome ('d', 'd', outcome) }

        var add_flipped = function (outcome) { addOutcome ('d', 'c', flip_cd (outcome)) }
        var add_auto = function (outcome) { addOutcome (undefined, undefined, outcome); config.autoexpand = true }

        addOutcomes ('cc', [add_cc])
        addOutcomes ('cd', [add_cd])
        addOutcomes ('dc', [add_dc])
        addOutcomes ('dd', [add_dd])

        addOutcomes (['c*','cx'], [add_cc, add_cd])
        addOutcomes (['d*','dx'], [add_dc, add_dd])
        addOutcomes (['*c','xc'], [add_cc, add_dc])
        addOutcomes (['*d','xd'], [add_cd, add_dd])

        addOutcomes (['!cc','notcc'], [add_cd, add_dc, add_dd])
        addOutcomes (['!cd','notcd'], [add_cc, add_dc, add_dd])
        addOutcomes (['!dc','notdc'], [add_cc, add_cd, add_dd])
        addOutcomes (['!dd','notdd'], [add_cc, add_cd, add_dc])

        addOutcomes (['*','any'], [add_cc, add_cd, add_dc, add_dd])

        addOutcomes ('same', [add_cc, add_dd])
        addOutcomes ('diff', [add_cd, add_dc])
        addOutcomes (['cd2','symdiff'], [add_cd, add_flipped])

        addOutcomes (['auto'], [add_auto])

	expandAliases (config);
	['','2'].forEach (function (suffix) {
	    var hint = 'hint' + suffix, hintd = 'hintd' + suffix, hintc = 'hintc' + suffix
            if (config[hint]) {
		// various ways of specifying asymmetric things
		if (Object.prototype.toString.call(config[hint]) === '[object Array]') {
                    config[hintd] = config[hint][0]
                    config[hintc] = config[hint][1]
		} else if (typeof(config[hint]) === 'object') {
                    config[hintd] = config[hint].d
                    config[hintc] = config[hint].c
		} else
                    config[hintc] = config[hintd] = config[hint]
		delete config[hint]
	    }
        })
        
        // make a little callback-wrapper that concatenates created choices
        var appendChoices = function (prevChoices, callback) {
            return function (newChoices) {
                callback (prevChoices.concat (newChoices))
            }
        }

        // create a chain of callbacks
        var callback = successCallback
        nestedChoices.forEach (function (nestedChoice) {
            callback = (function (prevCallback) {
                return function (prevChoices) {
                    ChoiceSugarService
                        .createChoice (nestedChoice,
                                       appendChoices (prevChoices, prevCallback),
                                       errorCallback)
                }
            }) (callback)
        })

        // create the choice, then call the chain
        ChoiceSugarService
            .createChoiceWithOutcomes (config,
                                       outcomes,
                                       callback,
                                       errorCallback)
    },

    destroyOutcomesAndChildren: function (choice, callback) {
//        console.log('destroyOutcomesAndChildren: ' + choice.name)
        // delete any Outcomes previously attached to this Choice
        Outcome.destroy
        ({ choice: choice.id },
         function (err) {
//             console.log('Outcome.destroy')
             if (err)
                 callback (err)
             else {
                 // recursively delete any anonymous Choices descended from this Choice
                 Choice
                     .find ({ parent: choice.name })
                     .exec (function (err, children) {
//                         console.log('Choice.find')
//                         console.log(children)
                         if (err)
                             callback (err)
                         else {
                             // create a chain of callbacks
                             var next = callback
                             children.forEach (function (child) {
                                 next = (function(cb) {
                                     return function() {
                                         ChoiceSugarService
                                             .destroyOutcomesAndChildren
                                         (child,
                                          function (err) {
                                              if (err)
                                                  callback(err)
                                              else
                                                  Choice
                                                  .destroy
                                              ({ id: child.id },
                                               function (err) {
                                                   if (err)
                                                       callback(err)
                                                   else
                                                       cb()
                                               })
                                          })
                                     }
                                 }) (next)
                             })
                             // call last function in the chain
                             next()
                         }
                     })
             }
         })
    },
    
    createChoiceWithOutcomes: function (config, outcomes, successCallback, errorCallback) {
//        console.log ('createChoiceWithOutcomes')
//        console.log (config)
//        console.log (outcomes)

        // find or create a Choice with this name
        Choice
            .findOrCreate ({ name: config.name })
            .exec (function (err, choice) {
//                console.log('Choice.findOrCreate')
//                console.log(choice)
                if (err)
                    errorCallback (err)
                else if (!choice)
                    errorCallback (new Error("Could not find/create choice"))
                else {
                    // recursively delete any Outcomes and anonymous Choices descended from this Choice
                    ChoiceSugarService
                        .destroyOutcomesAndChildren
                    (choice,
                     function (err) {
                         if (err)
                             errorCallback (err)
                         else {
                             // update the Choice
                             Choice.update
                             ({ id: choice.id },
                              config,
                              function (err, choices) {
//                                  console.log('Choice.update')
//                                  console.log(choices)
                                  if (err)
                                      errorCallback (err)
                                  else if (choices.length != 1)
                                      errorCallback (new Error("Could not update choice"))
                                  else {
                                      // add the new Outcomes
                                      outcomes.forEach (function (outcome) {
                                          outcome.choice = choice.id
                                      })
                                      Outcome.create(outcomes).exec
                                      (function (err, createdOutcomes) {
//                                          console.log('Outcome.create')
//                                          console.log(createdOutcomes)
                                          if (err)
                                              errorCallback (err)
                                          else {
                                              // return a (single-element) list of created Choices, with Outcomes expanded
                                              // go through some contortions to outwit name collision with virtual attribute for 'outcomes'...
                                              var choiceCopy = {}
                                              Object.keys(choice).forEach (function (key) { choiceCopy[key] = choice[key] })
                                              choiceCopy.outcomes = createdOutcomes
//                                              console.log(choiceCopy)
                                              successCallback ([choiceCopy])
                                          }
                                      })
                                  }
                              })
                         }
                     })
                }
            })
    }
};
