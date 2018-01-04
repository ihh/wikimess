/**
 * SymbolController
 *
 * @description :: Server-side logic for managing Symbols
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var _ = require('lodash')

module.exports = {
  create: function (req, res) {
    console.warn ('SymbolController.create', JSON.stringify (req.body))
    if (SchemaService.validateSymbol (req.body)) {
      console.warn ('after SchemaService.validateSymbol')
      var symbolInitializers = _.isArray(req.body) ? req.body : [req.body]
      console.warn ('symbolInitializers', symbolInitializers)
      return Symbol.create (symbolInitializers)
        .then (function (symbols) {
          console.warn ('after Symbol.create', symbols)
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
          res.status(500).send ({ message: err })
        })
    } else
      res.badRequest()
  }
};

