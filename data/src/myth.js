var fs = require('fs')
var https = require('https')

var urlPrefix = 'https://sites.ualberta.ca/~urban/Projects/English/Content/'
var ontology = { title: 'Stith Thompson Motif-Index of Folk Literature',
                 section: {} }

var chapters = 'abcdefghjklmnpqrstuvwxz'.split('')

var promise = Promise.resolve()
chapters.forEach (function (chapter) {
  var filename = chapter + '.htm'
  var url = urlPrefix + filename

  promise = promise.then (function() {
    console.warn ('Fetching chapter ' + chapter)
    return new Promise (function (resolve, reject) {
      https.get (url, function (response) {
        var data = ''
        response.on('data', function (chunk) { data += chunk })
        response.on('end', function() {
          console.warn ('Fetched ' + data.length + ' bytes')
          var nTerms = addChapter (chapter, data)
          console.warn ('Added ' + nTerms + ' terms')
          resolve()
        })
      }).on('error', function (err) { reject(err) })
    })
  })
})

promise.then (function() {
  console.log (JSON.stringify (ontology, null, 2))
})

function addChapter (chapter, text) {
  var nTerms = 0
  var str = text.replace(/\0/g,'').replace(/[\n\r\t]/g,' ').replace(/  +/g,' ').replace(/[\u{18}\u{19}] ?/ug,"'").replace(/[\u{1c}\u{1d}] ?/ug,'"')

  var CHAP = chapter.toUpperCase()
  var chapterRegex = '<b>' + CHAP + '\\. ([A-Z ]+)</b>'
  var sectionRegex = '<b><span[^>]+> +' + CHAP + '([0-9]+)[\\- ]+' + CHAP + '([0-9]+)\\. +([^<]*?)\\.</b>'
  var termRegex = CHAP + '([0-9\\.]+)\\. +<i>([^<]*?)\\.</i>'
  var regex = new RegExp ('(' + chapterRegex + '|' + sectionRegex + '|' + termRegex + ')', 'g')
  var match, currentStart, currentEnd, currentTitle
  while ( (match = regex.exec(str)) ) {
    var chapterTitle = match[2], sectionStart = match[3], sectionEnd = match[4], sectionTitle = match[5], termPath = match[6], term = match[7]
    if (chapterTitle)
      ontology.section[CHAP] = { title: chapterTitle, section: {} }
    else if (sectionTitle) {
      currentStart = parseInt (sectionStart)
      currentEnd = parseInt (sectionEnd)
      currentTitle = sectionTitle
    } else if (term) {
      var subsecs = termPath.split('.'), s = subsecs[0]
      if (s >= currentStart && s <= currentEnd && !ontology.section[CHAP].section[s])
        ontology.section[CHAP].section[s] = { title: currentTitle }
      var obj = ontology.section[CHAP]
      subsecs.forEach (function (subsec, n) {
        if (!obj.section)
          obj.section = {}
        if (!obj.section[subsec])
          obj.section[subsec] = (n === subsecs.length - 1
                                 ? { title: term }
                                 : {})
        obj = obj.section[subsec]
      })
      ++nTerms
    }
  }
  return nTerms
}
