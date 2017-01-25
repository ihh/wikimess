/**
 * MeterController
 *
 * @description :: Server-side logic for managing meters
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {
  create: function (req, res) {
    if (SchemaService.validateMeter (req.body, res.badRequest.bind(res)))
      Meter.create (req.body)
      .then (res.send.bind(res))
      .catch (res.badRequest.bind(res))
  }
	
};

