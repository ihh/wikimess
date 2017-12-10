describe('SymbolModel', function() {

  // this seems like a pretty basic test but mongodb failed it, sooooo.....
  var testSymbolName = 'testing'
  it('should find a Symbol ('+testSymbolName+') by name', function() {
    var Symbol = sails.models.symbol
    return Symbol.findOne ({ name: testSymbolName })
      .then (function (symbol) {
        if (!symbol) throw new Error("Symbol "+testSymbolName+" not found")
        if (!symbol.id) throw new Error("Symbol "+testSymbolName+"'s id is falsy/absent")
        testSymbolId = symbol.id
      })
  })

  // so far so good; this is the part mongodb fails at
  // probably some kind of name clash with its internal string '_id' which is automagically presented as 'id'
  it('should find a Symbol ('+testSymbolName+') by id', function() {
    return Symbol.findOne ({ id: testSymbolId })
      .then (function (symbol2) {
        if (!symbol2) throw new Error("Symbol id "+testSymbolId+" not found")
        if (symbol2.id !== testSymbolId) throw new Error("Symbol id is "+symbol2.id+", should be "+testSymbolId)
        if (symbol2.name !== testSymbolName) throw new Error("Symbol name is "+symbol2.name+", should be "+testSymbolName)
      })
  })

})
