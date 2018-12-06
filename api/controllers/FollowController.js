/**
 * FollowController
 *
 * @description :: Server-side logic for managing Follows
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {
  create: function (req, res) {
    var followInitializers = _.isArray(req.body) ? req.body : [req.body]
    return Follow.createEach (followInitializers)
      .then (function (follows) {
        res.json (follows)
      }).catch (function (err) {
        res.status(500).send ({ message: err })
      })
  }
};

