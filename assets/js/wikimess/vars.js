(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
window.VarsHelper = require('./vars');

},{"./vars":2}],2:[function(require,module,exports){
var playerChar = '@'

function defaultVarVal (sender, recipient, tags) {
  var varVal = { me: '_Anonymous_',
                 you: '_Everyone_' }
  populateVarVal (varVal, sender, recipient, tags)
  return varVal
}

function populateVarVal (varVal, sender, recipient, tags) {
  varVal.me = sender ? (playerChar + sender.name) : '_Anonymous_'
  varVal.you = recipient ? (playerChar + recipient.name) : '_Everyone_'
  if (tags)
    varVal.tags = tags
  return varVal
}
    
function nextVarVal (config, parseTree) {
  var varVal = parseTree.finalVarVal (config)
  varVal.prevtags = varVal.tags
  delete varVal.accept
  delete varVal.reject
  delete varVal.tags
  delete varVal.icon
  delete varVal.icolor
  delete varVal.caption
  delete varVal.sender
  delete varVal.recipient
  this.populateVarVal (varVal, config.sender, config.recipient, config.tags)
  return varVal
}

module.exports = { defaultVarVal: defaultVarVal,
                   populateVarVal: populateVarVal,
                   nextVarVal: nextVarVal }

},{}]},{},[1]);
