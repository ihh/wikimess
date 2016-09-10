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

      root: {
          type: 'boolean',
          defaultsTo: false
      },

      intro: { type: 'string' },
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
        var query = Outcome.find ({ choice: info.choice })
	if (info.move1)
	    query.where ({ move1: info.move1 })
	if (info.move2)
	    query.where ({ move2: info.move2 })
        query.exec (function (err, outcomes) {
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

