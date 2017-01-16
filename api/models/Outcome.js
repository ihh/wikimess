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
      defaultsTo: null
    },

    move2: {
      type: 'string',
      defaultsTo: null
    },

    weight: {
      type: 'string',
      defaultsTo: '1'
    },

    exclusive: {
      type: 'boolean',
      defaultsTo: true
    },

    outro: { model: 'text' },
    outro2: { model: 'text' },

    // game & player state updates
    common: { type: 'json' },
    local1: { type: 'json' },
    local2: { type: 'json' },
    global1: { type: 'json' },
    global2: { type: 'json' },

    mood1: {
      type: 'string',
      enum: ['happy', 'sad', 'angry', 'surprised', 'unchanged'],
      defaultsTo: 'unchanged'
    },

    mood2: {
      type: 'string',
      enum: ['happy', 'sad', 'angry', 'surprised', 'unchanged'],
      defaultsTo: 'unchanged'
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
    //        console.log ('oldMood='+oldMood+' newMood='+newMood+' move1='+move1+' move2='+move2)
    if (newMood === 'unchanged')
      return oldMood
    return newMood
  },

  mood1: function (game, outcome) {
    return Outcome.mood (game.mood1, outcome.mood1, game.move1, game.move2)
  },

  mood2: function (game, outcome) {
    return Outcome.mood (game.mood2, outcome.mood2, game.move2, game.move1)
  },

  outcomeVerb: function (game, outcome, role) {
    var verb = role == 1 ? outcome.verb1 : outcome.verb2
    return verb ? ('<outcome:' + verb + '>') : ''
  },
};

