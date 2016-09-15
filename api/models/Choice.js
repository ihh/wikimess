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

      name: {
          type: 'string',
          unique: true
      },

      parent: {
          type: 'string'  // for anonymously-declared Choices, the parent creator Choice
      },

      scene: {
          type: 'string'
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
      
      intro: { type: 'string' },
      intro2: { type: 'string' },

      autoexpand: {
	  type: 'boolean',
	  defaultsTo: false
      },

      verb: {
          type: 'string',
          defaultsTo: 'choose'
      },
      verb2: { type: 'string' },
      
      hintc: {
          type: 'string',
          defaultsTo: 'OK'  // Co-operate
      },
      hintc2: { type: 'string' },

      hintd: {
          type: 'string',
          defaultsTo: 'Nope'  // Defect
      },
      hintd2: { type: 'string' },

      timeout: {
          type: 'integer',
	  defaultsTo: 60
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

