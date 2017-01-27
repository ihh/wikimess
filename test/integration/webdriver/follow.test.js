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

  enterName (obj, name)
  
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

function backspaces (text) {
  return new Array(text.length).fill(Key.BACK_SPACE).join('')
}

function replaceInputText (obj, path, oldText, newText) {
  it('should find "'+oldText+'" in '+path+' for #' + obj.count, function(done) {
    obj.driver.findElement(By.xpath(path))
      .then(elem => elem.getAttribute('value'))
      .then(text => text.should.equal(oldText))
      .then(()=>done())
      .catch(error => done(error))
        })

  it('should delete "'+oldText+'" and replace with "' + newText + '"', function(done) {
    obj.driver.findElement(By.xpath(path))
      .then (function (input) {
        input.sendKeys(backspaces(oldText) + newText)
        obj.driver.wait(function() {
          return input.getAttribute('value')
            .then (function (text) {
              return text === newText
            })
        })
      }).then(()=>done())
      .catch(error => done(error))
        })
}

function enterName (obj, name) {
  (function (lastName) {
    replaceInputText (obj, "//input[@name='player']", lastName, name)
    obj.lastName = name
  }) (obj.lastName)
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

function waitForText (obj, text) {
  it('should wait until #'+obj.count+"\'s page contains '"+text+"'", function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//*[contains(text(),'"+text+"')]")))
      .then(() => done())
      .catch(error => done(error))
  })
}

function checkPathAbsent (obj, absentPath) {
  it("should not find '"+absentPath+"' on #"+obj.count+"\'s page ", function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath(absentPath)), 100)
      .then(() => done(new Error("fail")), () => done())
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

function startGame (obj) {
  it('should start #' + obj.count + "\'s game", function(done) {
    obj.driver.findElement(By.xpath('//*[@class="event" and ./div/text()="Single scene"]//div[@class="button"]')).click()
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

function clickStatus (obj, className, expect) {
  it('should have #'+obj.count+' click on element $(".'+className+'")', function(done) {
    obj.driver
      .wait(until.elementLocated(By.className(className)))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
	})
  waitForText (obj, expect)
}

function clickFollowButton (obj, oldButtonText, newButtonText) {
  clickExpect (obj, "//div[contains(@class,'button') and text()='"+oldButtonText+"']", newButtonText)
  checkFollowButtonAbsent (obj, oldButtonText)
}

function exitStatus (obj) {
  it('should have #'+obj.count+' click "Back"', function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//div[@class='backbar']/span/a[text()='Back']")))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
	})
}

function clickFollowsTab (obj) {
  clickExpect (obj, "//div[@class='navbar']/span[contains(@class,'nav-follows')]", "Recently played")
}

function checkFollowButtonAbsent (obj, buttonText) {
  checkPathAbsent (obj, "//div[contains(@class,'button') and text()='"+buttonText+"']")
}

function clickFollowSectionButton (obj, section, oldButtonText, newButtonText) {
  clickExpect (obj, "//div[@class='followsection' and ./div/text()='"+section+"']//div[contains(@class,'button') and text()='"+oldButtonText+"']", newButtonText)
  checkFollowButtonAbsent (obj, oldButtonText)
}

function countAvatars (obj, n) {
  it('should find '+n+' avatars on #'+obj.count+"'s page", function(done) {
    obj.driver.findElements(By.xpath("//div[@class='follow']"))
      .then(elems => elems.length)
      .then(len => len.should.equal(n))
      .then(()=>done())
      .catch(error => done(error))
    })
}

function clickAvatar (obj, section, text) {
  clickExpect (obj, "//div[@class='followsection' and ./div/text()='"+section+"']//div[contains(@class,'avatar')]", text)
}

describe("follow", function() {
  var fred = create ('chrome')
  login (fred, 'fred', 'test')

  var sheila = create ('chrome')
  login (sheila, 'sheila', 'test')

  startGame (fred)
  startGame (sheila)

  makeMove (fred, "only card", "right")
  makeMove (sheila, "only card", "left")

  waitForThrowToFinish (sheila)
  clickStatus (sheila, 'rightmood', 'Days')
  clickFollowButton (sheila, 'Follow', 'Unfollow')
  exitStatus (sheila)
  
  makeMove (fred, "Sucker", "right")
  makeMove (sheila, "OK", "left")

  makeMove (fred, "Game over", "right")
  makeMove (sheila, "Game over", "left")

  clickFollowsTab (fred)
  countAvatars (fred, 2)

  clickFollowSectionButton (fred, 'Recently played', 'Follow', 'Unfollow')
  countAvatars (fred, 3)

  clickFollowsTab (sheila)
  countAvatars (sheila, 3)

  clickFollowSectionButton (sheila, 'Followers', 'Unfollow', 'Follow')
  countAvatars (sheila, 3)

  clickAvatar (fred, 'Following', 'Days')
  clickFollowButton (fred, 'Unfollow', 'Follow')
  exitStatus (fred)
  checkFollowButtonAbsent (fred, 'Unfollow')

  quit (fred)
  quit (sheila)
})
