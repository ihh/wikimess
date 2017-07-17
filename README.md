# Welcome to Wiki Messenger!

## Installation

This works for me on my late-2014 iMac (OS X El Capitan 10.11.16)

    brew install node
    npm install -g sails
    npm install
    sails lift &
    bin/load-data.js

Then point your browser to [localhost:1337](http://localhost:1337/).

The final two steps of this initialization sequence (`sails lift` and `bin/load-data.js`) can be combined by specifying `-e` to the [load-data.js](bin/load-data.js) script

    bin/load-data.js -e

Actually, this erases the database _before_ loading the data. WikiMess security[tm]!
Use the `-s` option to just load the data into the existing database, without erasing.
The script has lots more options; it crawls the [data](data) directory to pre-load corpora into the wiki database.

You can log in using Facebook authentication (via [passport.js](http://passportjs.org/)).
However, currently this redirects back to `wikimess.me`, so it will not work on your local machine.
You could probably edit the Facebook client ID & secret in [config/passport.js](config/passport.js) to use your own Facebook account, in theory.
