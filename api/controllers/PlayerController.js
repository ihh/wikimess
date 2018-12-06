/**
 * PlayerController
 *
 * @description :: Server-side logic for managing players
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var extend = require('extend')

module.exports = {
  create: function (req, res) {
    var playerInitializers = _.isArray(req.body) ? req.body : [req.body]
    return Player.createEach (playerInitializers)
      .then (function (players) {
        res.json (players)
      }).catch (function (err) {
        res.status(500).send ({ message: err })
      })
  }
};
