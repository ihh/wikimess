# Welcome to Wiki Messenger!

## Installation

This works for me on my late-2014 iMac (OS X El Capitan 10.11.16)

    brew install node
    npm install -g sails
    npm install
    sails lift &
    bin/load-data.js

Then point your browser to [localhost:1337](http://localhost:1337/).

You will also need MySQL (for the database) and Redis (for the session store) running on localhost.

The final two steps of this initialization sequence (`sails lift` and `bin/load-data.js`) can be combined by specifying `-l` to the [load-data.js](bin/load-data.js) script

    bin/load-data.js -l

The script has lots more options; it crawls the [data](data) directory to pre-load corpora into the wiki database.

You can log in using Twitter or Facebook authentication (via [passport.js](http://passportjs.org/)).
However, currently this redirects back to `wikimess.me`, so it will not work on your local machine.
You could probably edit the Twitter/Facebook client ID & secret in [config/passport.js](config/passport.js) to use a different Facebook account, in theory.
