// api/services/TemplateService.js
var _ = require('lodash')
var Promise = require('bluebird')
var parseTree = require('bracery').ParseTree

module.exports = {

  suggestTemplates: function (config) {
    config = config || {}
    var result = {}
    var nSuggestions = config.nSuggestions || 5
    var query = { isRoot: true,
                  isPublic: true }
    if (config.author)
      query.author = config.author
    return Template.find (query)
      .populate ('author')
      .then (function (templates) {
        return SortService.partialSort
        (templates, nSuggestions, function (a, b) { return b.weight - a.weight })
          .map (function (template) {
            return { id: template.id,
                     author: (template.author
                              ? { id: template.author.id,
                                  name: template.author.name,
                                  displayName: template.author.displayName }
                              : undefined),
                     title: template.title || parseTree.summarizeRhs (template.content,
                                                                      function (sym) { return Symbol.cache.byId[sym.id].name }),
		     tweeter: template.author ? template.author.twitterScreenName : null,
		     avatar: template.author ? template.author.avatar : null,
                     tags: template.tags,
                     previousTags: template.previousTags }
          })
      })
  },

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
      .then (function (player) { config.author = player ? player.id : null })
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
  },
}
