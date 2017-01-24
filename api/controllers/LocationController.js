/**
 * LocationController
 *
 * @description :: Server-side logic for managing Locations
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {
  // override blueprint for create, to allow inline specification of events, choices, and nested locations
  create: function (req, res) {
    LocationService.createLocation (req.body,
				    res.send.bind(res),
                                    res.badRequest.bind(res))
  }
};

