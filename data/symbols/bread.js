var rp = require('request-promise')
var url = 'https://raw.githubusercontent.com/dariusk/corpora/master/data/foods/breads_and_pastries.json'
var name = 'bread'
function plural(x) { return x.replace (/.\b/, function(c) { return (c === 'y' ? 'ies' : (c + (c === 's' ? 'es' : 's'))) }) }
var key = plural(name)
rp (url)
  .then(function (htmlString) {
//    console.warn (htmlString)
      // Process html...
      var json = JSON.parse (htmlString)
      var result = {name: name,
// uncomment the summary to make this private and un-edtable
//                    summary: "...",
                    rules: json[key].map (function (text) {
                      return [text]
                    })
                   }
      console.log (JSON.stringify (result))
    })
    .catch(function (err) {
      // Crawling failed...
      console.error ('Oops - failed', err)
    })
