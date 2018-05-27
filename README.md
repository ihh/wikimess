# Wiki Messenger

## Installation

This works for me on my late-2014 iMac (OS X El Capitan 10.11.16)

    brew install node
    npm install -g sails
    npm install
    sails lift &
    bin/load-data.js

Then point your browser to [localhost:1337](http://localhost:1337/).

You will also need MySQL (for the database) and Redis (for the session store) running on localhost.

In MySQL you will need to create a database called 'wikimess'.
Currently the MySQL username is set to 'root' and the password is the empty string.
This can be changed in [config/connections.js](config/connections.js).

The final two steps of this initialization sequence (`sails lift` and `bin/load-data.js`) can be combined by specifying `-l` to the [load-data.js](bin/load-data.js) script

    bin/load-data.js -l

The script has lots more options; it crawls the [data](data) directory to pre-load corpora into the wiki database.

## Configuration

You can log in using Twitter or Facebook authentication (via [passport.js](http://passportjs.org/)).
However, currently this redirects back to `wikimess.me`, so it will not work on your local machine.
Edit the Twitter/Facebook client ID & secret in [config/local.js](config/local.js) to use a different Twitter/Facebook account and app credentials.

To enable/disable direct inspection of the data model via Sails [blueprint methods](https://sailsjs.com/documentation/reference/blueprint-api),
edit the REST policy in [config/policies.js](config/policies.js).
Currently, it allows local users full access to the database.

# Bracery

[Bracery](https://github.com/ihh/bracery) is Wiki Messenger's native syntax for representing generative context-free grammars.
Bracery blends elements of [Tracery](http://tracery.io/) and [regular expression](https://en.wikipedia.org/wiki/Regular_expression) syntax.

Wiki Messenger implements Bracery expansion as a web service, with nonterminal definitions as a RESTful resource.
Special variables interpreted by Wiki Messenger include

- `^icon` and `^icolor` (name and color of icons displayed on cards)
- `^tags` (set by default to the message tags; if modified, will override the message tags)
- `^prevtags` (tags for the previous message)

# Template directory

Files in the [data/templates](data/templates) directory define the built-in templates
for messages.

## Template directory syntax

Templates can be specified in JSON or in the following plaintext shorthand

~~~~
@template_author>Template title#past_tag1 past_tag2#future_tag1 future_tag2 future_tag3
The template itself, featuring $nonterminals, [alternations|etc.]
(it can be split over multiple lines)
~~~~

This defines a template by `@template_author`, with the title "Template title", and the specified past tags (`past_tag1` and `past_tag2`) and future tags (`future_tag1`, `future_tag2`, and `future_tag3`). These tags define the succession of templates in a thread, as follows:
- The past & future tag fields can each contain any number of whitespace-separated tags
- For template B to be considered as a possible successor (i.e. reply) to template A, at least one of A's future tags must also be one of B's past tags
- If any of template A's future tags appear in B's past tags with an exclamation point in front (e.g. A has future tag `tag` and B has past tag `!tag`), then B is disallowed as a successor to A
- The special past tag `root` is used for templates that can be used at the top of a thread, or the past tags can be left empty for the same effect

The template definition is terminated by an empty line.

The author and tag fields of the template definition line are optional so e.g. it can be

~~~~
>Template title
The template itself
split over two lines
or three
or more
~~~~

The author field can optionally be preceded by an integer weight, reflecting how frequently (relatively speaking) a template will be suggested to the user.

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

Files in the `data/symbols` directory use Bracery's plaintext format for symbol definitions

~~~~
>nonterminal_name
First option for the nonterminal definition, featuring $nonterminals, [alternations|etc.]
Second option for the nonterminal definition, featuring the same stuff
Third option for the nonterminal definition
Fourth option. If you want newlines, use \n (backslash is an escape character in general)
etc.
~~~~

The symbol definition is terminated by an empty line.

## Preset corpora

The [data/symbols](data/symbols) directory contains several pre-loaded sets of synonyms
including selections from [Darius Kazemi's corpora](https://github.com/dariusk/corpora),
[Moby](http://moby-thesaurus.org/), and [Wordnet](https://wordnet.princeton.edu/).

The [Makefile](data/symbols/Makefile) in this directory fetches and builds these synonym sets.

