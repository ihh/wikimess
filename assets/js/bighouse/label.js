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

  function getExpansionRoot (expansion) {
    while (expansion.parent) expansion = expansion.parent
    return expansion
  }

  function addLabel (x, y) {
    return typeof(x) === 'undefined' ? y : (x + y)
  }

  function getNestedProperty (obj, key) {
    var keys = key.split('.')
    while (obj && keys.length)
      obj = obj[keys.shift()]
    return obj
  }

  function hasNestedProperty (obj, key) {
    return typeof(getNestedProperty (obj, key)) !== 'undefined'
  }

  function expansionLabel (e, label) {
    var l
    if (e.node) {
      if (e.node.labexpr && hasNestedProperty (e.node.labexpr, label))
        l = evalExpansionExpr (e, getNestedProperty (e.node.labexpr, label))
      else if (e.node.label && hasNestedProperty (e.node.label, label))
	l = getNestedProperty (e.node.label, label)
    }
    return l
  }
  
  function expansionLabels (expansion, label) {
    var labs = []
    if (expansion) {
      var e = getExpansionRoot (expansion)
      while (e) {
        var l = expansionLabel (e, label)
        if (l)
	  labs.push (l)
	if (e === expansion) break
	e = e.next
      }
    }
    return labs
  }

  function lastExpansionLabel (expansion, label) {
    var labs = expansionLabels (expansion, label)
    return labs.pop()
  }

  function sumExpansionLabels (expansion, label) {
    var labs = expansionLabels (expansion, label)
    return labs.reduce (addLabel, undefined)
  }

  function parentExpansionLabel (expansion, label) {
    var l
    while (!l && (expansion = expansion.parent))
      l = expansionLabel (expansion, label)
    return l
  }
  
  function evalExpansionExpr (expansion, expr, failureVal, log) {
    if (typeof(log) === 'undefined')
      log = console.log

    var $labels = (lab) => expansionLabels(expansion,lab)
    var $label = (lab) => sumExpansionLabels(expansion,lab)
    var $last = (lab) => lastExpansionLabel(expansion,lab)
    var $parent = (lab) => parentExpansionLabel(expansion,lab)

    var $conj = conjugate  // $conj (infinitive, person [,gender])
    var $is = (person) => conjugate('be',person)
    var $has = (person) => conjugate('have',person)
    var $cap = capitalize  // $cap (text)
    var $he = (person) => nominative(person,'i')
    var $they = (person) => nominative(person,'n')
    var $him = (person) => oblique(person,'i')
    var $them = (person) => oblique(person,'n')
    var $her = (person) => possessiveDeterminer(person,'i')
    var $their = (person) => possessiveDeterminer(person,'n')
    var $hers = (person) => possessivePronoun(person,'i')
    var $theirs = (person) => possessivePronoun(person,'n')
    var $themself = reflexive  // $themself (person [,gender])
    var $a = indefiniteArticle  // $a (nounPhrase)

    var val
    try {
      val = eval(expr)
    } catch (e) {
      if (log) {
        log ("When evaluating: " + expr)
        log ("Error: " + e)
      }
      val = failureVal
    }
    return val
  }

  function evalVisible (expansion, expr, log) {
    return typeof(expr) !== 'undefined' ? evalExpansionExpr(expansion,expr,false,log) : true
  }

  function evalLabel (expansion, label, labexpr, log) {
    label = label || {}
    if (labexpr)
      Object.keys(labexpr).forEach (function (lab) {
	var expr = labexpr[lab]
	label[lab] = (typeof(expr) === 'object')
	  ? evalLabel (expansion, label[lab], expr, log) 
	  : evalExpansionExpr (expansion, expr)
      })
    return Object.keys(label).length ? label : undefined
  }

  // English grammar helper functions

  // Verb conjugation
  // person can be 's1', 's2', 's3', 'p1', 'p2', 'p3'
  //  for singular/plural and 1st/2nd/3rd person
  // gender can be 'm' (Male), 'f' (Female), 'n' (Neuter), 'i' (Inanimate)
  //  if 'n', will use 'They' form; if 'i', will use 'It' form
  var representativePronoun = { s1: 'i', s2: 'you', s3n: 'they', s3: 'it', p1: 'we', p2: 'you', p3: 'they' }
  function conjugate (infinitive, person, gender) {
    var form
    var rp = representativePronoun[person + gender] || representativePronoun[person]
    switch (infinitive) {
    case 'have': form = (rp === 'it') ? 'has' : 'have'; break
    case 'be': form = (rp === 'i') ? 'am' : (rp === 'it' ? 'is' : 'are'); break
    case 'do': form = (rp === 'it') ? 'does' : 'do'; break
    case 'go': form = (rp === 'it') ? 'goes' : 'go'; break
    default: form = (rp === 'it') ? (infinitive + (infinitive.match(/s$/) ? 'es' : 's')) : infinitive; break
    }
    return form
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

  // Articles
  function indefiniteArticle (nounPhrase) {
    return (nounPhrase.match(/^[AEIOUaeiou]/) ? 'an ' : 'a ') + nounPhrase
  }

  // Capitalization of first letters in sentences
  function capitalize (text) {
    return text
      .replace (/^(\s*)([a-z])/, function (m, g1, g2) { return g1 + g2.toUpperCase() })
      .replace (/([\.\!\?]\s*)([a-z])/, function (m, g1, g2) { return g1 + g2.toUpperCase() })
  }

  // Externally exposed functions
  return {
    getExpansionRoot: getExpansionRoot,
    addLabel: addLabel,
    expansionLabels: expansionLabels,
    lastExpansionLabel: lastExpansionLabel,
    sumExpansionLabels: sumExpansionLabels,
    parentExpansionLabel: parentExpansionLabel,
    evalExpansionExpr: evalExpansionExpr,
    evalVisible: evalVisible,
    evalLabel: evalLabel,
    capitalize: capitalize
  }
}))
