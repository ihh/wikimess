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

function testLogin (driver, name, password) {
  it('should navigate to front page', function(done) {
    driver.get('http://localhost:1337/')
      .then(() => driver.getTitle())
      .then(title => title.should.equal('bighouse'))
      .then(() => done())
    .catch(error => done(error))
    ;
  });

  it('should log in as ' + name, function(done) {
    driver.findElement(By.name('player')).sendKeys(name)
    driver.findElement(By.name('password')).sendKeys(password)
    driver.findElement(By.xpath("//*[contains(text(), 'Log in')]")).click()
    driver
      .wait(until.elementLocated(By.className('title')))
      .then(elem => elem.getText())
      .then(text => text.should.equal('Outside WizCom'))
      .then(() => done())
    .catch(error => done(error))
    ;
  });

  it('should quit', function(done) {
    driver.quit()
      .then(() => done())
    .catch(error => done(error))
    ;
  });
}

describe('firefox', function() {
  testLogin (firefox, 'fred', 'test')
});

describe('chrome', function() {
  testLogin (chrome, 'sheila', 'test')
});
