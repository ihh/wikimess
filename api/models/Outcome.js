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

      // game state updates
      local1: {
          type: 'json',
          defaultsTo: {}
      },

      local2: {
          type: 'json',
          defaultsTo: {}
      },

      global1: {
          type: 'json',
          defaultsTo: {}
      },

      global2: {
          type: 'json',
          defaultsTo: {}
      },

      mood1: {
          type: 'string',
          enum: ['happy', 'sad', 'angry', 'surprised', 'unchanged']
      },

      mood2: {
          type: 'string',
          enum: ['happy', 'sad', 'angry', 'surprised', 'unchanged']
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
        else if (newMood)
            return newMood
        var move12 = move1 + move2
        switch (move12) {
        case 'cc': return 'happy'
        case 'cd': return 'angry'
        case 'dc': return 'surprised'
        case 'dd': return 'sad'
        default: break
        }
        return null
    },

    mood1: function (game, outcome) {
        return Outcome.mood (game.mood1, outcome.mood1, outcome.move1, outcome.move2)
    },

    mood2: function (game, outcome) {
        return Outcome.mood (game.mood2, outcome.mood2, outcome.move2, outcome.move1)
    },

    forRole: function (game, outcome, role) {
        var outro, self, other, selfMood, otherMood, verb, type
        if (role == 1) {
            outro = outcome.outro
            self = game.player1
            other = game.player2
            selfMood = Outcome.mood1(game,outcome)
            otherMood = Outcome.mood2(game,outcome)
            verb = outcome.verb
            type = outcome.move1 + outcome.move2
        } else {  // role == 2
            outro = outcome.outro2 || outcome.outro
            self = game.player2
            other = game.player1
            selfMood = Outcome.mood2(game,outcome)
            otherMood = Outcome.mood1(game,outcome)
            verb = outcome.verb2
            type = outcome.move2 + outcome.move1
        }
        if (!verb) {
            switch (type) {
            case 'cc': verb = 'reward'; break;
            case 'cd': verb = 'sucker'; break;
            case 'dc': verb = 'cheat'; break;
            case 'dd': verb = 'punish'; break;
            default: verb = undefined; break;
            }
        }
	if (outro)
            outro = GameService.expandText (outro, [game.player1.name, game.player2.name], role)
        return { outro: outro,
                 verb: verb,
                 self: { mood: selfMood },
                 other: { id: other.id, name: other.name, mood: otherMood } }
    },
};

