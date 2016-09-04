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

      outcomes: {
          collection: 'outcome',
          via: 'choice',
          dominant: true
      }
  },

    moveOutcomes: function (info, cb) {
        Outcome
            .find ({ choice: info.choice,
                     move1: info.move1,
                     move2: info.move2 })
            .exec (function (err, outcomes) {
                if (err)
                    cb (err)
                else
                    cb (null, outcomes)
            })
    },

    randomOutcome: function (info, cb) {
        this.moveOutcomes (info, function (err, outcomes) {
            if (err) {
                cb (err)
                return
            }
            var totalWeight = outcomes.reduce (function (total, outcome) {
                return total + outcome.weight
            }, 0)
            if (totalWeight) {
                var w = totalWeight * Math.random()
                for (var i = 0; i < outcomes.length; ++i)
                    if ((w -= outcomes[i].weight) <= 0) {
                        cb (null, outcomes[i])
                        return
                    }
            }
            cb (null, null)
            return
        })
    }

};

