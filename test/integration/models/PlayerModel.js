describe('PlayerModel', function() {
  it('should find a Player by name', function (done) {
    var Player = sails.models.player
    Player.findOne ({ name: 'fred' })
      .then (function (player) {
        if (!player) throw new Error("Player not found");
        if (!player.id) throw new Error("Player ID not found");
        done()
      }).catch (function (err) {
        done (err)
      })
  });
});
