/**
 * Choice.js
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

      intro: { type: 'string' },
      verb: {
          type: 'string',
          defaultsTo: 'choose'
      },

      hintc: {
          type: 'string',
          defaultsTo: 'Co-operate'
      },

      hintd: {
          type: 'string',
          defaultsTo: 'Defect'
      },

      outcomes: {
          collection: 'outcome',
          via: 'choices',
          dominant: true
      }
      
  }
};

