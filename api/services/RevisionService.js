// api/services/RevisionService.js

var JsDiff = require('diff')

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
    return JsDiff.diffChars (SymbolService.makeSymText (oldRevision), SymbolService.makeSymText (newRevision))
  },

  findLatestRevision: function (symbolID) {
    return Revision.find ({ symbol: symbolID })
      .sort ('number DESC')
      .limit (1)
      .then (function (latestRevisions) {
        if (latestRevisions && latestRevisions.length)
          return latestRevisions[0]
        return null
      })
  }
};
