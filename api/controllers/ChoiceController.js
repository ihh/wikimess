/**
 * ChoiceController
 *
 * @description :: Server-side logic for managing choices
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

  // override blueprint for create, to allow inline specification of outcomes and nested choices
  create: function (req, res) {
    ChoiceService.createChoice (req.body,
				res.send.bind(res),
				res.badRequest.bind(res))
  }
};

