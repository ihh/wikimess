describe('PlayerModel', function() {

  // this seems like a pretty basic test but mongodb failed it, sooooo.....
  var fredPlayerName = 'fred'
  it('should find a Player ('+fredPlayerName+') by name', function() {
    var Player = sails.models.player
    return Player.findOne ({ name: fredPlayerName })
      .then (function (player) {
        if (!player) throw new Error("Player "+fredPlayerName+" not found")
        if (!player.id) throw new Error("Player "+fredPlayerName+"'s id is falsy/absent")
        fredPlayerId = player.id
      })
  })

  // so far so good; this is the part mongodb fails at
  // probably some kind of name clash with its internal string '_id' which is automagically presented as 'id'
  it('should find a Player ('+fredPlayerName+') by id', function() {
    return Player.findOne ({ id: fredPlayerId })
      .then (function (player2) {
        if (!player2) throw new Error("Player id "+fredPlayerId+" not found")
        if (player2.id !== fredPlayerId) throw new Error("Player id is "+player2.id+", should be "+fredPlayerId)
        if (player2.name !== fredPlayerName) throw new Error("Player name is "+player2.name+", should be "+fredPlayerName)
      })
  })

})
