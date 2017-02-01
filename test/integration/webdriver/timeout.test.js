'use strict';

// from here:
//  http://markbirbeck.com/2015/12/11/using-selenium-webdriver-with-mocha/

let webdriver = require('selenium-webdriver')
let By = webdriver.By
let until = webdriver.until
let Key = webdriver.Key

var driverCount = 0
var width = 375, height = 667
function create (driverType) {
  var xpos = driverCount * 400
  var obj = { count: ++driverCount, xpos: xpos, lastName: '' }

  it('should open ' + driverType + ' browser #' + obj.count + ' at ('+xpos+',0)', function(done) {
    obj.driver = new webdriver.Builder()
      .forBrowser(driverType)
      .build()
    obj.driver.manage().window().setSize(width,height)
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

function waitForPath (obj, path) {
  it('should wait until #'+obj.count+"\'s page contains '"+path+"'", function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath(path)))
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

function clickMenuItem (obj, menuText) {
  it('should have #'+obj.count+' click menu item containing "'+menuText+'"', function(done) {
    obj.driver.findElement(By.xpath("//label[contains(@class,'cardmenulabel')]//*[contains(text(), '"+menuText+"')]")).click()
    done()
  })
}

function selectMenuItem (obj, cardText, menuText) {
  waitForCardText (obj, cardText)
  waitForThrowToFinish (obj)
  clickMenuItem (obj, menuText)
}

function clickDir (obj, dir) {
  var choiceClass = (dir === 'left' ? 'choice1' : 'choice2')
  it('should have #'+obj.count+' click '+dir, function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//*[contains(@class,'"+choiceClass+"') and not(contains(@style,'display:'))]/div/a")))
      .then(elem => { elem.click(); done() })
      .catch(error => done(error))
  })
}

function swipeDir (obj, dir) {
  it('should have #'+obj.count+' swipe '+dir, function(done) {
    var xOffset = Math.round ((dir === 'left') ? (-width/2) : (width/2))
    var offset = { x: xOffset, y: 0 }
    obj.driver.findElement(By.className('topcard'))
      .then (function (topcard) {
        return obj.driver.actions().mouseDown(topcard).mouseMove(offset).mouseUp()
          .perform()
      }).then (() => done())
      .catch(error => done(error))
        })
}

function waitForTimeout (obj) {
  waitForPath (obj, "//*[contains(@class,'topcard')]//span[contains(@class,'historytag') and not(contains(@style,'display:')) and text()='Time limit exceeded']")
}

function waitSeconds (n) {
  it('should wait '+n+' seconds', function (done) {
    setTimeout (done, n*1000)
  })
}

function countHistoryCards (obj, n) {
  it('should find #'+obj.count+' has '+n+' history cards', function(done) {
    obj.driver.findElements(By.xpath("//div[contains(@class,'cardtable')]//li[contains(@class,'history')]"))
      .then(elems => elems.length)
      .then(len => len.should.equal(n))
      .then(() => done())
      .catch(error => done(error))
  })
}

function makeMove (obj, cardText, menuText, dir) {
  if (!dir) {
    dir = menuText
    menuText = undefined
  }

  waitForThrowToFinish (obj)
  waitForCardText (obj, cardText)

  if (menuText)
    clickMenuItem (obj, menuText)

  if (dir.match(/^swipe-/))
    swipeDir (obj, dir.replace('swipe-',''))
  else
    clickDir (obj, dir)
}

function clickEventButton (obj, title) {
  it('should start #' + obj.count + '\'s game', function(done) {
    obj.driver.findElement(By.xpath('//*[@class="event" and ./div/text()="'+title+'"]//div[@class="button"]')).click()
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

describe("timeout", function() {
  var fred = create ('chrome')
  frontpage (fred)
  login (fred, 'fred', 'test')

  var sheila = create ('chrome')
  frontpage (sheila)
  login (sheila, 'sheila', 'test')

  clickEventButton (fred, 'Timeout test')
  clickEventButton (sheila, 'Timeout test')

  makeMove (fred, 'A timeout test that exits with a menu selection', 'A', 'swipe-right')
  makeMove (sheila, 'A timeout test that exits with a menu selection', 'C', 'swipe-left')

  makeMove (fred, 'You chose A', 'swipe-left')
  makeMove (sheila, 'You chose C', 'swipe-right')

  selectMenuItem (fred, 'A timeout test that exits with a menu selection', 'A')
  selectMenuItem (sheila, 'A timeout test that exits with a menu selection', 'C')

  waitForTimeout (fred)
  waitForTimeout (sheila)
  countHistoryCards (sheila, 2)

  swipeDir (fred, 'right')
  swipeDir (sheila, 'right')

  makeMove (fred, 'You chose A', 'right')
  makeMove (sheila, 'You chose C', 'right')

  waitForTimeout (fred)
  waitForTimeout (sheila)

  clickDir (fred, 'right')
  clickDir (sheila, 'right')

  makeMove (fred, 'You chose B', 'right')
  makeMove (sheila, 'You chose B', 'right')

  waitForTimeout (fred)
  waitForTimeout (sheila)

  countHistoryCards (sheila, 2)
  waitSeconds (4)
  countHistoryCards (sheila, 4)
  
  makeMove (fred, 'A timeout test that exits with a swipe', 'swipe-left')
  makeMove (sheila, 'A timeout test that exits with a swipe', 'swipe-left')

  makeMove (fred, 'You swiped right', 'left')
  makeMove (sheila, 'You swiped right', 'left')
  
  makeMove (fred, 'A timeout test that exits with a swipe', 'swipe-left')
  makeMove (sheila, 'A timeout test that exits with a swipe', 'swipe-left')

  makeMove (fred, 'You swiped right', 'left')
  makeMove (sheila, 'You swiped right', 'left')

  waitForCardText (fred, 'A timeout test that exits with a Next')
  waitForCardText (sheila, 'A timeout test that exits with a Next')
  
  waitForTimeout (fred)
  waitForTimeout (sheila)

  clickDir (fred, 'right')
  clickDir (sheila, 'left')
  
  makeMove (fred, 'What did you expect', 'left')
  makeMove (sheila, 'What did you expect', 'right')

  makeMove (fred, 'A timeout test that exits with a Next', 'left')
  makeMove (sheila, 'A timeout test that exits with a Next', 'right')

  makeMove (fred, 'What did you expect', 'right')
  makeMove (sheila, 'What did you expect', 'left')

  makeMove (fred, 'Game over', 'left')
  makeMove (sheila, 'Game over', 'right')

  quit (sheila)
  quit (fred)
})
