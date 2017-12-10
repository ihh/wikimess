describe('PlayerModel', function() {

  var fredPlayerName = 'fred', fredPlayerId = null
  it('should find a Player ('+fredPlayerName+') by name', function (done) {
    var Player = sails.models.player
    Player.findOne ({ name: fredPlayerName })
      .then (function (player) {
        if (!player) throw new Error("Player not found")
        if (!player.id) throw new Error("Player ID is falsy/absent")
        fredPlayerId = player.id
        console.warn('Player id of '+fredPlayerName+' is '+fredPlayerId)
        done()
      }).catch (function (err) {
        done (err)
      })
  })

  it('should find a Player by id', function (done) {
    var Player = sails.models.player
    Player.findOne ({ id: fredPlayerId })
      .then (function (player) {
        if (!player) throw new Error("Player not found")
        if (player.name !== fredPlayerName) throw new Error("Player name is "+player.name+", should be "+fredPlayerName)
        if (player.id !== fredPlayerId) throw new Error("Player ID is "+player.id+", should be "+fredPlayerId)
        done()
      }).catch (function (err) {
        done (err)
      })
  })
})
