var session = require('supertest-session');

    var testSession = null;
    beforeEach (function () {
      testSession = session (sails.hooks.http.app);
    });
    

describe('ClientController', function() {

    it('should fail accessing a restricted page', function (done) {
      testSession.get('/p/drafts')
        .expect(401)
        .end(done)
    });
    
    it('should sign in', function (done) {
      testSession.post('/login')
        .send({ name: 'admin', password: 'admin' })
        .expect(200)
        .expect('Content-Type', /json/)
        .expect(function (res) {
          if (!('player' in res.body)) throw new Error("missing player key");
          if (!('id' in res.body.player)) throw new Error("missing player.id key");
        }).end(function(err, res) {
          if (err) return done(err);
          return done();
        });
    });

  describe('(after authenticating session)', function() {

    var authenticatedSession = null;
    beforeEach (function (done) {
      testSession.post('/login')
        .send({ name: 'fred', password: 'test' })
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          authenticatedSession = testSession;
          return done();
        });
    });

    it('should access a restricted page', function (done) {
      authenticatedSession.get('/p/drafts')
        .expect(200)
        .end(done)
    });
  })

});
