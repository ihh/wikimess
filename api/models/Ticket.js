/**
 * Ticket.js
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

    title: {
      type: 'string'
    },

    hint: {
      type: 'string'
    },

    visible: {
      type: 'string'
    },

    requires: {
      type: 'object'
    },

    role: {
      type: 'integer'
    },

    event: {
      model: 'event'
    },

    location: {
      model: 'location',
      required: true
    }
  },

  // lifecycle callback to look up Events by name
  beforeCreate: function (ticket, callback) {
    if (ticket.name)
      Event.find ({ name: ticket.name })
      .then (function (events) {
	if (events.length) {
	  ticket.event = events[0].id
	  delete ticket.name
	}
	callback()
      })
    else
      callback()
  },

};

