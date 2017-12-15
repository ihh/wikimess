var fs = require('fs')
var readline = require('readline')
var filename = 'mobythes.aur'

var words
// uncomment for opt-in list of words to include; comment out to import entire thesaurus
words = ['alabaster', 'breach', 'cat', 'delicious', 'evanescent', 'fracas', 'ghost_story', 'hobgoblin', 'iridescent', 'jocular', 'keen', 'language', 'menace', 'numberless', 'osculate', 'pagan', 'quack', 'rhubarb', 'sausage', 'trumpet', 'unacceptable', 'vacillation', 'wacky', 'xenophobia', 'yellow', 'zeal',  // mentioned by the helptext
         'crap', 'delightful', 'filthy', 'rabid']  // used by intro data

if (fs.existsSync (filename)) {
  var lineReader = readline.createInterface({
    input: require('fs').createReadStream (filename)
  })

  var rules = {}
  lineReader.on('line', function (line) {
    var defs = line.split(',')
    var name = defs[0].toLowerCase().replace(/[\s\-,]/g,'_')
    rules[name] = defs
      .filter (function (text) { return text.length })
      .map (function (text) { return [text] })
  })

  lineReader.on('close', function() {

    words = words || Object.keys(rules).sort()
    var result = words.map (function (name) {
      return { name: name,
               owner: null,
               renamable: false,
               transferable: false,
               rules: rules[name] }
    })
    console.log (JSON.stringify (result))
  })
}
