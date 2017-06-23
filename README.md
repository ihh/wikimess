# grambot

## Installation

This works for me on my late-2014 iMac (OS X El Capitan 10.11.16)

    brew install node
    brew install pkg-config
    npm install -g sails
    npm install
    sails lift

(Note that node's imagemagick-native package only works with version 6 of ImageMagick as of April 2017.)

Then from another terminal:

    bin/load-data.js

Then point your browser to [localhost:1337](http://localhost:1337/).

The final step of this initialization --- the [load-data.js](bin/load-data.js) script --- crawls the [data](data) directory to load some content.

You can log in using Facebook authentication (via [passport.js](http://passportjs.org/)).
However, currently this redirects back to `localhost:1337`, not a public URL, so it will only work on your local machine (if at all).
You could probably edit the Facebook client ID & secret in [config/passport.js](config/passport.js) to use your own Facebook account, in theory.
