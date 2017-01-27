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

function signup (obj, name, password) {
  frontpage (obj)

  enterName (obj, name)

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

function changeDisplayName (obj, oldDisplayName, newDisplayName) {
  clickExpect (obj, "//div[@class='navbar']/span[contains(@class,'nav-settings')]", "Themes")
  clickExpect (obj, "//*[contains(text(), 'Name')]", "Player details")
  replaceInputText (obj, "//input", oldDisplayName, newDisplayName)
  clickExpect (obj, "//*[contains(text(), 'Back')]", "Themes")
}

function search (obj, lastSearchText, searchText, numResults) {
  clickExpect (obj, "//div[@class='navbar']/span[contains(@class,'nav-follows')]", "Following")

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

function moreSearchResults (obj, n) {
  it('should have #' + obj.count + ' click "More" and wait for it to go stale', function(done) {
    obj.driver
      .findElement(By.xpath("//div[@class='endresults']/span[@class='more']"))
      .then(elem => {
        elem.click()
        return obj.driver.wait(until.stalenessOf(elem))
      }).then(() => done())
      .catch(error => done(error))
    })
  it('should wait for more search results to appear', function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//div[@class='endresults']/span")))
      .then(() => done())
      .catch(error => done(error))
  })
  countSearchResults (obj, n)
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

function checkTextAbsent (obj, absentText) {
  it("should not find '"+absentText+"' on #"+obj.count+"\'s page ", function(done) {
    obj.driver
      .wait(until.elementLocated(By.xpath("//*[contains(text(),'"+absentText+"')]")), 100)
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

describe("search", function() {
  var d = create ('chrome')

  signup (d, 'ted', 'test')
  changeDisplayName (d, 'ted', 'Teddy')
  changeDisplayName (d, 'Teddy', 'Theodore')
  logout (d)

  signup (d, 'mel', 'test')
  logout (d)

  signup (d, 'pete', 'test')
  logout (d)

  signup (d, 'jean', 'test')
  logout (d)

  signup (d, 'ellen', 'test')
  logout (d)

  signup (d, 'meg', 'test')
  logout (d)

  login (d, 'fred', 'test')
  search (d, '', 'e', 3)
  moreSearchResults (d, 6)
  moreSearchResults (d, 7)
  
  quit (d)
})
