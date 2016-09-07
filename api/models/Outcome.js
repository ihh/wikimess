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
          type: 'float',
          defaultsTo: 1
      },

      outro: { type: 'string', required: true },
      outro2: { type: 'string' },

      // game state updates
      cash1: {
          type: 'integer',
          defaultsTo: 0
      },

      cash2: {
          type: 'integer',
          defaultsTo: 0
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

    mood: function (move1, move2) {
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

    mood1: function (outcome) {
        return this.mood (outcome.move1, outcome.move2)
    },

    mood2: function (outcome) {
        return this.mood (outcome.move2, outcome.move1)
    },

    forRole: function (game, outcome, role) {
        var outro, cash, self, other, selfMood, otherMood, verb, type
        if (role == 1) {
            outro = outcome.outro
            cash = outcome.cash1
            self = game.player1
            other = game.player2
            selfMood = this.mood1(outcome)
            otherMood = this.mood2(outcome)
            verb = outcome.verb
            type = outcome.move1 + outcome.move2
        } else {  // role == 2
            outro = outcome.outro2 || outcome.outro
            cash = outcome.cash2
            self = game.player2
            other = game.player1
            selfMood = this.mood2(outcome)
            otherMood = this.mood1(outcome)
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
        outro = Game.expandText (outro, [game.player1.name, game.player2.name], role)
        return { outro: outro,
                 verb: verb,
                 self: { mood: selfMood, reward: cash },
                 other: { id: other.id, name: other.name, mood: otherMood } }
    },
};

