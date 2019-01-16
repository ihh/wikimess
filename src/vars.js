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
