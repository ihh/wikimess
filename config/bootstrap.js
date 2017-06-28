/**
 * Bootstrap
 * (sails.config.bootstrap)
 *
 * An asynchronous bootstrap function that runs before your Sails app gets lifted.
 * This gives you an opportunity to set up your data model, run jobs, or perform some special logic.
 *
 * For more information on bootstrapping your app, check out:
 * http://sailsjs.org/#!/documentation/reference/sails.config/sails.config.bootstrap.html
 */

module.exports.bootstrap = function (callback) {

  // initialize admin Player
  Player.initAdmin()
    .then (function (admin) {
      // initialize Symbol cache & autonaming
      return Symbol.initCache()
    }).then (function () {
      // initialize Adjacency cache
      return Adjacency.initCache()
    }).then (function() {
      callback()
    }).catch (function (err) {
      throw (err)
    })

};
