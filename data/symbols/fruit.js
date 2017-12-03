var rp = require('request-promise')
var url = 'https://raw.githubusercontent.com/dariusk/corpora/master/data/foods/fruits.json'
rp (url)
  .then(function (htmlString) {
//    console.warn (htmlString)
      // Process html...
      var json = JSON.parse (htmlString)
      var result = {name: "fruit",
// uncomment the summary to make this private and un-edtable
//                    summary: "...",
                    rules: json.fruits.map (function (text) {
                      return [text]
                    })
                   }
      console.log (JSON.stringify (result))
    })
    .catch(function (err) {
      // Crawling failed...
      console.error ('Oops - failed', err)
    })
