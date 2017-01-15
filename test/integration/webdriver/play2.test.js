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
sheilaDriver.manage().window().setPosition(400,0)

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
	  done()
	  //	  setTimeout (done, 250)  // leave enough time to see what's happening
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
  
  if (!dir) {
    dir = menuText
    menuText = undefined
  }

  it('should wait until '+name+'\'s top card contains "'+cardText+'"', function(done) {
    driver
      .wait(until.elementLocated(By.xpath("//li[contains(@class,'topcard')]/span[contains(text(), '"+cardText+"')]")))
      .then(elem => done())
      .catch(error => done(error))
  })

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

function quit (obj) {
  var driver = obj.driver
  var name = obj.name

  it('should quit ' + name, function(done) {
    driver.quit()
      .then(() => done())
      .catch(error => done(error))
	})
}

function makeDDMove (fred, sheila, text1, text2) {
  makeMove (fred, "Do you want to play truant", "left")
  makeMove (sheila, "Do you want to play truant", "left")
  
  makeMove (fred, "You decide to rat them out", "left")
  makeMove (sheila, "You decide to rat them out", "left")

  makeMove (fred, "pretty low", "left")
  makeMove (sheila, "pretty low", "right")

  makeMove (fred, "even admit", "left")
  makeMove (sheila, "At least you admit it", "right")

  makeMove (fred, "Just saying", "right")
  makeMove (sheila, "Just saying", "right")

  makeMove (fred, text1, "right")
  makeMove (sheila, text1, "right")

  makeMove (fred, text2, "right")
  makeMove (sheila, text2, "right")
}

describe("two-player game", function() {
  var fred = login (fredDriver, "fred", "test")
  var sheila = login (sheilaDriver, "sheila", "test")

  startGame (fred)
  startGame (sheila)
  
  makeMove (fred, "Here we are on day 1 of school", "left")
  makeMove (sheila, "Here we are on day 1 of school", "left")

  makeDDMove (fred, sheila, "goody two-shoes", "Too bad")
  
  makeMove (fred, "Here we are on day 2 of school", "right")
  makeMove (sheila, "Here we are on day 2 of school", "right")

  makeMove (fred, "Do you want to play truant", "right")
  makeMove (sheila, "Do you want to play truant", "right")

  makeMove (fred, "Shall we go to the beach", "right")
  makeMove (sheila, "Shall we go to the beach", "left")
  makeMove (sheila, "mall-rats", "right")

  makeMove (fred, "Party times", "right")
  makeMove (sheila, "Party times", "right")

  makeMove (fred, "Co-operation is great", "right")
  makeMove (sheila, "Co-operation is great", "right")

  makeMove (fred, "Want to have an ice cream", "right")
  makeMove (sheila, "Want to have an ice cream", "left")

  makeMove (sheila, "feel like it today", "left")

  makeMove (fred, "not everybody loves ice cream", "right")
  makeMove (sheila, "not everybody loves ice cream", "right")

  makeMove (fred, "Here we are on day 3 of school", "right")
  makeMove (sheila, "Here we are on day 3 of school", "right")

  makeDDMove (fred, sheila, "AGAIN", "This keeps happening")

  makeMove (fred, "Here we are on day 4 of school", "right")
  makeMove (sheila, "Here we are on day 4 of school", "right")

  makeMove (fred, "Do you want to play truant", "right")
  makeMove (sheila, "Do you want to play truant", "right")

  makeMove (fred, "Shall we go to the beach", "left")
  makeMove (fred, "mall-rats", "left")
  makeMove (sheila, "Shall we go to the beach", "right")

  makeMove (fred, "Party times", "right")
  makeMove (sheila, "Party times", "right")

  makeMove (fred, "Co-operation is great", "right")
  makeMove (sheila, "Co-operation is great", "right")
  
  makeMove (fred, "Want to have an ice cream", "right")
  makeMove (sheila, "Want to have an ice cream", "right")

  makeMove (fred, "I love ice cream", "right")
  makeMove (sheila, "I love ice cream", "right")

  makeMove (fred, "What flavor", "Chocolate", "right")
  makeMove (fred, "oh no", "right")
  makeMove (fred, "What flavor", "Chocolate", "right")
  makeMove (fred, "oh no", "right")
  makeMove (fred, "What flavor", "Vanilla", "right")
  makeMove (fred, "Excellent choice", "right")
  makeMove (fred, "You chose:  chocolate chocolate vanilla", "right")

  makeMove (sheila, "What flavor", "Strawberry", "right")
  makeMove (sheila, "Good choice", "right")
  makeMove (sheila, "You chose:  strawberry", "right")

  makeMove (fred, "Here we are on day 5 of school", "right")
  makeMove (sheila, "Here we are on day 5 of school", "right")

  makeDDMove (fred, sheila, "AGAIN", "This keeps happening")

  makeMove (fred, "Here we are on day 6 of school", "right")
  makeMove (sheila, "Here we are on day 6 of school", "right")

  makeMove (fred, "remember the ice cream", "left")
  makeMove (sheila, "remember the ice cream", "right")

  makeMove (fred, "You decide to rat them out", "left")
  makeMove (fred, "pretty low", "left")
  makeMove (fred, "even admit", "left")
  makeMove (fred, "Just saying", "right")

  makeMove (fred, "fred ratted sheila out", "right")
  makeMove (sheila, "fred ratted sheila out", "right")

  makeMove (fred, "Sorry, sheila...", "right")
  makeMove (sheila, "Sorry, sheila...", "right")

  makeMove (fred, "Here we are on day 7 of school", "right")
  makeMove (sheila, "Here we are on day 7 of school", "right")

  makeDDMove (fred, sheila, "AGAIN", "This keeps happening")

  makeMove (fred, "Here we are on day 8 of school", "right")
  makeMove (sheila, "Here we are on day 8 of school", "right")

  makeMove (fred, "remember the ice cream", "right")
  makeMove (sheila, "remember the ice cream", "left")

  makeMove (sheila, "You decide to rat them out", "left")
  makeMove (sheila, "pretty low", "left")
  makeMove (sheila, "even admit", "left")
  makeMove (sheila, "Just saying", "right")

  makeMove (fred, "sheila ratted fred out", "right")
  makeMove (sheila, "sheila ratted fred out", "right")

  makeMove (fred, "Sorry, fred...", "right")
  makeMove (sheila, "Sorry, fred...", "right")

  makeMove (fred, "Here we are on day 9 of school", "right")
  makeMove (sheila, "Here we are on day 9 of school", "right")

  makeMove (fred, "remember the ice cream", "right")
  makeMove (sheila, "remember the ice cream", "right")

  makeMove (fred, "skip class together", "left")
  makeMove (sheila, "skip class together", "right")

  makeMove (fred, "Party times", "right")
  makeMove (sheila, "Party times", "right")

  makeMove (fred, "Co-operation is great", "right")
  makeMove (sheila, "Co-operation is great", "right")

  makeMove (fred, "Game over", "right")
  makeMove (sheila, "Game over", "right")

  quit (fred)
  quit (sheila)
})
