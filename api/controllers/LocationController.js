/**
 * LocationController
 *
 * @description :: Server-side logic for managing Locations
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {
  // override blueprint for create, to allow validation
  create: function (req, res) {
    if (SchemaService.validateLocation (req.body, res.badRequest)) {
      Location
        .findOrCreate ({ name: req.body.name }, req.body)
        .exec (function (err, location) {
          if (err)
            res.badRequest (err)
          else
            res.json (location)
        })
    }
  }
};

