// api/services/ChoiceService.js
var extend = require('extend');
var Promise = require('bluebird')

module.exports = {

  nodeCreateChoice: function (config, nodeStyleCallback) {
    return ChoiceService.createChoice (config,
				       function (result) { nodeStyleCallback(null,result) },
				       function (err) { nodeStyleCallback(err) })
  },

  bluebirdCreateChoice: function (config) {
    return Promise.promisify (ChoiceService.nodeCreateChoice) (config)
  },

  createChoice: function (config, successCallback, errorCallback) {
    //        console.log ('createChoice')
    //        console.log (config)

    // validate against schema
    if (!SchemaService.validateChoice (config, errorCallback))
      return

    // keys for Choices and Outcomes
    var asymKeys = ['local', 'global', 'mood', 'role']

    function makeText (text) {
      if (typeof(text) === 'undefined')
	return undefined
      else if (typeof(text) === 'string')
	return { text: text }
      else if (GameService.isArray(text)) {
	if (text.length === 1)
	  return text[0]
	else
	  return { sequence: text }
      }
      text.left = makeText (text.left)
      text.right = makeText (text.right)
      text.next = makeText (text.next)
      if (text.menu)
	text.menu = makeTextList (text.menu)
      if (text.sequence)
	text.sequence = makeTextList (text.sequence)
      if (text.sample1)
	text.sample1.opts = makeTextList (text.sample1.opts)
      if (text['switch'])
	text['switch'] = text['switch'].map (function (case_opt) {
	  if (case_opt['default']) case_opt['default'] = makeText(case_opt['default'])
	  if (case_opt['case']) case_opt['case'] = makeText(case_opt['case'])
	  return case_opt
	})
      return text
    }

    function makeTextList (list) {
      if (GameService.isArray(list))
	return list.map (makeText)
      if (list.sample)
	list.sample.groups = list.sample.groups.map (function (group) {
	  group.opts = group.opts.map (function (opt) {
	    if (opt.option) { opt.option = makeText(opt.option); return opt }
	    return makeText(opt)
	  })
	})
      return list
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
    var symOutcomeKeys = ['weight', 'flush', 'common']
    
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
          if (out.outro1) {
            out.outro = out.outro1
            if (!out.outro2)
              out.outro2 = {}
            delete oc.outro1
          }
	  out.outro = makeText (out.outro)
	  out.outro1 = makeText (out.outro1)
	  out.outro2 = makeText (out.outro2)
	  expandHints (out, 'outro')
          if (out.next) {
            if (!GameService.isArray(out.next))
              out.next = [out.next]
            out.next = out.next.map (function (next) {
              if (typeof(next) === 'object') {
                var count = nestedChoices.length + 1
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

    function flip (outcome) {
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
      if (outcome.next)
        flipped.next = outcome.next.map (GameService.flipTilde)
      return flipped
    }

    var add = function (outcome) { addOutcome (outcome.move1, outcome.move2, outcome) }

    var add_wild = function (outcome) { addOutcome (null, null, outcome) }

    var add_ll = function (outcome) { addOutcome ('l', 'l', outcome) }
    var add_lr = function (outcome) { addOutcome ('l', 'r', outcome) }
    var add_rl = function (outcome) { addOutcome ('r', 'l', outcome) }
    var add_rr = function (outcome) { addOutcome ('r', 'r', outcome) }

    var add_flipped_rl = function (outcome) { addOutcome ('r', 'l', flip (outcome)) }
    var add_flipped_lr = function (outcome) { addOutcome ('l', 'r', flip (outcome)) }
    var add_auto = function (outcome) { addOutcome (undefined, undefined, outcome); config.autoExpand = true }

    var add_nonexclusive = function (outcome) { outcome.exclusive = false; addOutcome (undefined, undefined, outcome) }

    addOutcomes ('ll', [add_ll])
    addOutcomes ('lr', [add_lr])
    addOutcomes ('rl', [add_rl])
    addOutcomes ('rr', [add_rr])

    addOutcomes ('any', [add_wild])

    addOutcomes ('rl2', [add_rl, add_flipped_lr])
    addOutcomes ('lr2', [add_lr, add_flipped_rl])

    addOutcomes ('auto', [add_auto])

    addOutcomes ('outcome', [add])
    addOutcomes ('effect', [add_nonexclusive])

    Object.keys(config).forEach (function (key) {
      if (outcomeAdder[key])
	outcomeAdder[key].call()
    })

    if (outcomes.length == 0 && !config.hasOwnProperty('autoExpand'))
      config.autoExpand = true
    
    expandAliases (config)
    if (config.intro1) {
      config.intro = config.intro1
      if (!config.intro2)
        config.intro2 = {}
      delete config.intro1
    }
    config.intro = makeText (config.intro)
    config.intro1 = makeText (config.intro1)
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
  
  createChoiceWithOutcomes: function (config, outcomes, successCallback, errorCallback) {
    //        console.log ('createChoiceWithOutcomes')
    //        console.log (config)
    //        console.log (outcomes)

    if (config.name.charAt(0) === '~') {
      errorCallback ("A Choice name cannot begin with ~")
      return
    }
    
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
  },

  swapTextRoles: function (x) {
    if (GameService.isArray(x)) {
      return x.map (function (elem) { return ChoiceService.swapTextRoles(elem) })
    } else if (typeof(x) == 'object') {
      var swapped = {}
      Object.keys(x).forEach (function (key) {
        var newKey = key.replace(/^(.*)([12])$/, function(_m,k,r) { return k + (parseInt(r) ^ 3) })  // swap role1/role2, and any other keys ending in 1 & 2
	if (typeof(x[key]) == 'object' || key == 'text')
	  swapped[newKey] = ChoiceService.swapTextRoles(x[key])
        else 
	  swapped[newKey] = x[key]
      })
      return swapped
    }
    return x
      .replace (/\$([a-z]+)([12])/g,
		function (_match, varName, role) {
		  return '$' + varName + (parseInt(role) ^ 3)
		})
      .replace(/<mood([12]):(happy|sad|angry|surprised)>/g, function (match, role, mood) {
	return '<mood' + (parseInt(role) ^ 3) + ':' + mood + '>'
      })
      .replace(/<(\/?)(happy|sad|angry|surprised|say)([12])>/g, function (match, slash, mood, role) {
        return '<' + slash + mood + (parseInt(role) ^ 3) + '>'
      })
  }

};
