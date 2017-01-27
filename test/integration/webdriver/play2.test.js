'use strict';

// from here:
//  http://markbirbeck.com/2015/12/11/using-selenium-webdriver-with-mocha/

let webdriver = require('selenium-webdriver')
let By = webdriver.By
let until = webdriver.until

function login (driverType, xpos, name, password) {
  var obj = { name: name }

  it('should create a ' + driverType + ' webdriver for ' + name + ' at ('+xpos+',0)', function(done) {
    obj.driver = new webdriver.Builder()
      .forBrowser(driverType)
      .build()
    obj.driver.manage().window().setSize(375,667)
    obj.driver.manage().window().setPosition(xpos,0)
    done()
  })

  it('should navigate ' + name + ' to front page', function(done) {
    obj.driver.get('http://localhost:1337/')
      .then(() => obj.driver.getTitle())
      .then(title => title.should.equal('bighouse'))
      .then(() => done())
      .catch(error => done(error))
	})

  it('should log ' + name + ' in', function(done) {
    obj.driver.findElement(By.name('player')).sendKeys(name)
    obj.driver.findElement(By.name('password')).sendKeys(password)
    obj.driver.findElement(By.xpath("//*[contains(text(), 'Log in')]")).click()
    obj.driver
      .wait(until.elementLocated(By.className('title')))
      .then(elem => elem.getText())
      .then(text => text.should.equal('Outside WizCom'))
      .then(() => done())
      .catch(error => done(error))
	})

  return obj
}

function clickExpect (obj, buttonPath, expectText) {
  it('should have ' + obj.name + ' click "'+buttonPath+'" and expect "'+expectText+'"', function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath(buttonPath)))
      .then(elem => elem.click())
    obj.driver
      .wait(until.elementLocated(By.xpath("//*[contains(text(), '"+expectText+"')]")))
      .then(() => done())
      .catch(error => done(error))
	})
}

function startGame (obj, password) {
  function navigate (buttonPath, expectText) {
    clickExpect(obj,buttonPath,expectText)
  }

  navigate('//*[@class="link" and ./div/text()="Lobby"]/div[@class="button"]','self-important porter')
  navigate('//*[text()="Take"]','The porter nods approvingly')
  navigate('//*[text()="Go"]','standing in the lobby')
  navigate('//*[@class="link" and ./div/text()="Student Union"]/div[@class="button"]','Want to cut class?')

  it('should start ' + obj.name + "\'s game", function(done) {
    obj.driver.findElement(By.xpath('//*[text()="Start"]')).click()
	.then(() => done())
	.catch(error => done(error))
  })
}

function waitForText (obj, text) {
  it('should wait until '+obj.name+"\'s page contains '"+text+"'", function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//*[contains(text(),'"+text+"')]")))
      .then(() => done())
      .catch(error => done(error))
  })
}

function waitForCardText (obj, cardText) {
  it('should wait until '+obj.name+"\'s top card contains '"+cardText+"'", function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//li[contains(@class,'topcard')]/span[contains(text(), '"+cardText+"')]")))
      .then(elem => done())
      .catch(error => done(error))
  })
}

function waitForThrowToFinish (obj) {
  it("should wait until "+obj.name+"\'s thrown-card animation completes", function(done) {
    obj.driver
      .wait (function() {
	return obj.driver.findElements(By.className('thrown')).then (function(elements) {
          return elements.length === 0
        })
      })
      .then(elem => { done() })
      .catch(error => done(error))
  })
}

function makeMove (obj, cardText, menuText, dir) {
  if (!dir) {
    dir = menuText
    menuText = undefined
  }

  waitForCardText (obj, cardText)
  waitForThrowToFinish (obj)

  if (menuText) {
    it('should have '+obj.name+' click menu item containing "'+menuText+'"', function(done) {
      obj.driver.findElement(By.xpath("//*[contains(text(), '"+menuText+"')]")).click()
      done()
    })
  }

  var choiceClass = (dir === 'left' ? 'choice1' : 'choice2')
  it('should have '+obj.name+' click '+dir, function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//*[@class='"+choiceClass+"']/div/a")))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
  })
}

function testDisabled (obj, cardText, linkText) {
  waitForCardText (obj, cardText)
  waitForThrowToFinish (obj)
  it("should find a disabled link on "+obj.name+"\'s page containing text '"+linkText+"'", function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//span[@class='disabled']/strike[contains(text(),'"+linkText+"')]")))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
  })
}

function checkTextAbsent (obj, absentText) {
  it("should not find '"+absentText+"' on "+obj.name+"\'s page ", function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//*[contains(text(),'"+absentText+"')]")), 100)
      .then(() => done(new Error("fail")), () => done())
      .catch(error => done(error))
  })
}

