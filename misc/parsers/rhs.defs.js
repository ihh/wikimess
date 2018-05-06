function makeSymbol (name) { return { type: 'sym', name: name.toLowerCase() } }
function makeLookup (name) { return { type: 'lookup', varname: name } }
function makeAssign (name, value) { return { type: 'assign', varname: name, value: value } }
function makeAlternation (opts) { return { type: 'alt', opts: opts } }
function makeFunction (name, args) { return { type: 'func', funcname: name, args: args } }
function makeConditional (testArg, trueArg, falseArg) { return { type: 'cond', test: testArg, t: trueArg, f: falseArg } }

function makeCapped (args) { return makeFunction ('cap', args) }
function makeUpperCase (args) { return makeFunction ('uc', args) }

function makeSugaredSymbol (name) {
  if (name.match(/^[0-9_]*[A-Z].*[a-z]/))
    return makeCapped ([makeSymbol (name)])
  if (name.match(/[A-Z]/) && !name.match(/[a-z]/))
    return makeUpperCase ([makeSymbol (name)])
  return makeSymbol (name)
}

function makeSugaredLookup (name) {
  if (name.match(/^[0-9_]*[A-Z].*[a-z]/))
    return makeCapped ([makeLookup (name)])
  if (name.match(/[A-Z]/) && !name.match(/[a-z]/))
    return makeUpperCase ([makeLookup (name)])
  return makeLookup (name)
}

function makeTraceryExpr (sym, mods) {
  return mods.reduce (function (expr, mod) {
    return makeFunction (mod, [expr])
  }, makeConditional ([makeLookup(sym)], [makeLookup(sym)], [makeSymbol(sym)]))
}
