# bighouse

## Installation

This works for me on my late-2014 iMac (OS X El Capitan 10.11.16)

    git submodule update --init --recursive
    brew install node
    brew install imagemagick@6
    brew link --force imagemagick@6
    brew install pkg-config
    npm install -g sails
    npm install
    sails lift

(Note that node's imagemagick-native package only works with version 6 of ImageMagick as of April 2017.)

Then from another terminal:

    bin/load-data.js

Then point your browser to [localhost:1337](http://localhost:1337/).

The final step of this initialization --- the [load-data.js](bin/load-choices.js) script --- crawls the [data](data) directory to load some content.

You can log in using Facebook authentication (via [passport.js](http://passportjs.org/)).
However, currently this redirects back to `localhost:1337`, not a public URL, so it will only work on your local machine (if at all).
You could probably edit the Facebook client ID & secret in [config/passport.js](config/passport.js) to use your own Facebook account, in theory.

### Running tests

First download geckodriver (Firefox webdriver) for your system from https://github.com/mozilla/geckodriver/releases
and copy it into your `$PATH`
e.g. for MacOS:

    curl -L https://github.com/mozilla/geckodriver/releases/download/v0.13.0/geckodriver-v0.13.0-macos.tar.gz | tar xz
    mv geckodriver /usr/local/bin

(you may need to sudo the last step)

Similarly ChromeDriver (Chrome webdriver) from https://sites.google.com/a/chromium.org/chromedriver/downloads
e.g.

     curl -O https://chromedriver.storage.googleapis.com/2.27/chromedriver_mac64.zip
     unzip chromedriver_mac64.zip
     mv chromedriver /usr/local/bin

Then:

    npm test

(Make sure sails is not running when you do this: the test suite lifts sails on its own, and populates it with a custom dataset. It will preserve your main game database and restore it after the test)