function roundTripToMenu (obj, startText, endText) {
  waitForCardText (obj, startText)
  it('should have '+obj.name+' click "Back"', function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//div[@class='statuslink']/span/a[text()='Back']")))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
	})
  it('should have '+obj.name+' click on "Active games"', function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//div[@class='navbar']/span[contains(@class,'nav-games')]")))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
  })
  clickExpect(obj,'//*[text()="Go"]',endText)
}

function testStatus (obj, className, presents, absents) {
  it('should have '+obj.name+' click on element $(".'+className+'")', function(done) {
    obj.driver
      .wait(until.elementLocated(By.className(className)))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
	})
  presents.forEach (function (text) { waitForText (obj, text) })
  absents.forEach (function (text) { checkTextAbsent (obj, text) })
  it('should have '+obj.name+' click "Back"', function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//div[@class='backbar']/span/a[text()='Back']")))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
	})
}
  
function waitForNavBar (obj) {
  it("should wait for "+obj.name+"\'s navbar", function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//div[@class='navbar']")))
      .then(() => done())
      .catch(error => done(error))
  })
}

function quit (obj) {
  it('should quit ' + obj.name, function(done) {
    obj.driver.quit()
      .then(() => done())
      .catch(error => done(error))
	})
}

function makeDDMove (fred, sheila, text1f, text1s, text2) {
  makeMove (fred, "Do you want to play truant", "left")
  makeMove (sheila, "Do you want to play truant", "left")
  
  makeMove (fred, "You decide to rat them out", "left")
  makeMove (sheila, "You decide to rat them out", "left")

  makeMove (fred, "pretty low", "left")
  makeMove (sheila, "pretty low", "right")

  makeMove (fred, "even admit", "left")
  makeMove (sheila, "At least you admit it", "right")

  makeMove (fred, text1f, "right")
  makeMove (sheila, text1s, "right")

  makeMove (fred, text2, "right")
  makeMove (sheila, text2, "right")
}

var moodNum = {happy:1, surprised:2, sad:3, angry:4}
function testMood (sender, recipient, mood) {
  it('should see '+sender.name+'\'s '+mood+' avatar on '+recipient.name+'\'s page', function(done) {
    recipient.driver
      .wait(until.elementLocated(By.xpath("//div[@class='rightmood']/div[@class='moodcontainer mood-"+mood+"']")))
      .then(() => done())
      .catch(error => done(error))
  })
}

function changeMood (sender, recipient, mood) {
  var n = moodNum[mood]
  it("should change "+sender.name+"\'s mood to "+mood, function(done) {
    sender.driver
      .wait(until.elementLocated(By.xpath("//div[@class='moodbutton mood"+n+"']")))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
  })
  testMood (sender, recipient, mood)
}

