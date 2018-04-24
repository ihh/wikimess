// api/services/TemplateService.js
var _ = require('lodash')
var Promise = require('bluebird')

module.exports = {
  
  createTemplates: function (config) {
    // validate against schema
    SchemaService.validateTemplate (config, function (err) {
      console.warn ('error validating '+JSON.stringify(config))
      throw err
    })

    return (_.isArray(config)
            ? (Promise.map (config, TemplateService.createTemplate)
               .then (function (templateLists) {
                 return [].concat.apply ([], templateLists)
               }))
            : TemplateService.createTemplate (config))
  },

  createTemplate: function (config) {
    var replies = config.replies || []
    delete config.replies
    
    var authorPromise
    if (typeof(config.author) === 'string')
      authorPromise = Player.findOne ({ name: config.author })
      .then (function (player) { config.author = player.id })
    else
      authorPromise = Promise.resolve()

    return authorPromise
      .then (function() {
        return Template.create (config)
      }).then (function (template) {
        if (!template)
          throw new Error ('error creating Template from ' + JSON.stringify(config))
        return Promise.map (replies, function (reply) {
          return TemplateService.createTemplate (_.extend (reply,
                                                           { isRoot: false,
                                                             previous: template.id }))
        }).then (function (replyTemplates) {
          return [].concat.apply ([template], replyTemplates)
        })
      })
  }
}
