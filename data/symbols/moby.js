var fs = require('fs')
var readline = require('readline')

var filename = 'mobythes.aur'

if (fs.existsSync (filename)) {
  var lineReader = readline.createInterface({
    input: require('fs').createReadStream (filename)
  })

  var result = []
  lineReader.on('line', function (line) {
    var defs = line.split(',')
    var name = defs[0]
    var rules = defs.slice(1)
        .filter (function (text) { return text.length })
        .map (function (text) { return [text] })
    result.push ({ name: name,
                   rules: rules })
  })

  lineReader.on('close', function() {
    console.log (JSON.stringify (result))
  })
}
