# bighouse

a [Sails](http://sailsjs.org) application

    brew install node
    brew install imagemagick
    brew install pkg-config
    npm install -g sails
    npm install
    sails lift
    bin/load-choices.js

Files of interest:
* [Scene file in JSON](data/choices/test.json)
* [Scene file in .story minilanguage](data/choices/prison.story) ... fewer quotes
* [Emacs mode for .story minilanguage](emacs/story-mode.el)
* [Monolithic JavaScript client](assets/js/bighouse/bighouse.js)
* [EJS templates for status page](views/status)
* [Icons](assets/images/icons) from http://game-icons.net/
* [Music and sound FX](assets/sounds) mostly produced using [cfxr](http://thirdcog.eu/apps/cfxr)
* Sails [models](api/models), [controllers](api/controllers), [services](api/services)
