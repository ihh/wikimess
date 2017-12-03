var rp = require('request-promise')
var base = 'https://raw.githubusercontent.com/dariusk/corpora/master/data/'
var url = base + 'animals/common.json'
rp (url)
    .then(function (htmlString) {
      // Process html...
      var json = JSON.parse (htmlString)
      var result = {name: "animal",
                    summary: "A random animal.",
                    rules: json.animals.map (function (text) {
                      return [text]
                    })
                   }
      console.log (JSON.stringify (result))
    })
    .catch(function (err) {
      // Crawling failed...
      console.error ('Oops - failed')
    })
