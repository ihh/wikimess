// api/services/RevisionService.js

var JsDiff = require('diff')

var parseTree = require('bracery').ParseTree
var nlp = require('../../assets/js/ext/compromise.min.js')

module.exports = {
  makeRevisionSummary: function (revision, playerName) {
    var summary = { id: revision.id,
                    number: revision.number,
                    authored: revision.authored,
                    date: revision.createdAt }
    if (revision.authored) {
      summary.author = { id: revision.author }
      if (playerName)
        summary.author.name = playerName[revision.author]
    }
    return summary
  },

  makeRevisionInfo: function (revision) {
    return { id: revision.id,
             number: revision.number,
             author: revision.author,
             authored: revision.authored,
             date: revision.createdAt,
             rules: revision.rules }
  },

  makeDiff: function (oldRevision, newRevision) {
    return JsDiff.diffChars (RevisionService.makeRevText (oldRevision),
                             RevisionService.makeRevText (newRevision))
  },

  findLatestRevision: function (symbolID) {
    return Symbol.findOneCached ({ id: symbolID })
      .then (function (symbol) {
        if (symbol.latestRevision)
          return Revision.findOne ({ id: symbol.latestRevision })
        return null
      })
  },

  makeRevText: function (revision) {
    return '>' + revision.name + '\n'
      + revision.rules.map (function (rhs) {
        return parseTree.makeRhsText (rhs, function (rhsSym) {
          return Symbol.cache.byId[rhsSym.id].name
        }).replace(/\n/g,function(){return"\\n"})
          + '\n'
      }).join('')
  }
};
