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

function clickActiveGames (obj) {
  clickExpect (obj, "//div[@class='navbar']/span[contains(@class,'nav-games')]", "active games")
}

function clickFollows (obj) {
  clickExpect (obj, "//div[@class='navbar']/span[contains(@class,'nav-follows')]", "Following")
}

function clickPlay (obj) {
  clickExpect (obj, "//div[@class='navbar']/span[contains(@class,'nav-play')]", "Outside WizCom")
}

function search (obj, lastSearchText, searchText, numResults) {
  clickFollows (obj)
  
  it('should find "'+lastSearchText+'" in the search field', function(done) {
      obj.driver.findElement(By.xpath('//input'))
        .then(elem => elem.getAttribute('value'))
        .then(text => text.should.equal(lastSearchText))
        .then(()=>done())
        .catch(error => done(error))
          })

  it('should enter "' + searchText + '"', function(done) {
    obj.driver.findElement(By.xpath('//input')).sendKeys(backspaces(lastSearchText) + searchText)
    obj.driver.findElement(By.xpath('//input'))
      .then(elem => elem.getAttribute('value'))
      .then(text => text.should.equal(searchText))
      .then(()=>done())
      .catch(error => done(error))
        })

  clickExpect (obj,"//div[@class='query']/span[contains(@class,'button')]", "Search results")
  countSearchResults (obj, numResults)
}

function countSearchResults (obj, n) {
  it('should find '+n+' search results', function(done) {
    obj.driver.findElements(By.xpath("//div[@class='search']/div/div/div[@class='follow']"))
      .then(elems => elems.length)
      .then(len => len.should.equal(n))
      .then(()=>done())
      .catch(error => done(error))
    })
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

function clickAvatar (obj, section, name, expectText) {
  it('should click avatar for '+name+' in #' + obj.count + "\'s " + section, function(done) {
    obj.driver.findElement(By.xpath('//div[@class="results" and ./div/text()="'+section+'"]/div[@class="follow" and ./div/text()="'+name+'"]/div[contains(@class,"avatar")]')).click()
      .then(() => done())
      .catch(error => done(error))
        })
  waitForText (obj, expectText)
}

function clickEventButton (obj, title, oldButtonText, newButtonText) {
  var oldButtonPath = "//div[@class='event' and ./div/text()='"+title+"']//div[contains(@class,'button') and not(contains(@style,'display:')) and text()='"+oldButtonText+"']"
  clickExpect (obj, oldButtonPath, newButtonText)
  checkPathAbsent (obj, oldButtonPath)
}

function waitForActiveGameCount (obj, n) {
  if (n === 0)
    waitForPath (obj, "//div[@class='gamecount' and contains(@style,'display')]")
  else
    waitForPath (obj, "//div[@class='gamecount' and text()='"+n+"']")
}

function clickBack (obj, expectText) {
  clickExpect (obj, '//a[text()="Back"]', expectText)
}

function clickGo (obj, expectText) {
  clickExpect (obj, '//*[contains(@class,"button") and text()="Go"]', expectText)
}

function clickSelectOther (obj, text, expectText) {
  clickExpect (obj, '//*[contains(@class,"selectother")]//*[text()="'+text+'"]', expectText)
}

function clickFollowSectionButton (obj, section, oldButtonText, newButtonText) {
  clickExpect (obj, "//div[@class='followsection' and ./div/text()='"+section+"']//div[contains(@class,'button') and text()='"+oldButtonText+"']", newButtonText)
  checkFollowButtonAbsent (obj, oldButtonText)
}

function checkFollowButtonAbsent (obj, buttonText) {
  checkPathAbsent (obj, "//div[contains(@class,'button') and text()='"+buttonText+"']")
}

function quit (obj) {
  it('should quit #' + obj.count, function(done) {
    obj.driver.quit()
      .then(() => done())
      .catch(error => done(error))
	})
}

describe("invite", function() {
  var jim = create ('chrome')
  var sheila = create ('chrome')

  frontpage (jim)
  frontpage (sheila)

  login (jim, 'jim', 'test')
  login (sheila, 'sheila', 'test')

  search (jim, '', 'sheila', 1)
  clickAvatar (jim, 'Search results', 'sheila', 'Games')
  clickEventButton (jim, 'Chat scene', 'Invite', 'Cancel')

  waitForActiveGameCount (sheila, 1)
  clickActiveGames (sheila)
  clickEventButton (sheila, 'Chat scene', 'Decline', 'Canceled')
  waitForActiveGameCount (sheila, 0)
  clickFollows (sheila)
  clickActiveGames (sheila)
  
  waitForText (jim, 'Canceled')
  clickBack (jim, 'Search results')
  clickAvatar (jim, 'Search results', 'sheila', 'Games')

  clickEventButton (jim, 'Chat scene', 'Invite', 'Cancel')
  waitForActiveGameCount (sheila, 1)
  clickEventButton (jim, 'Chat scene', 'Cancel', 'Canceled')

  waitForActiveGameCount (sheila, 0)
  clickFollows (sheila)
  clickActiveGames (sheila)

  clickBack (jim, 'Search results')
  clickAvatar (jim, 'Search results', 'sheila', 'Games')

  clickEventButton (jim, 'Chat scene', 'Invite', 'Cancel')
  clickEventButton (sheila, 'Chat scene', 'Accept', 'Go')
  clickGo (sheila, 'This is the only card')

  makeMove (jim, "only card", "right")
  makeMove (sheila, "only card", "left")

  makeMove (jim, "Game over", "right")
  makeMove (sheila, "Game over", "left")

  waitForActiveGameCount (sheila, 0)

  clickFollows (jim)
  clickFollowSectionButton (jim, 'Recently played', 'Follow', 'Unfollow')
  clickPlay (jim)
  
  clickEventButton (jim, 'Targetable', 'Start', 'Hide')
  clickSelectOther (jim, 'sheila', 'Cancel')
  
  waitForActiveGameCount (sheila, 1)
  clickActiveGames (sheila)
  clickEventButton (sheila, 'Targetable', 'Accept', 'Go')
  clickGo (sheila, 'So nice to see you')

  makeMove (jim, "So nice", "right")
  makeMove (sheila, "So nice", "left")

  makeMove (jim, "glad you agree", "right")
  makeMove (sheila, "not very nice", "left")

  makeMove (jim, "Game over", "right")
  makeMove (sheila, "Game over", "left")

  quit (sheila)
  quit (jim)
})
