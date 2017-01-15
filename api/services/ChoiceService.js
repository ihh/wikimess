// api/services/ChoiceService.js
var extend = require('extend');

module.exports = {

  createChoice: function (config, successCallback, errorCallback) {
    //        console.log ('createChoice')
    //        console.log (config)

    // validate against schema
    if (!SchemaService.validateChoice (config, errorCallback))
      return

    // keys for Choices and Outcomes
    var asymKeys = ['local', 'global', 'mood', 'verb']

    function makeText (text) {
      if (typeof(text) == 'undefined')
	return undefined
      else if (typeof(text) == 'string')
	return [{ text: text }]
      else if (!GameService.isArray(text))
	text = [text]
      return text
    }

    function expandAliases (obj) {
      asymKeys.forEach (function (key) {
        if (obj.hasOwnProperty(key)) {
          // various ways of specifying asymmetric things
          if (GameService.isArray(obj[key])) {
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

    function expandHints (obj, textKey) {
      if (obj.hint && obj[textKey] && obj[textKey].length) {
        var text = obj[textKey][obj[textKey].length - 1]
	text.left = text.left || {}
	text.right = text.right || {}
	text.left.hint = obj.hint[0]
	text.right.hint = obj.hint[1]
	delete obj.hint
      }
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

    var outcomeAdder = {}
    var addOutcomes = function (tag, adders) {
      outcomeAdder[tag] = function() {
        var outs = config[tag]
        if (!GameService.isArray(outs))
          outs = [outs]
        outs.forEach (function (out) {
          if (typeof(out) == 'string')
            out = { outro: out }
	  expandAliases (out)
	  out.outro = makeText (out.outro)
	  out.outro2 = makeText (out.outro2)
	  expandHints (out, 'outro')
          if (out.next) {
            if (!GameService.isArray(out.next))
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

    var flip = function (outcome) {
      var flipped = {}
      var outro = outcome.outro ? ChoiceService.swapTextRoles (outcome.outro) : null
      var outro2 = outcome.outro2 ? ChoiceService.swapTextRoles (outcome.outro2) : null
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

    var add = function (outcome) { addOutcome (outcome.move1, outcome.move2, outcome) }

    var add_ll = function (outcome) { addOutcome ('l', 'l', outcome) }
    var add_lr = function (outcome) { addOutcome ('l', 'r', outcome) }
    var add_rl = function (outcome) { addOutcome ('r', 'l', outcome) }
    var add_rr = function (outcome) { addOutcome ('r', 'r', outcome) }

    var add_flipped_rl = function (outcome) { addOutcome ('r', 'l', flip (outcome)) }
    var add_flipped_lr = function (outcome) { addOutcome ('l', 'r', flip (outcome)) }
    var add_auto = function (outcome) { addOutcome (undefined, undefined, outcome); config.autoexpand = true }

    var add_nonexclusive = function (outcome) { outcome.exclusive = false; addOutcome (undefined, undefined, outcome) }

    addOutcomes ('ll', [add_ll])
    addOutcomes ('lr', [add_lr])
    addOutcomes ('rl', [add_rl])
    addOutcomes ('rr', [add_rr])

    addOutcomes ('rx', [add_rr, add_rl])
    addOutcomes ('lx', [add_lr, add_ll])
    addOutcomes ('xr', [add_rr, add_lr])
    addOutcomes ('xl', [add_rl, add_ll])

    addOutcomes ('notrr', [add_rl, add_lr, add_ll])
    addOutcomes ('notrl', [add_rr, add_lr, add_ll])
    addOutcomes ('notlr', [add_rr, add_rl, add_ll])
    addOutcomes ('notll', [add_rr, add_rl, add_lr])

    addOutcomes ('any', [add_rr, add_rl, add_lr, add_ll])

    addOutcomes ('same', [add_rr, add_ll])
    addOutcomes ('diff', [add_rl, add_lr])
    addOutcomes ('rl2', [add_rl, add_flipped_lr])
    addOutcomes ('lr2', [add_lr, add_flipped_rl])

    addOutcomes ('auto', [add_auto])

    addOutcomes ('outcome', [add])
    addOutcomes ('effect', [add_nonexclusive])

    Object.keys(config).forEach (function (key) {
      if (outcomeAdder[key])
	outcomeAdder[key].call()
    })

    expandAliases (config)
    config.intro = makeText (config.intro)
    config.intro2 = makeText (config.intro2)
    expandHints (config, 'intro')
    
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
          ChoiceService
            .createChoice (nestedChoice,
                           appendChoices (prevChoices, prevCallback),
                           errorCallback)
        }
      }) (callback)
    })

    // create the choice, then call the chain
    ChoiceService
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
                     ChoiceService
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
          ChoiceService
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
  },

  swapTextRoles: function (x) {
    if (GameService.isArray(x)) {
      return x.map (function (elem) { return ChoiceService.swapTextRoles(elem) })
    } else if (typeof(x) == 'object') {
      var swapped = {}
      Object.keys(x).forEach (function (key) {
	if (typeof(x[key]) == 'object' || key == 'text')
	  swapped[key] = ChoiceService.swapTextRoles(x[key])
	else
	  swapped[key] = x[key]
      })
      return swapped
    }
    return x.replace(/\$player1/g,"$TMP_PLAYER1")  // placeholder
      .replace(/\$player2/g,"$player1")
      .replace(/\$TMP_PLAYER1/g,"$player2")
  }

};
