/**
 * Outcome.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {

  attributes: {
      id: {
          type: 'integer',
          autoIncrement: true,
          unique: true,
          primaryKey: true
      },

      choice: {
          model: 'choice'
      },

      move1: {
          type: 'string',
          enum: ['c', 'd']
      },

      move2: {
          type: 'string',
          enum: ['c', 'd']
      },

      weight: {
          type: 'string',
          defaultsTo: '1'
      },

      outro: { type: 'string' },  // if empty, will be skipped by client
      outro2: { type: 'string' },

      // game & player state updates
      common: { type: 'json' },
      local1: { type: 'json' },
      local2: { type: 'json' },
      global1: { type: 'json' },
      global2: { type: 'json' },

      mood1: {
          type: 'string',
          enum: ['happy', 'sad', 'angry', 'surprised', 'unchanged', 'auto'],
	  defaultsTo: 'auto'
      },

      mood2: {
          type: 'string',
          enum: ['happy', 'sad', 'angry', 'surprised', 'unchanged', 'auto'],
	  defaultsTo: 'auto'
      },
      
      // the RHS of the CFG rule
      next: {
          type: 'array',
          defaultsTo: []  // names of queued-up choices
      },

      flush: {
          type: 'boolean',
          defaultsTo: false  // if true, flush stack before pushing next
      }
  },

    mood: function (oldMood, newMood, move1, move2) {
        if (newMood == 'unchanged')
            return oldMood
        else if (newMood && newMood != 'auto')
            return newMood
	else if (move1 && move2 && move1 != 'none' && move2 != 'none') {
            var move12 = move1 + move2
            switch (move12) {
            case 'cc': return 'happy'
            case 'cd': return 'angry'
            case 'dc': return 'surprised'
            case 'dd': return 'sad'
            default: break
            }
	}
        return oldMood
    },

    mood1: function (game, outcome) {
        return Outcome.mood (game.mood1, outcome.mood1, outcome.move1, outcome.move2)
    },

    mood2: function (game, outcome) {
        return Outcome.mood (game.mood2, outcome.mood2, outcome.move2, outcome.move1)
    },

    outcomeVerb: function (outcome, role) {
	var verb = outcome.verb
	if (!verb) {
	    var type
            if (role == 1)
		type = outcome.move1 + outcome.move2
	    else
		type = outcome.move2 + outcome.move1
            switch (type) {
            case 'cc': verb = 'reward'; break;
            case 'cd': verb = 'sucker'; break;
            case 'dc': verb = 'cheat'; break;
            case 'dd': verb = 'punish'; break;
            default: verb = undefined; break;
            }
	}
	return typeof(verb) == 'undefined' ? '' : ('<outcome:' + verb + '>')
    },
};

