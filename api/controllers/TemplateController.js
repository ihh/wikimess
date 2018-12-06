/**
 * TemplateController
 *
 * @description :: Server-side logic for managing Templates
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

  // override blueprint for create, to allow inline specification of reply chains
  create: function (req, res) {
    function addFooter (template) {
      template.content.push (TemplateService.standardFooter)
      template.replies.forEach (addFooter)
    }
    (_.isArray(req.body) ? req.body : [req.body]).forEach (addFooter)

    return TemplateService.createTemplates (req.body, true)
      .then (function (templates) {
        res.send (templates)
      }).catch (function (err) {
	console.warn(err)
        res.status(500).send ({ message: err })
      })
  }

};

