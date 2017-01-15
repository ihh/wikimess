'use strict';

// from here:
//  http://markbirbeck.com/2015/12/11/using-selenium-webdriver-with-mocha/

let webdriver = require('selenium-webdriver')
let By = webdriver.By
let until = webdriver.until

let fredDriver = new webdriver.Builder()
    .forBrowser('chrome')
    .build()
fredDriver.manage().window().setSize(375,667)
fredDriver.manage().window().setPosition(0,0)

let sheilaDriver = new webdriver.Builder()
    .forBrowser('chrome')
    .build()
sheilaDriver.manage().window().setSize(375,667)
sheilaDriver.manage().window().setPosition(375,0)

function login (driver, name, password) {
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

  return { name: name, driver: driver }
}

function startGame (obj, password) {
  var driver = obj.driver
  var name = obj.name

  function navigate (buttonName, expectText) {
    it('should have ' + name + ' click "'+buttonName+'" and expect "'+expectText+'"', function(done) {
      driver.findElement(By.name(buttonName)).click()
      driver
	.wait(until.elementLocated(By.xpath("//*[contains(text(), '"+expectText+"')]")))
	.then(function() {
	  setTimeout (done, 250)  // leave enough time to see what's happening
	})
	.catch(error => done(error))
    })
  }

  navigate('link-2','self-important porter')
  navigate('buy-robe','The porter nods approvingly')
  navigate('link-3','standing in the lobby')
  navigate('link-6','Want to cut class?')

  it('should start ' + name + '\'s game', function(done) {
    driver.findElement(By.name('event-1')).click()
	.then(() => done())
	.catch(error => done(error))
  })
}

function makeMove (obj, cardText, menuText, dir) {
  var driver = obj.driver
  var name = obj.name
  var cardElem
  
  if (!dir) {
    dir = menuText
    menuText = undefined
  }

  it('should find a card containing "'+cardText+'" in '+name+'\'s page', function(done) {
    driver.wait(until.elementLocated(By.xpath("//*[contains(text(), '"+cardText+"')]")))
      .then(elem => { cardElem = elem; done() })
      .catch(error => done(error))
  })

  it('should wait until card in '+name+'\'s page is visible', function(done) {
    driver.wait(until.elementIsVisible(cardElem))
      .then(() => done())
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

  it('should wait for '+name+'\'s card to disappear', function(done) {
    driver
      .wait(until.stalenessOf(cardElem))
      .then(() => done())
      .catch(error => done(error))
  })
}

function quit (obj) {
  var driver = obj.driver
  var name = obj.name

  it('should quit ' + name, function(done) {
    driver.quit()
      .then(() => done())
      .catch(error => done(error))
	})
}

describe("two-player game", function() {
  var fred = login (fredDriver, "fred", "test")
  var sheila = login (sheilaDriver, "sheila", "test")

  startGame (fred)
  startGame (sheila)
  
  makeMove (fred, "Here we are on day 1 of school", "left")
  makeMove (sheila, "Here we are on day 1 of school", "left")

  makeMove (fred, "Do you want to play truant", "left")
  makeMove (sheila, "Do you want to play truant", "left")

  makeMove (fred, "You decide to rat them out", "left")
  makeMove (sheila, "You decide to rat them out", "left")

  makeMove (fred, "pretty low", "left")
  makeMove (sheila, "pretty low", "right")

  makeMove (fred, "even admit", "left")
  makeMove (sheila, "At least you admit it", "right")

  quit (fred)
  quit (sheila)
})
