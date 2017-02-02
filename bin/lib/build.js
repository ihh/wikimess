var extend = require('extend')
var Label = require('../../assets/js/bighouse/label')

// uncomment 'debugMenus = 1' to show menus instead of sampling
var debugMenus = 1

function clone(obj) {
  if (typeof(obj) !== 'object') return obj
  var cloned = {}
  Object.keys(obj).forEach (function(key) { cloned[key] = clone(obj[key]) })
  return cloned
}
function isArray (obj) { return Object.prototype.toString.call(obj) === '[object Array]' }

// Grammar helpers
function capitalize (text) { return text.charAt(0).toUpperCase() + text.substr(1) }

function prefix_with(prefix,list) {
  return list.map (function (item) { return prefix + item })
}

function prefix_a(arg) {
  if (isArray(arg)) return arg.map(prefix_a)
  return arg.match(/^[aeiouAEIOU]/) ? ('an ' + arg) : ('a ' + arg)
}

// BigHouse helpers
function goto(label) { return { 'goto': label } }
function to_node(arg) { return isArray(arg) ? seq.apply(seq,arg) : (typeof(arg) === 'function' ? x.toString().replace(/^\(\)=>/,'') : ((typeof(arg) === 'string') ? goto(arg) : arg)) }
function seq() { return { sequence: Array.prototype.map.call (arguments, to_node) } }
function defseq(name,opts) { return extend ({ name: name }, seq.apply(this,opts)) }
function defsample(name,opts) { return extend ({ name: name }, debug_sample1.apply(null,opts)) }
function sample1() { return { sample1: { opts: Array.prototype.map.call (arguments, to_node) } } }

function label_list (label, list, propMap, hintMap) {
  propMap = propMap || {}
  if (typeof(propMap) === 'object') propMap = (function(obj) { return function() { return clone(obj) } }) (propMap)
  hintMap = hintMap || capitalize
  var lpath = label.split('.'), lkey = lpath.pop()
  return list.map (function (item, n) {
    var l = propMap(item,n), obj = { hint: hintMap (item,n), label: l }
    lpath.forEach (function(k) { l = l[k] })
    l[lkey] = item
    return obj
  })
}

function labexpr (label, expr) {
  var obj = { labexpr: {} }
  obj.labexpr[label] = expr
  return obj
}

function set (label, expr) {
  return labexpr (label, "[null," + expr + "]")
}

function debug_sample1() {
  var args = Array.prototype.slice.call(arguments,0)
  return typeof(debugMenus) !== 'undefined'
    ? { text: "(DEBUG)",
	menu: args.map (function(opt) { return extend ({ hint: to_string(opt) }, to_node(opt)) }) }
  : sample1.apply(this,args)
}
function to_string(opt) { return typeof(opt) === 'string' ? opt : (isArray(opt) ? opt.map(to_string).join(' ') : JSON.stringify(opt)) }

function score_prop_map (list, range) {
  range = range || { generic: [1,1] }
  return function (item, n) {
    var score = {}
    Object.keys(range).forEach (function (type) {
      var minScore = range[type][0], maxScore = range[type][1]
      score[type] = Math.round (minScore + (maxScore-minScore) * n / Math.max (1, list.length - 1))
    })
    return { score: score }
  }
}

var Build =
  { extend,
    Label,
    clone,
    isArray,
    capitalize,
    prefix_with,
    prefix_a,
    goto,
    to_node,
    seq,
    defseq,
    defsample,
    sample1,
    label_list,
    labexpr,
    set,
    debug_sample1,
    to_string,
    score_prop_map }

Build.$eval = function (arg) {
  var $ = Build
  return eval (arg)
}

module.exports = Build
