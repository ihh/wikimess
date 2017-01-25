/**
 * ItemController
 *
 * @description :: Server-side logic for managing items
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {
  create: function (req, res) {
    if (SchemaService.validateItem (req.body, res.badRequest.bind(res)))
      Item.create (req.body)
      .then (res.send.bind(res))
      .catch (res.badRequest.bind(res))
  }
};

