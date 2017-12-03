var rp = require('request-promise')
var url = 'https://raw.githubusercontent.com/dariusk/corpora/master/data/animals/common.json'
rp (url)
    .then(function (htmlString) {
      // Process html...
      var json = JSON.parse (htmlString)
      var result = {name: "animal",
// uncomment the summary to make this private and un-edtable
//                    summary: "A random animal.",
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
