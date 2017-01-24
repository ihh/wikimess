'use strict';

// from here:
//  http://markbirbeck.com/2015/12/11/using-selenium-webdriver-with-mocha/

let fs = require('fs')
let webdriver = require('selenium-webdriver')
let By = webdriver.By
let until = webdriver.until

function testLogin (driver, name, password) {
  it('should navigate to front page', function(done) {
    driver.get('http://localhost:1337/')
      .then(() => driver.getTitle())
      .then(title => title.should.equal('bighouse'))
      .then(() => done())
      .catch(error => done(error))
  })

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
  })

  it('should click on Settings -> Log out', function(done) {
    driver.findElement(By.className('nav-settings')).click()
    driver
      .wait(until.elementLocated(By.xpath("//*[contains(text(), 'Log out')]")))
      .then(elem => elem.click())
      .then(() => done())
      .catch(error => done(error))
  })

  it('should wait for login page to reappear', function(done) {
    driver
      .wait(until.elementLocated(By.xpath("//*[contains(text(), 'Log in')]")))
      .then(() => done())
      .catch(error => done(error))
  })

  it('should quit', function(done) {
    driver.quit()
      .then(() => done())
      .catch(error => done(error))
  })
}

describe('firefox', function() {
  let firefox = new webdriver.Builder()
    .forBrowser('firefox')
    .build()

  testLogin (firefox, 'fred', 'test')
})

describe('chrome', function() {
  let chrome = new webdriver.Builder()
    .forBrowser('chrome')
    .build()

  testLogin (chrome, 'sheila', 'test')
})

// make the Safari test contingent on presence of safaridriver, for now, since it requires Safari 10 & hence OSX 10.12
if (fs.existsSync('/usr/bin/safaridriver'))
  describe('safari', function() {
    let safari = new webdriver.Builder()
      .forBrowser('safari')
      .build()
    
    testLogin (safari, 'fred', 'test')
  })
