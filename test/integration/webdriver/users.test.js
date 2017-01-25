'use strict';

// from here:
//  http://markbirbeck.com/2015/12/11/using-selenium-webdriver-with-mocha/

let webdriver = require('selenium-webdriver')
let By = webdriver.By
let until = webdriver.until
let Key = webdriver.Key

var driverCount = 0
function create (driverType) {
  var xpos = driverCount * 400
  var obj = { count: ++driverCount, xpos: xpos, lastName: '' }

  it('should open ' + driverType + ' browser #' + obj.count + ' at ('+xpos+',0)', function(done) {
    obj.driver = new webdriver.Builder()
      .forBrowser(driverType)
      .build()
    obj.driver.manage().window().setSize(375,667)
    obj.driver.manage().window().setPosition(xpos,0)
    done()
  })

  return obj
}

function frontpage (obj) {
  it('should navigate #' + obj.count + ' to front page', function(done) {
    obj.driver.get('http://localhost:1337/')
      .then(() => obj.driver.getTitle())
      .then(title => title.should.equal('bighouse'))
      .then(() => done())
      .catch(error => done(error))
	})
}

function login (obj, name, password) {
  frontpage (obj)

  changeName (obj, name)
  
  it('should log #' + obj.count + ' in as ' + name, function(done) {
    obj.driver.findElement(By.name('password')).sendKeys(password)
    obj.driver.findElement(By.xpath("//*[contains(text(), 'Log in')]")).click()
    obj.driver
      .wait(until.elementLocated(By.className('title')))
      .then(elem => elem.getText())
      .then(text => text.should.equal('Outside WizCom'))
      .then(() => done())
      .catch(error => done(error))
	})
}

function changeName (obj, name) {
  (function (lastName) {
    it('should find "'+lastName+'" in the name field for #' + obj.count, function(done) {
      obj.driver.findElement(By.name('player'))
        .then(elem => elem.getAttribute('value'))
        .then(text => text.should.equal(lastName))
        .then(()=>done())
        .catch(error => done(error))
          })

    var lastNameLen = lastName.length
    var backspaces = new Array(lastNameLen).fill(Key.BACK_SPACE).join('')

    it('should delete "'+lastName+'" and replace with "' + name + '"', function(done) {
      obj.driver.findElement(By.name('player')).sendKeys(backspaces + name)
      obj.driver.findElement(By.name('player'))
        .then(elem => elem.getAttribute('value'))
        .then(text => text.should.equal(name))
        .then(()=>done())
        .catch(error => done(error))
          })

    obj.lastName = name
  }) (obj.lastName)
}

function signup (obj, name, password) {
  frontpage (obj)

  changeName (obj, name)

  it('should sign up #' + obj.count + ' as ' + name, function(done) {
    obj.driver.findElement(By.name('password')).sendKeys(password)
    obj.driver.findElement(By.xpath("//*[contains(text(), 'Sign up')]")).click()
    obj.driver
      .wait(until.elementLocated(By.xpath("//*[contains(text(), 'Character settings')]")))
      .then(() => done())
      .catch(error => done(error))
	})

  clickExpect (obj, "//*[contains(text(), 'Later')]", "Outside WizCom")
}

function logout (obj) {
  clickExpect (obj, "//div[@class='navbar']/span[contains(@class,'nav-settings')]", "Themes")
  clickExpect (obj, "//*[contains(text(), 'Log out')]", "Sign up")
}

function clickExpect (obj, buttonPath, expectText) {
  it('should have #' + obj.count + ' click "'+buttonPath+'" and expect "'+expectText+'"', function(done) {
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

  it('should start #' + obj.count + "\'s game", function(done) {
    obj.driver.findElement(By.xpath('//*[text()="Start"]')).click()
	.then(() => done())
	.catch(error => done(error))
  })
}

function waitForText (obj, text) {
  it('should wait until #'+obj.count+"\'s page contains '"+text+"'", function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//*[contains(text(),'"+text+"')]")))
      .then(() => done())
      .catch(error => done(error))
  })
}

function waitForCardText (obj, cardText) {
  it('should wait until #'+obj.count+"\'s top card contains '"+cardText+"'", function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//li[contains(@class,'topcard')]/span[contains(text(), '"+cardText+"')]")))
      .then(elem => done())
      .catch(error => done(error))
  })
}

function waitForThrowToFinish (obj) {
  it("should wait until #"+obj.count+"\'s thrown-card animation completes", function(done) {
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
    it('should have #'+obj.count+' click menu item containing "'+menuText+'"', function(done) {
      obj.driver.findElement(By.xpath("//*[contains(text(), '"+menuText+"')]")).click()
      done()
    })
  }

  var choiceClass = (dir === 'left' ? 'choice1' : 'choice2')
  it('should have #'+obj.count+' click '+dir, function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//*[@class='"+choiceClass+"']/div/a")))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
  })
}

function testDisabled (obj, cardText, linkText) {
  waitForCardText (obj, cardText)
  waitForThrowToFinish (obj)
  it("should find a disabled link on #"+obj.count+"\'s page containing text '"+linkText+"'", function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//span[@class='disabled']/strike[contains(text(),'"+linkText+"')]")))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
  })
}

function checkTextAbsent (obj, absentText) {
  it("should not find '"+absentText+"' on #"+obj.count+"\'s page ", function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//*[contains(text(),'"+absentText+"')]")), 100)
      .then(() => done(new Error("fail")), () => done())
      .catch(error => done(error))
  })
}

function roundTripToMenu (obj, cardText) {
  waitForCardText (obj, cardText)
  it('should have #'+obj.count+' click "Back"', function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//div[@class='statuslink']/span/a[text()='Back']")))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
	})
  it('should have #'+obj.count+' click on "Active games"', function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//div[@class='navbar']/span[contains(@class,'nav-games')]")))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
  })
  clickExpect(obj,'//*[text()="Go"]',cardText)
}
  
function waitForNavBar (obj) {
  it("should wait for #"+obj.count+"\'s navbar", function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//div[@class='navbar']")))
      .then(() => done())
      .catch(error => done(error))
  })
}

function quit (obj) {
  it('should quit #' + obj.count, function(done) {
    obj.driver.quit()
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

describe("users", function() {
  var d = create ('chrome')

  signup (d, 'ted', 'test')
  logout (d)

  signup (d, 'mel', 'test')
  logout (d)

  quit (d)
})
