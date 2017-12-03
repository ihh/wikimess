var fs = require('fs')
var readline = require('readline')
var filename = 'mobythes.aur'
var words = ['delightful', 'rabid']

if (fs.existsSync (filename)) {
  var lineReader = readline.createInterface({
    input: require('fs').createReadStream (filename)
  })

  var rules = {}
  lineReader.on('line', function (line) {
    var defs = line.split(',')
    var name = defs[0].toLowerCase().replace(/\s\-,/g,'_')
    rules[name] = defs.slice(1)
      .filter (function (text) { return text.length })
      .map (function (text) { return [text] })
  })

  lineReader.on('close', function() {
    var result = words.map (function (name) {
      return { name: name,
               rules: rules[name] }
    })
    console.log (JSON.stringify (result))
  })
}
