(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    root.bighouseLabel = factory();
  }
}(this, function () {
  "use strict";

  function isArray (obj) { return Object.prototype.toString.call(obj) === '[object Array]' }

  // English grammar helper functions

  // Verb conjugation
  // person can be 's1', 's2', 's3', 'p1', 'p2', 'p3'
  //  for singular/plural and 1st/2nd/3rd person
  // gender can be 'm' (Male), 'f' (Female), 'n' (Neuter), 'i' (Inanimate)
  //  if 'n', will use 'They' form; if 'i' (or blank), will use 'It' form
  var representativePronoun = { s1: 'i', s2: 'you', s3n: 'they', s3: 'it', p1: 'we', p2: 'you', p3: 'they' }
  function makeRepresentativePronoun (person, gender) {
    return representativePronoun[person + (gender || '')] || representativePronoun[person]
  }

  function conjugate (infinitive, person, gender) {
    var form
    var rp = makeRepresentativePronoun (person, gender)
    switch (infinitive) {
    case 'have': form = (rp === 'it') ? 'has' : 'have'; break
    case 'be': form = (rp === 'i') ? 'am' : (rp === 'it' ? 'is' : 'are'); break
    case 'do': form = (rp === 'it') ? 'does' : 'do'; break
    case 'go': form = (rp === 'it') ? 'goes' : 'go'; break
    default: form = (rp === 'it') ? infinitive.replace (/.\b/i, function(c){return c + (c === 's' ? 'es' : 's')}) : infinitive; break
    }
    return form
  }

  function was (person, gender) {
    var rp = makeRepresentativePronoun (person, gender)
    return (rp === 'i' || rp === 'it') ? 'was' : 'were'
  }

  var irregularPastParticiple = { arise: "arisen", babysit: "babysat", be: "been", beat: "beaten", become: "become", bend: "bent", begin: "begun", bet: "bet", bind: "bound", bite: "bitten", bleed: "bled", blow: "blown", break: "broken", breed: "bred", bring: "brought", broadcast: "broadcast", build: "built", buy: "bought", catch: "caught", choose: "chosen", come: "come", cost: "cost", cut: "cut", deal: "dealt", dig: "dug", do: "done", draw: "drawn", drink: "drunk", drive: "driven", eat: "eaten", fall: "fallen", feed: "fed", feel: "felt", fight: "fought", find: "found", fly: "flown", forbid: "forbidden", forget: "forgotten", forgive: "forgiven", freeze: "frozen", get: "gotten", give: "given", go: "gone", grow: "grown", hang: "hung", have: "had", hear: "heard", hide: "hidden", hit: "hit", hold: "held", hurt: "hurt", keep: "kept", know: "known", lay: "laid", lead: "led", leave: "left", lend: "lent", let: "let", lie: "lain", light: "lit", lose: "lost", make: "made", mean: "meant", meet: "met", pay: "paid", put: "put", quit: "quit", read: "read", ride: "ridden", ring: "rung", rise: "risen", run: "run", say: "said", see: "seen", sell: "sold", send: "sent", set: "set", shake: "shaken", shine: "shone", shoot: "shot", show: "shown", shut: "shut", sing: "sung", sink: "sunk", sit: "sat", sleep: "slept", slide: "slid", speak: "spoken", spend: "spent", spin: "spun", spread: "spread", stand: "stood", steal: "stolen", stick: "stuck", sting: "stung", strike: "struck", swear: "sworn", sweep: "swept", swim: "swum", swing: "swung", take: "taken", teach: "taught", tear: "torn", tell: "told", think: "thought", throw: "thrown", understand: "understood", wake: "woken", wear: "worn", win: "won", withdraw: "withdrawn", write: "written" }
  function pastParticiple (infinitive) {
    return irregularPastParticiple[infinitive] || infinitive.replace (/.\b/i, function(c){return c + (c === 'e' ? 'd' : 'ed')})
  }

  var irregularPastSimple = { arise: "arose", babysit: "babysat", be: "was", beat: "beat", become: "became", bend: "bent", begin: "began", bet: "bet", bind: "bound", bite: "bit", bleed: "bled", blow: "blew", break: "broke", breed: "bred", bring: "brought", broadcast: "broadcast", build: "built", buy: "bought", catch: "caught", choose: "chose", come: "came", cost: "cost", cut: "cut", deal: "dealt", dig: "dug", do: "did", draw: "drew", drink: "drank", drive: "drove", eat: "ate", fall: "fell", feed: "fed", feel: "felt", fight: "fought", find: "found", fly: "flew", forbid: "forbade", forget: "forgot", forgive: "forgave", freeze: "froze", get: "got", give: "gave", go: "went", grow: "grew", hang: "hung", have: "had", hear: "heard", hide: "hid", hit: "hit", hold: "held", hurt: "hurt", keep: "kept", know: "knew", lay: "laid", lead: "led", leave: "left", lend: "lent", let: "let", lie: "lay", light: "lit", lose: "lost", make: "made", mean: "meant", meet: "met", pay: "paid", put: "put", quit: "quit", read: "read", ride: "rode", ring: "rang", rise: "rose", run: "ran", say: "said", see: "saw", sell: "sold", send: "sent", set: "set", shake: "shook", shine: "shone", shoot: "shot", show: "showed", shut: "shut", sing: "sang", sink: "sank", sit: "sat", sleep: "slept", slide: "slid", speak: "spoke", spend: "spent", spin: "spun", spread: "spread", stand: "stood", steal: "stole", stick: "stuck", sting: "stung", strike: "struck", swear: "swore", sweep: "swept", swim: "swam", swing: "swung", take: "took", teach: "taught", tear: "tore", tell: "told", think: "thought", throw: "threw", understand: "understood", wake: "woke", wear: "wore", win: "won", withdraw: "withdrew", write: "wrote" }
  function pastSimple (infinitive) {
    return irregularPastParticiple[infinitive] || infinitive.replace (/.\b/i, function(c){return c + (c === 'e' ? 'd' : 'ed')})
  }
  
  // Pronouns
  var genderedNominative = { s1: 'i', s2: 'you', s3m: 'he', s3f: 'she', s3n: 'they', s3i: 'it', p1: 'we', p2: 'you', p3: 'they' },
      genderedOblique = { s1: 'me', s2: 'you', s3m: 'him', s3f: 'her', s3n: 'them', s3i: 'it', p1: 'us', p2: 'you', p3: 'them' },
      genderedPossessiveDeterminer = { s1: 'my', s2: 'your', s3m: 'his', s3f: 'her', s3n: 'their', s3i: 'its', p1: 'our', p2: 'your', p3: 'their' },
      genderedPossessivePronoun = { s1: 'mine', s2: 'yours', s3m: 'his', s3f: 'hers', s3n: 'theirs', s3i: 'its', p1: 'ours', p2: 'yours', p3: 'theirs' },
      genderedReflexive = { s1: 'myself', s2: 'yourself', s3m: 'himself', s3f: 'herself', s3n: 'themself', s3i: 'itself', p1: 'ourselves', p2: 'yourselves', p3: 'themselves' }

  function getPronoun (table, person, gender) { return table[person + (gender || 'n')] || table[person] }

  function nominative (person, gender) { return getPronoun (genderedNominative, person, gender) }
  function oblique (person, gender) { return getPronoun (genderedOblique, person, gender) }
  function possessiveDeterminer (person, gender) { return getPronoun (genderedPossessiveDeterminer, person, gender) }
  function possessivePronoun (person, gender) { return getPronoun (genderedPossessivePronoun, person, gender) }
  function reflexive (person, gender) { return getPronoun (genderedReflexive, person, gender) }

  var possessivePronoun = { i: 'my', you: 'your', he: 'his', she: 'her', they: 'their', it: 'its', we: 'our' }
  function possessiveApostrophe(noun) {
    var lc = noun.toLowerCase()
    return possessivePronoun[lc] ? possessivePronoun[lc] : (noun + (looksLikePlural(noun) ? "'" : "'s"))
  }
  
  // Articles
  function indefiniteArticle (nounPhrase) {
    return [nounPhrase.match(/^[aeiou]/i) ? 'an' : 'a', nounPhrase]
  }

  // Misc.
  function looksLikePlural(noun) {
    return noun.match(/[b-hj-np-rtv-z][s]$/i)
  }
  
  function lessOrFewer(noun) {
    return [looksLikePlural(noun) ? 'fewer' : 'less', noun]
  }

  function guessPerson(noun) {
    return looksLikePlural(noun) ? 'p3' : 's3'
  }

  function plural(num,singular) {
    if (num === 1)
      return '1 ' + singular
    var plural = singular.replace (/.\b/, function(c) { return c + (c === 's' ? 'es' : 's') })
    return num + ' ' + plural
  }
  
  // from http://stackoverflow.com/a/8843915
  function countSyllables(word) {
    word = word.toLowerCase()
    if (word.length <= 3) return 1
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/i, '')
    word = word.replace(/^y/i, '')
    return word.match(/[aeiouy]{1,2}/gi).length
  }

  var irregularComparative = { good: 'better', well: 'better', bad: 'worse', far: 'farther', little: 'less', many: 'more' }
  function makeComparativeAdjective(adj) {
    if (adj.match(/^[a-z]+\b./i)) return 'more ' + adj  // hyphenated or multiple words
    var lc = adj.toLowerCase()
    if (irregularComparative[lc]) return irregularComparative[lc]
    switch (countSyllables(adj)) {
    case 1: return (adj.match(/e$/) ? (adj+'r') : (adj.match(/ed$/) ? ('more '+adj) : (adj+((adj.match(/[b-df-hj-np-tv-z][aeiou][b-df-hj-np-tv-z]$/) ? adj.charAt(adj.length-1) : '') + 'er'))))
    case 2: return adj.match(/y$/) ? adj.replace(/y$/,'ier') : (adj.match(/le$/) ? (adj+'r') : (adj.match(/(er|ow)$/) ? (adj+'er') : ('more '+adj)))
    default: return 'more '+adj
    }
  }

  // Adjective -> Adverb
  var adj2adv = { 'public': 'publicly' }
  var adjectivesWithSameAdverb = ['early','fast','hard','high','late','near','straight','wrong','well']
  adjectivesWithSameAdverb.forEach (function (adj) { adj2adv[adj] = adj })
  function makeAdverb (adjective) {
    if (adj2adv[adjective]) return adj2adv[adjective]
    else if (adjective.match(/ic$/i)) return adjective + 'ally'
    else if (adjective.match(/le$/i)) return adjective.replace(/e$/i,'y')
    else if (adjective.match(/y$/i)) return adjective.replace(/y$/i,'ily')
    return adjective + 'ly'
  }

  function makeComparativeAdverb (adverb) {
    if (adj2adv[adverb] === adverb)
      return adverb + 'er'
    return 'more ' + adverb
  }
  
  // Capitalization of first letters in sentences
  function capitalize (text) {
    return text
      .replace (/^(\s*)([a-z])/, function (m, g1, g2) { return g1 + g2.toUpperCase() })
      .replace (/([\.\!\?]\s*)([a-z])/g, function (m, g1, g2) { return g1 + g2.toUpperCase() })
  }

  // ordinal suffices http://stackoverflow.com/a/13627586
  function ordinal(i) {
    var j = i % 10,
    k = i % 100;
    if (j == 1 && k != 11) {
      return i + "st";
    }
    if (j == 2 && k != 12) {
      return i + "nd";
    }
    if (j == 3 && k != 13) {
      return i + "rd";
    }
    return i + "th";
  }

  // score/numeric helpers
  function magnitude(obj) {
    var sqsum = 0
    Object.keys(obj).forEach (function (key) {
      var val = obj[key]
      sqsum += (val * val) || 0
    })
    return Math.round (Math.sqrt (sqsum))
  }

  function taxicab(obj) {
    var sum = 0
    Object.keys(obj).forEach (function (key) {
      sum += Math.abs (obj[key] || 0)
    })
    return sum
  }

  function percent(number) {
    return Math.round (number * 100) + '%'
  }

  // grammars
  var defaultGrammarConfig = { maxRecurse: 3,
                               random: Math.random,
			       debug: true,
                               root: 'document' }
  
  function expandGrammar (grammar, config, lhs, symDepth) {
    config = extend (defaultGrammarConfig, config || {})
    lhs = lhs || config.root
    symDepth = symDepth || {}
    var rhsList = grammar.rules[lhs]
    var rhs = rhsList ? rhsList[Math.floor (config.random() * rhsList.length)] : (config.debug ? ('@' + lhs) : '')
    return rhs.replace (/@([A-Za-z0-9_]+)/g, function (atSymbol, symbol) {
      if (symDepth[symbol] >= config.maxRecurse)
        return config.debug ? ('@' + symbol) : ''
      var nestedSymDepth = extend ({}, symDepth)
      nestedSymDepth[symbol] = (symDepth[symbol] || 0) + 1
      return expandGrammar (grammar, config, symbol, nestedSymDepth)
    })
  }

  function extend (a, b) {
    Object.keys(b).forEach (function (k) { a[k] = b[k] })
    return a
  }

  // Externally exposed functions
  var api = {
    // general grammar
    conjugate: conjugate,
    was: was,
    pastParticiple: pastParticiple,
    pastSimple: pastSimple,
    possessiveApostrophe: possessiveApostrophe,
    indefiniteArticle: indefiniteArticle,
    lessOrFewer: lessOrFewer,
    makeComparativeAdjective: makeComparativeAdjective,
    makeComparativeAdverb: makeComparativeAdverb,
    makeAdverb: makeAdverb,
    capitalize: capitalize,
    countSyllables: countSyllables,
    // general numerics
    ordinal: ordinal,
    plural: plural,
    magnitude: magnitude,
    taxicab: taxicab,
    percent: percent,
    // general
    isArray: isArray,
    // generative grammars
    defaultGrammarConfig: defaultGrammarConfig,
    expandGrammar: expandGrammar
  }

  return api
}))
