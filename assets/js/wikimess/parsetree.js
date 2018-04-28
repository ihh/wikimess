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
    root.parseTree = factory();
  }
}(this, function () {
  "use strict";

  // randomness
  function randomIndex (array, rng) {
    rng = rng || Math.random
    return Math.floor (rng() * array.length)
  }

  function randomElement (array, rng) {
    return array[randomIndex (array, rng)]
  }

  function nRandomElements (array, n, rng) {
    rng = rng || Math.random
    var result = []
    var index = array.map (function (_dummy, k) { return k })
    for (var i = 0; i < n && i < array.length - 1; ++i) {
      var j = Math.floor (rng() * (array.length - i)) + i
      result.push (array[index[j]])
      index[j] = index[i]
    }
    return result
  }
  
  // Parse tree constants
  var symChar = '$', symCharHtml = '&#36;'
  var playerChar = '@', varChar = '^', funcChar = '&', leftBraceChar = '{', rightBraceChar = '}', leftSquareBraceChar = '[', rightSquareBraceChar = ']', assignChar = '='
  
  // Parse tree manipulations
  function sampleParseTree (rhs, rng) {
    var pt = this
    rng = rng || Math.random
    return rhs.map (function (node, n) {
      var result, index
      if (typeof(node) === 'string')
	result = node
      else
	switch (node.type) {
	case 'assign':
	  result = { type: 'assign',
                     varname: node.varname,
		     value: pt.sampleParseTree (node.value, rng) }
          break
	case 'alt':
          index = pt.randomIndex (node.opts)
	  result = { type: 'opt',
                     n: index,
                     rhs: pt.sampleParseTree (node.opts[index], rng) }
          break
	case 'func':
	  result = { type: 'func',
                     funcname: node.funcname,
		     args: pt.sampleParseTree (node.args, rng) }
          break
	case 'lookup':
	  result = node
          break
	default:
	case 'sym':
	  result = { type: 'sym',
		     id: node.id,
		     name: node.name }
	  break
	}
      return result
    })
  }

  function getSymbolNodes (rhs) {
    var pt = this
    return rhs.reduce (function (result, node) {
      var r
      if (typeof(node) === 'object')
        switch (node.type) {
        case 'lookup':
          break
        case 'assign':
          r = pt.getSymbolNodes (node.value)
          break
        case 'alt':
          r = node.opts.reduce (function (altResults, opt) {
            return altResults.concat (pt.getSymbolNodes (opt))
          }, [])
          break
        case 'func':
          r = pt.getSymbolNodes (node.args)
          break
        case 'root':
        case 'opt':
          r = pt.getSymbolNodes (node.rhs)
          break
        default:
        case 'sym':
          r = [node]
	  if (node.rhs)
	    r = r.concat (pt.getSymbolNodes (node.rhs))
          break
        }
      return r ? result.concat(r) : result
    }, [])
  }
  
  // parseTreeEmpty returns true if a tree contains no nonwhite characters OR unexpanded symbols
  function parseTreeEmpty (rhs) {
    var pt = this
    return rhs.reduce (function (result, node) {
      if (result) {
        if (typeof(node) === 'string' && node.match(/\S/))
	  result = false
	else {
          switch (node.type) {
          case 'assign':
            result = pt.parseTreeEmpty (node.value)
            break
          case 'alt':
            result = node.opts.reduce (function (r, opt) {
	      return r && pt.parseTreeEmpty (opt)
            }, true)
            break
          case 'func':
            result = pt.parseTreeEmpty (node.args)
            break
          case 'lookup':
            break
          case 'root':
          case 'opt':
	    if (node.rhs)
	      result = pt.parseTreeEmpty (node.rhs)
	    break
          default:
          case 'sym':
	    if (node.rhs)
	      result = pt.parseTreeEmpty (node.rhs)
            else if (!node.notfound && !node.limit)
              result = false
	    break
          }
	}
      }
      return result
    }, true)
  }
  
  function makeRhsText (rhs, makeSymbolName) {
    var pt = this
    return rhs.map (function (tok, n) {
      var result
      if (typeof(tok) === 'string')
        result = tok.replace(/[\$&\^\{\}\|\\]/g,function(m){return'\\'+m})
      else {
        var nextTok = (n < rhs.length - 1) ? rhs[n+1] : undefined
	var nextIsAlpha = typeof(nextTok) === 'string' && nextTok.match(/^[A-Za-z0-9_]/)
        switch (tok.type) {
        case 'lookup':
          result = (nextIsAlpha
                    ? (varChar + leftBraceChar + tok.varname + rightBraceChar)
                    : (varChar + tok.varname))
	  break
        case 'assign':
          result = varChar + tok.varname + assignChar + leftBraceChar + pt.makeRhsText(tok.value,makeSymbolName) + rightBraceChar
	  break
        case 'alt':
          result = leftSquareBraceChar + tok.opts.map (function (opt) { return pt.makeRhsText(opt,makeSymbolName) }).join('|') + rightSquareBraceChar
	  break
        case 'func':
	  var sugaredName = pt.makeSugaredName (tok, makeSymbolName)
	  if (sugaredName)
	    result = (nextIsAlpha
		      ? (symChar + leftBraceChar + sugaredName + rightBraceChar)
		      : (symChar + sugaredName))
	  else {
            var noBraces = tok.args.length === 1 && (tok.args[0].type === 'func' || tok.args[0].type === 'lookup' || tok.args[0].type === 'alt')
            result = funcChar + tok.funcname + (noBraces ? '' : leftBraceChar) + pt.makeRhsText(tok.args,makeSymbolName) + (noBraces ? '' : rightBraceChar)
          }
	  break
        case 'opt':
          break
        default:
        case 'sym':
          result = (nextIsAlpha
                    ? (symChar + leftBraceChar + makeSymbolName(tok) + rightBraceChar)
                    : (symChar + makeSymbolName(tok)))
	  break
        }
      }
      return result
    }).join('')
  }

  function makeSugaredName (funcNode, makeSymbolName) {
    var sugaredName
    if (funcNode.args.length === 1 && typeof(funcNode.args[0]) === 'object' && funcNode.args[0].type === 'sym') {
      var symName = makeSymbolName(funcNode.args[0])
      if (funcNode.funcname === 'cap' && symName.match(/[a-z]/))
	sugaredName = symName.replace(/[a-z]/,function(c){return c.toUpperCase()})
      if (funcNode.funcname === 'uc' && symName.match(/[a-z]/))
	sugaredName = symName.toUpperCase()
    }
    return sugaredName
  }

  var defaultSummaryLen = 64
  function summarize (text, summaryLen) {
    summaryLen = summaryLen || defaultSummaryLen
    return text.replace(/^\s*/,'').substr (0, summaryLen)
  }
  function summarizeExpansion (expansion, summaryLen) {
    return summarize (makeExpansionText(expansion), summaryLen)
  }
  function summarizeRhs (rhs, makeSymbolName, summaryLen) {
    return summarize (makeRhsText(rhs,makeSymbolName), summaryLen)
  }

  function makeRhsExpansionText (rhs, leaveSymbolsUnexpanded, varVal) {
    return rhs.map (function (child) { return makeExpansionText (child, leaveSymbolsUnexpanded, varVal) })
      .join('')
  }

  function makeExpansionText (node, leaveSymbolsUnexpanded, varVal) {
    varVal = varVal || defaultVarVal()
    var expansion = ''
    if (node) {
      if (typeof(node) === 'string')
        expansion = node
      else
        switch (node.type) {
        case 'assign':
          varVal[node.varname] = makeRhsExpansionText (node.value, leaveSymbolsUnexpanded, varVal)
          break
        case 'lookup':
          expansion = varVal[node.varname]
          break
        case 'func':
          var arg = makeRhsExpansionText (node.args, leaveSymbolsUnexpanded, varVal)
          switch (node.funcname) {
          case 'cap':
            expansion = capitalize (arg)
            break
          case 'uc':
            expansion = arg.toUpperCase()
            break
          case 'plural':
            expansion = pluralForm (arg)
            break
          case 'a':
            expansion = indefiniteArticle (arg)
            break
          default:
            expansion = arg
            break
          }
          break
        case 'root':
        case 'opt':
        case 'sym':
          if (leaveSymbolsUnexpanded && node.name)
            expansion = symCharHtml + node.name + '.' + (node.limit ? ('limit' + node.limit.type) : (node.notfound ? 'notfound' : 'unexpanded'))
          else if (node.rhs)
            expansion = makeRhsExpansionText (node.rhs, leaveSymbolsUnexpanded, varVal)
          break
        case 'alt':
        default:
          break
        }
    }
    return expansion
  }

  function populateVarVal (varVal, sender, recipient) {
    if (sender)
      varVal.me = playerChar + sender.name
    if (recipient)
      varVal.you = playerChar + recipient.name
    return varVal
  }

  function defaultVarVal (sender, recipient) {
    var varVal = { me: '_Anonymous_',
                   you: '_Everyone_' }
    populateVarVal (sender, recipient)
    return varVal
  }
  
  function finalVarVal (node, initVarVal) {
    var varVal
    if (initVarVal) {
      varVal = {}
      Object.keys(initVarVal).forEach (function (name) {
        varVal[name] = initVarVal[name]
      })
    } else
      varVal = defaultVarVal()
    makeExpansionText (node, false, varVal)
    return varVal
  }

  function nextVarVal (node, initVarVal, sender, recipient) {
    var varVal = finalVarVal (node, initVarVal)
    populateVarVal (varVal, sender, recipient)
    return varVal
  }

  // General helper functions
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
    var article = nounPhrase.match(/^[^A-Za-z]*[aeiou]/i) ? 'an' : 'a'
    return article + ' ' + nounPhrase
  }

  // Misc.
  function looksLikePlural(noun) {
    return noun.match(/[b-hj-np-rtv-z][s]$/i)
  }
  
  function lessOrFewer(noun) {
    return (looksLikePlural(noun) ? 'fewer' : 'less') + ' ' + noun
  }

  function guessPerson(noun) {
    return looksLikePlural(noun) ? 'p3' : 's3'
  }
  
  function nPlurals(num,singular) {
    if (num === 1)
      return '1 ' + singular
    return num + ' ' + this.pluralForm (singular)
  }
  
  // this list needs beefing up...
  var irregularPlural = {
    addendum: 'addenda', alga: 'algae', alumnus: 'alumni', amoeba: 'amoebae', antenna: 'antennae', bacterium: 'bacteria', cactus: 'cacti', curriculum: 'curricula', datum: 'data', fungus: 'fungi', genus: 'genera', larva: 'larvae', memorandum: 'memoranda', stimulus: 'stimuli', syllabus: 'syllabi', vertebra: 'vertebrae',
    echo: 'echoes', embargo: 'embargoes', hero: 'heroes', potato: 'potatoes', tomato: 'tomatoes', torpedo: 'torpedoes', veto: 'vetoes', volcano: 'volcanoes',
    child: 'children', dormouse: 'dormice', foot: 'feet', goose: 'geese', louse: 'lice', man: 'men', mouse: 'mice', ox: 'oxen', tooth: 'teeth', woman: 'women',
    axis: 'axes', analysis: 'analyses', basis: 'bases', crisis: 'crises', diagnosis: 'diagnoses', ellipsis: 'ellipses', emphasis: 'emphases', hypothesis: 'hypotheses', neurosis: 'neuroses', oasis: 'oases', paralysis: 'paralyses', parenthesis: 'parentheses', thesis: 'theses',
    appendix: 'appendices', index: 'indices', matrix: 'matrices',
    barracks: 'barracks', deer: 'deer', fish: 'fish', gallows: 'gallows', means: 'means', offspring: 'offspring', series: 'series', sheep: 'sheep', species: 'species'
  }

  function pluralForm (singular) {
    var wm = this
    var match
    if ((match = singular.match(/^([\s\S]*)\b(\w+)(\s*)$/)) && irregularPlural[match[2]])
      return match[1] + matchCase (match[2], irregularPlural[match[2]]) + match[3]
    else if (singular.match(/(ch|sh|s|x|z)\s*$/i))
      return singular.replace(/(ch|sh|s|x|z)(\s*)$/i, function (match, ending, spacer) { return ending + matchCase(ending,'es') + spacer })
    else if (singular.match(/[aeiou]y\s*$/i))
      return singular.replace (/(y)(\s*)$/i, function (match, y, spacer) { return matchCase(y,'ys') + spacer })
    else if (singular.match(/y\s*$/i))
      return singular.replace (/(y)(\s*)$/i, function (match, y, spacer) { return matchCase(y,'ies') + spacer })
    else if (singular.match(/fe?\s*$/i))
      return singular.replace (/(fe?)(\s*)$/i, function (match, fe, spacer) { return matchCase(fe,'ves') + spacer })
    else if (singular.match(/o\s*$/i))
      return singular.replace (/(o)(\s*)$/i, function (match, o, spacer) { return matchCase(o,'os') + spacer })
    else if (singular.match(/[a-zA-Z]\s*$/i))
      return singular.replace (/([a-zA-Z])(\s*)$/i, function (match, c, spacer) { return c + matchCase(c,'s') + spacer })
    return singular
  }

  function matchCase (model, text) {
    return model.match(/[A-Z]/) ? text.toUpperCase() : text
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
      .replace (/^([^A-Za-z]*)([a-z])/, function (m, g1, g2) { return g1 + g2.toUpperCase() })
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

  // Externally exposed functions
  var api = {
    // parse tree constants
    symChar: symChar,
    symCharHtml: symCharHtml,
    playerChar: playerChar,
    varChar: varChar,
    funcChar: funcChar,
    leftBraceChar: leftBraceChar,
    rightBraceChar: rightBraceChar,
    leftSquareBraceChar: leftSquareBraceChar,
    rightSquareBraceChar: rightSquareBraceChar,
    assignChar: assignChar,
    // parse tree manipulations
    sampleParseTree: sampleParseTree,
    getSymbolNodes: getSymbolNodes,
    parseTreeEmpty: parseTreeEmpty,
    makeRhsText: makeRhsText,
    makeSugaredName: makeSugaredName,
    makeExpansionText: makeExpansionText,
    summarizeRhs: summarizeRhs,
    summarizeExpansion: summarizeExpansion,
    defaultVarVal: defaultVarVal,
    finalVarVal: finalVarVal,
    nextVarVal: nextVarVal,
    populateVarVal: populateVarVal,
    // English grammar
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
    pluralForm: pluralForm,
    // general numerics
    ordinal: ordinal,
    nPlurals: nPlurals,
    // general utility
    isArray: isArray,
    randomIndex: randomIndex,
    randomElement: randomElement,
    nRandomElements: nRandomElements
  }

  return api
}));
