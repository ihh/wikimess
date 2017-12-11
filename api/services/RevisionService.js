// api/services/RevisionService.js

var JsDiff = require('diff')

module.exports = {
  makeRevisionInfo: function (revision) {
    return { id: revision.id,
             author: revision.author,
             authored: revision.authored,
             date: revision.createdAt,
             rules: revision.rules }
  },

  makeDiff: function (oldRevision, newRevision) {
    return JsDiff.diffChars (SymbolService.makeSymText (oldRevision), SymbolService.makeSymText (newRevision))
  }
};
