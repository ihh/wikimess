var bracery = require('bracery')
var RhsParser = bracery.RhsParser
var Template = bracery.Template

function parseRhs (rhs) {
  var parsed = RhsParser.parse (rhs)
  return parsed
}

function defaultLog() { return console.log.apply (console.log, Array.prototype.slice.call (arguments, 1)) }

function parseSymbolDefs (text, log) {
  log = log || defaultLog
  var rules = bracery.ParseTree.parseTextDefs (text)
  var symbols = Object.keys (rules)
      .map (function (name) {
        var symbol = { rules: rules[name].map (bracery.ParseTree.parseRhs) }
        symbol.name = name
        symbol.owned = true
        return symbol
      })
  if (symbols && symbols.length)
    log(5,"Parsed text file and converted to the following JSON:\n" + JSON.stringify(symbols,null,2))
  return symbols
}

function parseTemplateDefs (text, log) {
  log = log || defaultLog
  var templates = Template.parseTemplateDefs (text)
  if (templates && templates.length)
    log(5,"Parsed text file and converted to the following JSON:\n" + JSON.stringify(templates,null,2))
  return templates
}

module.exports = { parseTemplateDefs: parseTemplateDefs,
                   parseSymbolDefs: parseSymbolDefs }
