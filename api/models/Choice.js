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

      root: {
          type: 'boolean',
          defaultsTo: false
      },

      intro: { type: 'string', required: true },
      intro2: { type: 'string' },

      verb: {
          type: 'string',
          defaultsTo: 'choose'
      },
      verb2: { type: 'string' },
      
      hintc: {
          type: 'string',
          defaultsTo: 'Co-operate'
      },
      hintc2: { type: 'string' },

      hintd: {
          type: 'string',
          defaultsTo: 'Defect'
      },
      hintd2: { type: 'string' },

      allOutcomes: {
          collection: 'outcome',
          via: 'choice',
          dominant: true
      }
  },

    moveOutcomes: function (opts, cb) {
        Choice
            .find ({ choice: opts.choice,
                     move1: opts.move1,
                     move2: opts.move2 })
            .exec (function (err, choices) {
                if (err)
                    cb (err)
                else
                    cb (null, choices)
            })
    }
};

