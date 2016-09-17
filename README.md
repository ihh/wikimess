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
* [Monolithic JavaScript client](assets/js/bighouse/bighouse.js) and [libraries](assets/js/ext)
* [EJS templates for status page](views/status)
* [Icons](assets/images/icons) (from [game-icons.net](http://game-icons.net/)) and [default mood avatars](assets/images/avatars/generic)
* [Music and sound FX](assets/sounds) mostly produced using [cfxr](http://thirdcog.eu/apps/cfxr)
* Sails REST API: [models](api/models), [controllers](api/controllers), [services](api/services)
* Sails config: [routes](config/routes.js), [policies](config/policies.js), [passport (auth)](config/passport.js)
