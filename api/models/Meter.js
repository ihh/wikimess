/**
 * Meter.js
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
      min: { type: 'float', defaultsTo: 0 },
      max: { type: 'float', defaultsTo: 1 },
      public: { type: 'boolean', defaultsTo: true },
      label: { type: 'string' },
  },

    // in-memory index
    meters: [],

    // startup method to create in-memory index (called from config/bootstrap.js)
    createIndex: function (callback) {
        Meter.find({}).exec (function (err, meters) {
            if (err) throw err
            else {
                meters.forEach (function (meter) {
                    Meter.updateIndex (meter)
                })
                callback()
            }
        })
    },

    // method to update in-memory index
    updateIndex: function (meter) {
        Meter.meters.push (meter)
    },

    // lifecycle callback to update in-memory index when new Meters are added
    afterCreate: function (meter, callback) {
        Meter.updateIndex(meter)
        callback()
    },
};

