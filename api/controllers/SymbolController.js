/**
 * SymbolController
 *
 * @description :: Server-side logic for managing Symbols
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var _ = require('lodash')

module.exports = {
  create: function (req, res) {
    if (SchemaService.validateSymbol (req.body)) {
      var symbolInitializers = _.isArray(req.body) ? req.body : [req.body]
      return Symbol.create (symbolInitializers)
        .then (function (symbols) {
          return Revision.create (symbols.map (function (symbol) {
            return { symbol: symbol.id,
                     rules: symbol.rules,
                     name: symbol.name,
                     firstRevision: true,
                     authored: symbol.owned,
                     author: symbol.owner,
                     owned: symbol.owned,
                     owner: symbol.owner }
          })).then (function() {
            res.json (symbols)
          })
        }).catch (function (err) {
          console.log (JSON.stringify (req.body))
          console.log (err)
          res.status(500).send ({ message: err })
        })
    } else
      res.badRequest()
  }
};

