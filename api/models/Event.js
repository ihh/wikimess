/**
 * Event.js
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

    location: {
      model: 'location'
    },

    ready: {
      type: 'string'
    },

    set: {
      type: 'string'
    },

    go: {
      type: 'string'
    },

    pitch: {
      type: 'string'
    },

    choice: {
      type: 'string'
    },

    opponent: {
      type: 'string'  // name of opponent, or list of names. Typically a bot name. Overrides 'wantHuman'
    },

    visible: {
      type: 'string'  // should eval to something truthy if visible
    },

    locked: {
      type: 'string'  // should eval to a (truthy) string explaining how player can unlock
    },

    cost: {
      type: 'json',
      defaultsTo: {}
    },

    required: {
      type: 'json',
      defaultsTo: {}
    },

    compatibility: {
      type: 'string'   // should eval to positive real value probabilistically weighting chance of player/opponent match
      // NB this eval is NOT tested inside the lock (it'd be too CPU-intensive, since it's run on all compatible players)
      // So don't make it too critical to game consistency logic
    },

    role1weight: {
      type: 'string'   // should eval to positive real value probabilistically weighting chance of player being in role 1
    },
    
    timeout: {
      type: 'integer',
      defaultsTo: 60
    },

    resetAllowed: {
      type: 'boolean',
      defaultsTo: true
    },

    reset: {
      type: 'integer',
      defaultsTo: 30  // resets 30 seconds after game exited
    },

    wait: {
      type: 'integer',
      defaultsTo: 30  // open to bots after 30 seconds
    },

  }
};

