var bracery = require('bracery')
var rhsParser = bracery.RhsParser

function makeTagString (text) {
  return (text
          ? (' ' + text.replace (/^\s*(.*?)\s*$/, function (_m, g) { return g }).split(/\s+/).join(' ') + ' ')
	  : '')
}

function parseRhs (rhs) {
  var parsed = rhsParser.parse (rhs)
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
        return symbol
      })
  if (symbols)
    log(5,"Parsed text file and converted to the following JSON:\n" + JSON.stringify(symbols,null,2))
  return symbols
}

function parseTemplateDefs (text, log) {
  log = log || defaultLog
  try {
    var newTemplateDefReg = /^(\d*)(@.*|)(>+)\s*(.*?)\s*(#\s*(.*?)\s*(#\s*(.*?)\s*|)|)$/;
    var templates = [], replyChain = [], currentTemplate, newTemplateDefMatch
    text.split(/\n/).forEach (function (line) {
      if (line.length) {
        if (currentTemplate)
          currentTemplate.content = currentTemplate.content.concat (parseRhs (line + '\n'))
        else if (newTemplateDefMatch = newTemplateDefReg.exec (line)) {
          var weight = newTemplateDefMatch[1],
              author = newTemplateDefMatch[2],
              depth = newTemplateDefMatch[3].length - 1,
	      title = newTemplateDefMatch[4],
	      prevTags = makeTagString (newTemplateDefMatch[6]),
	      tags = makeTagString (newTemplateDefMatch[8])
          var isRoot = !prevTags.match(/\S/) || (prevTags.search(' root ') >= 0)
          author = author ? author.substr(1) : null
          currentTemplate = { title: title,
                              author: author,
			      previousTags: prevTags,
			      tags: tags,
                              isRoot: isRoot,
                              weight: weight.length ? parseInt(weight) : undefined,
			      content: [],
                              replies: [] }
          if (depth > replyChain.length)
            throw new Error ("Missing replies in chain")
          replyChain = replyChain.slice (0, depth)
          if (depth > 0)
            replyChain[depth-1].replies.push (currentTemplate)
          else
            templates.push (currentTemplate)
          replyChain.push (currentTemplate)
        }
      } else {
        // line is empty
        currentTemplate = undefined
      }
    })
    log(5,"Parsed text file and converted to the following JSON:\n" + JSON.stringify(templates,null,2))
    return templates
  } catch(e) { console.log(e) }
  return null
}

module.exports = { parseTemplateDefs: parseTemplateDefs,
                   parseSymbolDefs: parseSymbolDefs }
