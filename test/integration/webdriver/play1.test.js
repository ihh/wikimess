'use strict';

// from here:
//  http://markbirbeck.com/2015/12/11/using-selenium-webdriver-with-mocha/

let webdriver = require('selenium-webdriver')
let By = webdriver.By
let until = webdriver.until

var name = 'fred'

var driver
function createDriver (driverType) {
  it('should create a ' + driverType + ' webdriver', function(done) {
    driver = new webdriver.Builder()
      .forBrowser(driverType)
      .build()
    driver.manage().window().setSize(375,667)
    driver.manage().window().setPosition(0,0)
    done()
  })
}

function login (name, password) {
  it('should navigate ' + name + ' to front page', function(done) {
    driver.get('http://localhost:1337/')
      .then(() => driver.getTitle())
      .then(title => title.should.equal('bighouse'))
      .then(() => done())
      .catch(error => done(error))
	})

  it('should log ' + name + ' in', function(done) {
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
}

function clickExpect (driver, name, buttonPath, expectText) {
  it('should have ' + name + ' click "'+buttonPath+'" and expect "'+expectText+'"', function(done) {
    driver
      .wait(until.elementLocated(By.xpath(buttonPath)))
      .then(elem => elem.click())
    driver
      .wait(until.elementLocated(By.xpath("//*[contains(text(), '"+expectText+"')]")))
      .then(() => done())
      .catch(error => done(error))
	})
}

function startGame (password) {
  function navigate (buttonPath, expectText) {
    clickExpect(driver,name,buttonPath,expectText)
  }

  it('should start ' + name + '\'s game', function(done) {
    driver.findElement(By.xpath('//*[@class="event" and ./div/text()="AI test"]//div[@class="button"]')).click()
      .then(() => done())
      .catch(error => done(error))
  })
}

function waitForCardText (cardText) {
  it('should wait until '+name+'\'s top card contains "'+cardText+'"', function(done) {
    driver
      .wait(until.elementLocated(By.xpath("//li[contains(@class,'topcard')]/span[contains(text(), '"+cardText+"')]")))
      .then(elem => done())
      .catch(error => done(error))
  })
}

function makeMove (cardText, menuText, dir) {
  if (!dir) {
    dir = menuText
    menuText = undefined
  }

  waitForCardText (cardText)

  it('should wait until '+name+'\'s thrown-card animation completes', function(done) {
    driver
      .wait (function() {
	return driver.findElements(By.className('thrown')).then (function(elements) {
          return elements.length === 0
        })
      })
      .then(elem => { done() })
      .catch(error => done(error))
  })

  if (menuText) {
    it('should have '+name+' click menu item containing "'+menuText+'"', function(done) {
      driver.findElement(By.xpath("//*[contains(text(), '"+menuText+"')]")).click()
      done()
    })
  }

  var choiceClass = (dir === 'left' ? 'choice1' : 'choice2')
  it('should have '+name+' click '+dir, function(done) {
    driver
      .wait(until.elementLocated(By.xpath("//*[@class='"+choiceClass+"']/div/a")))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
  })
}

function waitForNavBar (obj) {
  it('should wait for '+name+'\'s navbar', function(done) {
    driver
      .wait(until.elementLocated(By.xpath("//div[@class='navbar']")))
      .then(() => done())
      .catch(error => done(error))
  })
}

function quit() {
  it('should quit ' + name, function(done) {
    driver.quit()
      .then(() => done())
      .catch(error => done(error))
	})
}

describe("one-player game", function() {

  createDriver('chrome')
  login (name, "test")
  startGame()
  
  makeMove ("So, you think you can beat me", "Easily", "right")
  makeMove ("Such arrogance", "right")
  makeMove ("You will NEVER beat me", "left")
  makeMove ("Dammit", "right")
  makeMove ("Just tell me how", "left")
  makeMove ("DAMMIT", "right")
  makeMove ("Game over", "right")

  waitForNavBar()
  
  quit()
})
