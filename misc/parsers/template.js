var rhsParser = require('./rhs.js')

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
  try {
    var newSymbolDefReg = /^>([A-Za-z_]\w*)\s*$/;
    var symbols = [], currentSymbol, newSymbolDefMatch
    text.split(/\n/).forEach (function (line) {
      if (line.length) {
        if (currentSymbol)
          currentSymbol.rules.push (parseRhs (line))
        else if (newSymbolDefMatch = newSymbolDefReg.exec (line))
          symbols.push (currentSymbol = { name: newSymbolDefMatch[1],
                                          rules: [] })
      } else {
        // line is empty
        currentSymbol = undefined
      }
    })
    log(5,"Parsed text file and converted to the following JSON:\n" + JSON.stringify(symbols,null,2))
    return symbols
  } catch(e) { console.log(e) }
}

function parseTemplateDefs (text, log) {
  log = log || defaultLog
  try {
    var newTemplateDefReg = /^(@.*|)(>+)\s*(.*?)\s*(#\s*(.*?)\s*(#\s*(.*?)\s*|)|)$/;
    var templates = [], replyChain = [], currentTemplate, newTemplateDefMatch
    text.split(/\n/).forEach (function (line) {
      if (line.length) {
        if (currentTemplate)
          currentTemplate.content = currentTemplate.content.concat (parseRhs (line + '\n'))
        else if (newTemplateDefMatch = newTemplateDefReg.exec (line)) {
          var author = newTemplateDefMatch[1],
              depth = newTemplateDefMatch[2].length - 1,
	      title = newTemplateDefMatch[3],
	      prevTags = makeTagString (newTemplateDefMatch[5]),
	      tags = makeTagString (newTemplateDefMatch[7])
          var isRoot = !prevTags.match(/\S/) || (prevTags.search(' root ') >= 0)
          author = author ? author.substr(1) : null
          currentTemplate = { title: title,
                              author: author,
			      previousTags: prevTags,
			      tags: tags,
                              isRoot: isRoot,
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