describe("two-player game", function() {
  var fred = login ('chrome', 0, "fred", "test")
  var sheila = login ('chrome', 400, "sheila", "test")

  startGame (sheila)
  waitForText (sheila, "Cancel")
  startGame (fred)

  testMood (fred, sheila, 'happy')
  testMood (sheila, fred, 'happy')

  makeMove (fred, "Here we are, fred and sheila: the first day of school", "left")
  makeMove (sheila, "Here we are, fred and sheila: the first day of school", "left")

  changeMood (fred, sheila, 'sad')
  changeMood (sheila, fred, 'surprised')
  
  makeDDMove (fred, sheila, "You and sheila", "You and fred", "Too bad")
  
  makeMove (fred, "Here we are, sheila and fred: the second day of school", "right")
  makeMove (sheila, "Here we are, sheila and fred: the second day of school", "right")

  changeMood (fred, sheila, 'angry')
  changeMood (sheila, fred, 'angry')
  
  roundTripToMenu (fred, "truant", "You and sheila")
  makeMove (fred, "You and sheila", "right")
  makeMove (fred, "Too bad", "right")
  makeMove (fred, "Here we are, sheila and fred: the second day of school", "right")

  makeMove (fred, "Do you want to play truant", "right")
  makeMove (sheila, "Do you want to play truant", "right")

  makeMove (fred, "Shall we go to the beach", "right")
  makeMove (sheila, "Shall we go to the beach", "left")
  makeMove (sheila, "mall-rats exposed to shopping for the 1st time", "left")
  testDisabled (sheila, "mall-rats exposed to shopping for the 2nd time", "More mall")
  makeMove (sheila, "mall-rats exposed to shopping for the 2nd time", "right")

  waitForCardText (fred, "Party times")
  waitForCardText (sheila, "Party times")
  testMood (fred, sheila, 'happy')
  testMood (sheila, fred, 'happy')

  makeMove (fred, "Party times", "right")
  makeMove (sheila, "Party times", "right")

  makeMove (fred, "Want to have an ice cream", "right")
  makeMove (sheila, "Want to have an ice cream", "left")

  makeMove (sheila, "feel like it today", "left")

  makeMove (fred, "not everybody loves ice cream", "right")
  makeMove (sheila, "not everybody loves ice cream", "right")

  makeMove (fred, "Here we are, sheila and fred: day 3 of school", "right")
  makeMove (sheila, "Here we are, sheila and fred: day 3 of school", "right")

  testMood (fred, sheila, 'surprised')
  testMood (sheila, fred, 'happy')

  makeDDMove (fred, sheila, "AGAIN", "AGAIN", "This keeps happening")

  makeMove (fred, "Here we are, fred and sheila: day 4 of school", "right")
  makeMove (sheila, "Here we are, fred and sheila: day 4 of school", "right")

  makeMove (fred, "Do you want to play truant", "right")
  makeMove (sheila, "Do you want to play truant", "right")

  makeMove (fred, "Shall we go to the beach", "left")
  makeMove (fred, "mall-rats", "right")
  makeMove (sheila, "Shall we go to the beach", "right")

  makeMove (fred, "Party times", "right")
  makeMove (sheila, "Party times", "right")
  
  makeMove (fred, "Want to have an ice cream", "right")
  makeMove (sheila, "Want to have an ice cream", "right")

  makeMove (fred, "I love ice cream", "right")
  makeMove (sheila, "I love ice cream", "right")

  makeMove (fred, "What flavor", "Chocolate", "right")
  makeMove (fred, "oh no", "right")

  waitForCardText (fred, "What flavor")
  checkTextAbsent (fred, "Strawberry")

  makeMove (fred, "What flavor? (2nd try)", "Chocolate", "right")
  makeMove (fred, "oh no", "right")
  testDisabled (fred, "What flavor", "Chocolate")
  makeMove (fred, "What flavor? (3rd try)", "Vanilla", "right")
  makeMove (fred, "Excellent choice", "right")
  makeMove (fred, "You chose: chocolate, chocolate, and vanilla", "right")

  makeMove (sheila, "What flavor", "Strawberry", "right")
  makeMove (sheila, "Good choice", "right")
  makeMove (sheila, "You chose: strawberry", "right")

  makeMove (fred, "Here we are, fred and sheila: day 5 of school", "right")
  makeMove (sheila, "Here we are, fred and sheila: day 5 of school", "right")
  
  makeDDMove (fred, sheila, "AGAIN", "AGAIN", "This keeps happening")

  makeMove (fred, "Here we are, sheila and fred: day 6 of school", "right")
  makeMove (sheila, "Here we are, sheila and fred: day 6 of school", "right")

  testStatus (sheila, 'leftmood', ['sheila', '99 credits', 'robe', '5/7'], [])
  testStatus (sheila, 'rightmood', ['fred', 'robe', '5/7'], ['99 credits'])

  makeMove (fred, "remember the ice cream", "left")
  makeMove (sheila, "remember the ice cream", "right")

  makeMove (fred, "You decide to rat them out", "left")
  makeMove (fred, "pretty low", "left")
  makeMove (fred, "even admit", "left")

  makeMove (fred, "fred ratted sheila out", "right")
  makeMove (sheila, "fred ratted sheila out", "right")

  makeMove (fred, "Sorry, sheila...", "right")
  makeMove (sheila, "Sorry, sheila...", "right")

  makeMove (sheila, "How do you feel", "right")

  makeMove (fred, "sheila is OK", "right")
  makeMove (sheila, "sheila is OK", "right")

  makeMove (fred, "Here we are, sheila and fred: day 7 of school", "right")
  makeMove (sheila, "Here we are, sheila and fred: day 7 of school", "right")

  makeDDMove (fred, sheila, "AGAIN", "AGAIN", "This keeps happening")

  makeMove (fred, "Here we are, fred and sheila: day 8 of school", "right")
  makeMove (sheila, "Here we are, fred and sheila: day 8 of school", "right")

  makeMove (fred, "remember the ice cream", "right")
  makeMove (sheila, "remember the ice cream", "left")

  makeMove (sheila, "You decide to rat them out", "left")
  makeMove (sheila, "pretty low", "left")
  makeMove (sheila, "even admit", "left")

  makeMove (fred, "sheila ratted fred out", "right")
  makeMove (sheila, "sheila ratted fred out", "right")

  makeMove (fred, "Sorry, fred...", "right")
  makeMove (sheila, "Sorry, fred...", "right")

  makeMove (fred, "How do you feel", "left")
  makeMove (fred, "How mad", "left")

  makeMove (fred, "fred is fuming", "right")
  makeMove (sheila, "fred is fuming", "right")

  makeMove (fred, "Here we are, fred and sheila: day 9 of school", "right")
  makeMove (sheila, "Here we are, fred and sheila: day 9 of school", "right")

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

  waitForNavBar (fred)
  waitForNavBar (sheila)
  
  quit (fred)
  quit (sheila)

})
