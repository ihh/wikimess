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
          defaultsTo: '*'
      },

      move2: {
          type: 'string',
          defaultsTo: '*'
      },

      weight: {
          type: 'string',
          defaultsTo: '1'
      },

      exclusive: {
	  type: 'boolean',
	  defaultsTo: true
      },

      outro: { type: 'json' },
      outro2: { type: 'json' },

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

      verb1: { type: 'string' },
      verb2: { type: 'string' },
      
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
	else if (move1 != '' && move2 != '') {
            var move12 = move1 + move2
            switch (move12) {
            case 'rr': case 'yy': return 'happy'
            case 'rl': case 'yn': return 'angry'
            case 'lr': case 'ny': return 'surprised'
            case 'rr': case 'nn': return 'sad'
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

    outcomeVerb: function (game, outcome, role) {
	var verb = role == 1 ? outcome.verb1 : outcome.verb2
	if (!verb) {
	    var type
            if (role == 1)
		type = game.move1 + game.move2
	    else
		type = game.move2 + game.move1
            switch (type) {
            case 'rr': case 'yy': verb = 'reward'; break;
            case 'rl': case 'yn': verb = 'sucker'; break;
            case 'lr': case 'ny': verb = 'cheat'; break;
            case 'll': case 'nn': verb = 'punish'; break;
            default: verb = undefined; break;
            }
	}
	return verb ? ('<outcome:' + verb + '>') : ''
    },
};

