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

    choice: {
      type: 'string'
    },

    targetable: {
      type: 'boolean',  // if true, client should not select opponent
      defaultsTo: true
    },
    
    opponent: {
      type: 'json'  // name of opponent, or list of names. Should be bot names
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

    hide: {
      type: 'boolean'   // if true, hide the event while waiting for other player's move
    },

    launch: {
      type: 'boolean'   // if true, then for chat games, do not wait for player 2 to accept
    },
    
    timeout: {
      type: 'integer',
      defaultsTo: 60
    },

    resetAllowed: {
      type: 'boolean',
      defaultsTo: true
    },

    resetWait: {
      type: 'integer',
      defaultsTo: 30  // resets 30 seconds after game exited
    },

    botDefaultAllowed: {
      type: 'boolean',
      defaultsTo: true
    },

    botDefaultWait: {
      type: 'integer',
      defaultsTo: 30  // defaults to bot opponent after 30 seconds
    },

    statusMeters: {
      type: 'json',
      defaultsTo: []
    },

    statusAwards: {
      type: 'json',
      defaultsTo: []
    },

    statusItems: {
      type: 'json',
      defaultsTo: []
    },
    
  },

  botDefaultTime: function (event, inviteTime) {
    return event.botDefaultAllowed
      ? new Date (inviteTime + 1000*event.botDefaultWait)
      : undefined
  },

  getChatEvents: function() {
    return Location.getChatLocation()
      .populate('events')
      .then (function (chatLocation) {
        return chatLocation && chatLocation.events
      })
  }
};

