/**
 * Award.js
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
          required: true,
          unique: true,
      },
      init: { type: 'json' },
      icon: { type: 'string' },  // if absent, Award will be invisible
      color: { type: 'string' },
      label: { type: 'string' },
      public: { type: 'boolean' }
  },

    // in-memory index
    awards: [],

    // startup method to create in-memory index (called from config/bootstrap.js)
    createIndex: function (callback) {
        Award.find({}).exec (function (err, awards) {
            if (err) throw err
            else {
                awards.forEach (function (award) {
                    Award.updateIndex (award)
                })
                callback()
            }
        })
    },

    // method to update in-memory index
    updateIndex: function (award) {
        Award.awards.push (award)
    },

    // lifecycle callback to update in-memory index when new Awards are added
    afterCreate: function (award, callback) {
        Award.updateIndex(award)
        callback()
    },

};

