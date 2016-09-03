/**
 * Outcome.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {

  attributes: {
      id: {
          type: 'string',
          unique: true,
          primaryKey: true
      },

      choices: {
          collection: 'choice',
          via: 'outcomes'
      },

      move12: {
          type: 'string',
          enum: ['cc', 'cd', 'dc', 'dd']
      },
      
      weight: {
          type: 'float',
          defaultsTo: 1
      },

      outro: { type: 'string' },

      // game state updates
      cash1: {
          type: 'integer',
          defaultsTo: 0
      },

      cash2: {
          type: 'integer',
          defaultsTo: 0
      },

      next: {
          type: 'array',
          defaultsTo: []
      }
  }
};

