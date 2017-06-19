/**
 * Choice.js
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

    grammar: {
      model: 'grammar'
    },

    name: {
      type: 'string',
      unique: true
    },

    hide: {
      type: 'boolean'   // if true, hide the event when waiting for other player's move
    },
    
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
    
    intro: { type: 'json' },
    intro1: { type: 'json' },
    intro2: { type: 'json' },
    
    timeout: {
      type: 'integer',
    },

    autoExpand: {
      type: 'boolean',
      defaultsTo: false
    },
    
    outcomes: {
      collection: 'outcome',
      via: 'choice',
      dominant: true
    }
  },

  mood1: function (game, choice) {
    return (choice.mood1 && choice.mood1 != 'unchanged') ? choice.mood1 : game.mood1
  },

  mood2: function (game, choice) {
    return (choice.mood2 && choice.mood2 != 'unchanged') ? choice.mood2 : game.mood2
  },
};

