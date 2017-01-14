var request = require('supertest');

describe('PlayerController', function() {

  describe('#login()', function() {
    it('should log fred in', function (done) {
      request(sails.hooks.http.app)
        .post('/login')
        .send({ name: 'fred', password: 'test' })
        .expect(200)
        .expect('Content-Type', /json/)
        .expect(function (res) {
          if (!('player' in res.body)) throw new Error("missing player key");
          if (!('id' in res.body.player)) throw new Error("missing player.id key");
          if (res.body.player.id !== 1) throw new Error("player.id has wrong value");
        }).end(function(err, res) {
          if (err) return done(err);
          done();
        });
    });
  });

});
