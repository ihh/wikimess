var sails = require('sails');
var fs = require('fs');
var exec = require('child_process').exec;
var rmdirSync = require('rimraf').sync;

before(function(done) {

  if (fs.existsSync('tmp.old'))
    rmdirSync('tmp.old')

  if (fs.existsSync('.tmp'))
    fs.renameSync('.tmp','tmp.old')
  
  // Increase the Mocha timeout so that Sails has enough time to lift.
  this.timeout(5000);

  sails.lift({
    // configuration for testing purposes
  }, function(err) {
    if (err) return done(err);
    // here you can load fixtures, etc.
    done(err, sails);
  });
});

after(function(done) {
  // here you can clear fixtures, etc.
  sails.lower(done);

  if (fs.existsSync('tmp.old')) {
    if (fs.existsSync('tmp.test'))
      rmdirSync('tmp.test')
    if (fs.existsSync('.tmp'))
	fs.renameSync('.tmp','tmp.test')
    fs.renameSync('tmp.old','.tmp')
  }
});

var script = 'bin/load-data.js'
describe(script, function() {
  it('should run '+script, function (done) {
    exec (script+' --data=test/data', function (error, stdout, stderr) {
      console.log(stdout)
      console.log(stderr)
      done (error)
    })
  })
})
