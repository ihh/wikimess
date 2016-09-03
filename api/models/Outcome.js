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
          defaultsTo: []  // names of queued-up choices (the RHS of the CFG rule)
      }
  }
};

