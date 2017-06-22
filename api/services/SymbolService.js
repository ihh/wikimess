// api/services/SymbolService.js

var Promise = require('bluebird')

module.exports = {

  createReferences: function (rules) {
    var refs = {}
    rules.forEach (function (rhs) {
      rhs.forEach (function (rhsSym) {
        if (typeof(rhsSym) === 'object' && rhsSym.name && typeof(rhsSym.id) === 'undefined') {
          refs[rhsSym.name] = refs[rhsSym.name] || []
          refs[rhsSym.name].push (rhsSym)
        }
      })
    })
    var promise
    var refNames = Object.keys(refs), refSymbols = {}
    if (refNames.length)
      promise = Promise.map (refNames, function (refName) {
        return Symbol.findOrCreate ({ name: refName })
          .then (function (refSymbol) {
            refs[refName].forEach (function (rhsSym) {
              rhsSym.id = refSymbol.id
            })
            return refSymbol
          })
      })
    else
      promise = new Promise (function (resolve, reject) { resolve([])} )
    return promise
  },

  resolveReferences: function (symbols) {
    var referenced = {}, name = {}
    symbols.forEach (function (symbol) {
      name[symbol.id] = symbol.name
      symbol.rules.forEach (function (rhs) {
        rhs.forEach (function (rhsSym) {
          if (typeof(rhsSym) === 'object' && rhsSym.id)
            referenced[rhsSym.id] = true
        })
      })
    })
    var refID = Object.keys(referenced).filter (function (id) { return !(id in name) })
    return Symbol.find ({ id: refID })
      .then (function (refSymbols) {
        refSymbols.forEach (function (refSymbol) {
          name[refSymbol.id] = refSymbol.name
        })
        return name
      })
  },

  expandSymbol: function (symbolID, rng) {
    rng = rng || Math.random
    return Symbol.findOne ({ id: symbolID })
      .then (function (symbol) {
        var rhsSyms = symbol.rules.length ? symbol.rules[Math.floor(rng() * symbol.rules.length)] : []
        return Promise.map (rhsSyms, function (rhsSym) {
          return (typeof(rhsSym) === 'string'
                  ? rhsSym
                  : SymbolService.expandSymbol (rhsSym.id, rng))
        })
      }).then (function (rhsVals) {
        return rhsVals.join('')
      })
  },
};
