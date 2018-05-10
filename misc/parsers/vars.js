var playerChar = '@'

function defaultVarVal (sender, recipient, tags) {
  var varVal = { me: '_Anonymous_',
                 you: '_Everyone_' }
  populateVarVal (varVal, sender, recipient, tags)
  return varVal
}

function populateVarVal (varVal, sender, recipient, tags) {
  if (sender)
    varVal.me = playerChar + sender.name
  if (recipient)
    varVal.you = playerChar + recipient.name
  if (tags)
    varVal.tags = tags
  return varVal
}
    
function nextVarVal (config) {
  var varVal = parseTree.finalVarVal (config)
  varVal.prevtags = varVal.tags
  delete varVal.tags
  delete varVal.icon
  delete varVal.icolor
  this.populateVarVal (varVal, config.sender, config.recipient, config.tags)
  return varVal
}

module.exports = { defaultVarVal: defaultVarVal,
                   populateVarVal: populateVarVal,
                   nextVarVal: nextVarVal }
