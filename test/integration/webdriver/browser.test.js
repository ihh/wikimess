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

  it('should log in as fred', function(done) {
    firefox.findElement(By.name('player')).sendKeys('fred')
    firefox.findElement(By.name('password')).sendKeys('test')
    firefox.findElement(By.xpath("//*[contains(text(), 'Log in')]")).click()
    firefox
      .wait(until.elementLocated(By.className('title')))
      .then(elem => elem.getText())
      .then(text => text.should.equal('Outside WizCom'))
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

  it('should log in as sheila', function(done) {
    chrome.findElement(By.name('player')).sendKeys('sheila')
    chrome.findElement(By.name('password')).sendKeys('test')
    chrome.findElement(By.xpath("//*[contains(text(), 'Log in')]")).click()
    chrome
      .wait(until.elementLocated(By.className('title')))
      .then(elem => elem.getText())
      .then(text => text.should.equal('Outside WizCom'))
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
