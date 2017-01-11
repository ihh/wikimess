/**
 * Game.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

var extend = require('extend')

module.exports = {

  attributes: {
    id: {
      type: 'integer',
      autoIncrement: true,
      unique: true,
      primaryKey: true
    },

    player1: {
      model: 'player'
    },

    player2: {
      model: 'player'
    },

    event: {
      model: 'event',
    },

    // current state of the game
    finished: {
      type: 'boolean',
      defaultsTo: false
    },

    current: {
      model: 'choice'
    },

    future: {
      type: 'array',
      defaultsTo: []
    },

    moves: {  // number of COMPLETED moves. The index of the moves themselves start at 1
      type: 'integer',
      defaultsTo: 0
    },

    missed1: {
      type: 'integer',
      defaultsTo: 0
    },

    missed2: {
      type: 'integer',
      defaultsTo: 0
    },

    currentStartTime: {
      type: 'date',
      defaultsTo: function() { return new Date() }
    },

    // player choices
    move1: {
      type: 'json',
      defaultsTo: {}
    },

    move2: {
      type: 'json',
      defaultsTo: {}
    },

    quit1: {
      type: 'boolean',
      defaultsTo: false
    },

    quit2: {
      type: 'boolean',
      defaultsTo: false
    },

    // player state specific to this game
    mood1: {
      type: 'string',
      enum: ['happy', 'sad', 'angry', 'surprised'],
      defaultsTo: 'happy'
    },

    mood2: {
      type: 'string',
      enum: ['happy', 'sad', 'angry', 'surprised'],
      defaultsTo: 'happy'
    },

    local1: {
      type: 'json',
      defaultsTo: {}
    },

    local2: {
      type: 'json',
      defaultsTo: {}
    },

    text1: {
      type: 'json'
    },

    text2: {
      type: 'json'
    },
    
    // state specific to this game, common to both players
    common: {
      type: 'json',
      defaultsTo: {}
    },
  },

  isWaitingForMove: function (game, role) {
    return (role == 1 ? game.move1 : game.move2) === null
  },

  runningTime: function (game) {
    var now = new Date(), created = new Date(game.createdAt)
    return parseInt ((now - created) / 1000)
  },

  dormantTime: function (game) {
    var now = new Date(), updated = new Date(game.updatedAt)
    return parseInt ((now - updated) / 1000)
  },

  deadline: function (game) {
    var deadline
    if (!game.finished && game.current && game.current.timeout)
      deadline = new Date (game.currentStartTime.getTime() + 1000*game.current.timeout)
    return deadline
  },

  resetTime: function (game, event) {
    var reset
    if (game.finished)
      reset = new Date (game.currentStartTime.getTime() + 1000*event.reset)
    return reset
  },
  
  isTimedOut: function (game) {
    return game.current
      && game.current.timeout
      && game.currentStartTime
      && ((Date.now() - Date.parse(game.currentStartTime)) / 1000) >= game.current.timeout
  },

  timedOutRoles: function (game) {
    var w1 = game.move1 === null, w2 = game.move2 === null
    return Game.isTimedOut(game)
      ? (w1 ? (w2 ? [1,2] : [1]) : (w2 ? [2] : []))
    : []
  },
  
  getRole: function (game, playerID) {
    var player1id = typeof(game.player1) === 'object' ? game.player1.id : game.player1
    var player2id = typeof(game.player2) === 'object' ? game.player2.id : game.player2
    return playerID == player1id ? 1 : (playerID == player2id ? 2 : null)
  },

  otherRole: function(role) {
    return role == 1 ? 2 : 1
  },

  roleAttr: function (role, key) {
    return key + role
  },

  otherRoleAttr: function (role, key) {
    return key + Game.otherRole(role)
  },

  getRoleAttr: function (obj, role, key) {
    return obj[key + role]
  },

  getOtherRoleAttr: function (obj, role, key) {
    return obj[key + Game.otherRole(role)]
  },
};

