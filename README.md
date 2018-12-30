# Wiki Messenger

Wiki Messenger is a messenger app (and server) where the messages can be generated procedurally.
It's intended for rapid prototyping and casual, collaborative interactive fiction development.

The app runs in a mobile browser with a swipe-based interface for accepting/rejecting procedurally-generated text.

## Installation

e.g on Mac

    brew install node
    npm install -g sails
    npm install
    sails lift &
    bin/load-data.js

Then point your browser to [localhost:1337](http://localhost:1337/).

You will also need MySQL (for the database) and Redis (for the session store) running on localhost.

In MySQL you will need to create a database called 'wikimess'.
Currently the MySQL username is set to 'root' and the password is the empty string.
This can be changed in [config/datastores.js](config/datastores.js).

The final two steps of this initialization sequence (`sails lift` and `bin/load-data.js`) can be combined by specifying `-l` to the [load-data.js](bin/load-data.js) script

    bin/load-data.js -l

The script has lots more options; it crawls the [data](data) directory to pre-load corpora into the wiki database.

## Configuration

You can log in using Twitter or Facebook authentication (via [passport.js](http://passportjs.org/)).
However, currently this redirects back to `wikimess.me`, so it will not work on your local machine.
Edit the Twitter/Facebook client ID & secret in [config/local_example.js](config/local_example.js) (and rename to config/local.js) to use a different Twitter/Facebook account and app credentials.

To enable/disable direct inspection of the data model via Sails [blueprint methods](https://sailsjs.com/documentation/reference/blueprint-api),
edit the REST policy in [config/policies.js](config/policies.js).
Currently, it allows local users full access to the database.

## Bracery

[Bracery](https://github.com/ihh/bracery) is Wiki Messenger's native syntax for representing generative context-free grammars.
Bracery blends elements of [Tracery](http://tracery.io/) and [regular expression](https://en.wikipedia.org/wiki/Regular_expression) syntax.

Wiki Messenger implements Bracery expansion as a web service, with nonterminal definitions as a RESTful resource.
On startup, an initial set of symbols is loaded from the [data/symbols](data/symbols) directory.

Special Bracery variables interpreted by Wiki Messenger include

- `$icon` and `$icolor` (name and color of icons displayed on cards)
- `$tags` (set by default to the message tags; if modified, will override the message tags)
- `$prevtags` (tags for the previous message)
- `$reject`, if defined, forces a card to be posted (with `&$reject` appended) even if the player rejects it
- `$accept`, if defined, will cause `&$accept` to be appended to _accepted_ cards before posting

### Symbol directory syntax

Symbol definitions can be provided in JSON or in the plaintext shorthand defined by [Bracery](https://github.com/ihh/bracery/blob/master/MESSAGES.md).
Several symbol definitions are provided in the Wiki Messenger repository, along with scripts to import symbol definitions from resources
such as Darius Kazemi's [corpora](https://github.com/dariusk/corpora).

## Templates

Wiki Messenger templates are [Braceplates](https://github.com/ihh/bracery/blob/master/MESSAGES.md) (Bracery message templates).
On startup, the initial set of templates is loaded from the [data/templates](data/templates) directory.
Further templates can be created from the messenger app by simply composing and sending messages.

### Template directory syntax

Template definitions can be provided in JSON or in the plaintext shorthand defined by [Bracery](https://github.com/ihh/bracery/blob/master/MESSAGES.md).

## Testing templates

You can test templates outside of Wiki Messenger using [bracery's](https://github.com/ihh/bracery) `-m` option
(short for `--markov`, because it basically samples a trajectory through a Markov chain).
Make sure to also load any required symbol definitions.
For example:

~~~~
bracery data/symbols/*.txt data/symbols/*.json -m data/templates/dnd.txt
~~~~

Or for an interactive command-line experience that's a little closer to the Wiki Messenger web client UI
(in that it allows you to keep re-rolling the next move until you're happy with it),
use bracery with the `-q` option (short for `--quiz`) instead of `-m`:

~~~~
bracery data/symbols/*.txt data/symbols/*.json -q data/templates/dnd.txt
~~~~

You can also use Bracery's `templates2dot.js` script to get a visualization of the Markov chain as a GraphViz dot file
(the `-o` option will create and open the PDF automatically, but only on a Mac with GraphViz installed)

~~~~
./node_modules/bracery/bin/templates2dot.js -o data/templates/dnd.txt
~~~~

# Symbol directory

Symbol definitions are in [data/symbols](data/symbols).

## Symbol directory syntax

Files in the `data/symbols` directory use Bracery's [plaintext format](https://github.com/ihh/bracery/blob/master/MESSAGES.md) for symbol definitions.

## Preset corpora

The [data/symbols](data/symbols) directory contains several pre-loaded sets of synonyms
including selections from [Darius Kazemi's corpora](https://github.com/dariusk/corpora),
[Moby](http://moby-thesaurus.org/), and [Wordnet](https://wordnet.princeton.edu/).

The [Makefile](data/symbols/Makefile) in this directory fetches and builds these synonym sets.

