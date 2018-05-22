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

You can log in using Twitter or Facebook authentication (via [passport.js](http://passportjs.org/)).
However, currently this redirects back to `wikimess.me`, so it will not work on your local machine.
You could probably edit the Twitter/Facebook client ID & secret in [config/passport.js](config/passport.js) to use a different Twitter/Facebook account, in theory.
This side of things is not well hooked-up, yet.

To enable/disable direct inspection of the data model via Sails [blueprint methods](https://sailsjs.com/documentation/reference/blueprint-api),
edit the REST policy in [config/policies.js](config/policies.js).

# Corpora

The [data/symbols](data/symbols) directory contains several pre-loaded sets of synonyms
including selections from [Darius Kazemi's corpora](https://github.com/dariusk/corpora),
[Moby](http://moby-thesaurus.org/), and [Wordnet](https://wordnet.princeton.edu/).

The [Makefile](data/symbols/Makefile) in this directory fetches and builds these synonym sets.

# Bracery

[Bracery](https://github.com/ihh/bracery) is Wiki Messenger's native syntax for representing generative context-free grammars.
Bracery blends elements of [Tracery](http://tracery.io/) and [regular expression](https://en.wikipedia.org/wiki/Regular_expression) syntax.

Wiki Messenger implements Bracery expansion as a web service, with nonterminal definitions as a RESTful resource.
Special variables interpreted by Wiki Messenger include

- `^icon` and `^icolor` (name and color of icons displayed on cards)
- `^tags` (set by default to the message tags; if modified, will override the message tags)
- `^prevtags` (tags for the previous message)

# Template directory syntax

Files in the `data/templates` directory define the built-in templates and have the following syntax

~~~~
@template_author>Template title#past_tag1 past_tag2#future_tag1 future_tag2 future_tag3
The template itself, featuring $nonterminals, [alternations|etc.]
(it can be split over multiple lines)
~~~~

This defines a template by `@template_author`, with the title "Template title", and the specified past tags (`past_tag1` and `past_tag2`) and future tags (`future_tag1`, `future_tag2`, and `future_tag3`). The past & future tag fields can each contain any number of whitespace-separated tags; the special past tag `root` is used for templates that can be used at the top of a thread, or the past tags can be left empty for the same effect.

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

# Symbol directory syntax

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
