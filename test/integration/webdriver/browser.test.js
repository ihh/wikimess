'use strict';

// from here:
//  http://markbirbeck.com/2015/12/11/using-selenium-webdriver-with-mocha/

let webdriver = require('selenium-webdriver');
let By = webdriver.By;
let until = webdriver.until;

let firefox = new webdriver.Builder()
  .forBrowser('firefox')
  .build();

let chrome = new webdriver.Builder()
  .forBrowser('chrome')
  .build();

describe('firefox', function() {
  it('should navigate to front page', function(done) {
    firefox.get('http://localhost:1337/')
      .then(() => firefox.getTitle())
      .then(title => title.should.equal('bighouse'))
      .then(() => done())
    .catch(error => done(error))
    ;
  });

  it('should quit', function(done) {
    firefox.quit()
      .then(() => done())
    .catch(error => done(error))
    ;
  });
});

describe('chrome', function() {
  it('should navigate to front page', function(done) {
    chrome.get('http://localhost:1337/')
      .then(() => chrome.getTitle())
      .then(title => title.should.equal('bighouse'))
      .then(() => done())
    .catch(error => done(error))
    ;
  });

  it('should quit', function(done) {
    chrome.quit()
      .then(() => done())
    .catch(error => done(error))
    ;
  });
});
