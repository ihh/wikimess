{
  function makeSymbol (name) { return { type: 'sym', name: name.toLowerCase() } }
  function makeLookup (name) { return { type: 'lookup', varname: name } }
  function makeAssign (name, value) { return { type: 'assign', varname: name, value: value } }
  function makeAlternation (opts) { return { type: 'alt', opts: opts } }
  function makeFunction (name, args) { return { type: 'func', funcname: name, args: args } }

  function makeCapped (args) { return makeFunction ('cap', args) }
  function makeUpperCase (args) { return makeFunction ('uc', args) }

  function makeSugaredSymbol (name) {
    if (name.match(/^[0-9_]*[A-Z].*[a-z]/))
      return makeCapped ([makeSymbol (name)])
    if (name.match(/[A-Z]/) && !name.match(/[a-z]/))
      return makeUpperCase ([makeSymbol (name)])
    return makeSymbol (name)
  }
}
