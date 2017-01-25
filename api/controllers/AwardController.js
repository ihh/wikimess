/**
 * AwardController
 *
 * @description :: Server-side logic for managing awards
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {
  create: function (req, res) {
    if (SchemaService.validateAward (req.body, res.badRequest.bind(res)))
      Award.create (req.body)
      .then (res.send.bind(res))
      .catch (res.badRequest.bind(res))
  }

};

