/**
 * PlayerController
 *
 * @description :: Server-side logic for managing players
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {
  create: function (req, res) {
    if (SchemaService.validatePlayer (req.body, res.badRequest.bind(res)))
      Player.create (req.body)
      .then (res.send.bind(res))
      .catch (res.badRequest.bind(res))
  }
	
};
