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

# Bracery

Bracery is Wiki Messenger's native syntax for representing generative context-free grammars.
Bracery blends elements of [Tracery](http://tracery.io/) and [regular expression](https://en.wikipedia.org/wiki/Regular_expression) syntax, including

- named nonterminals: Tracery-style `#symbol_name#`, or Bracery-style `$symbol_name` or `${symbol_name}` (the latter is useful if you want to follow it with an alphanumeric or underscore)
- alternations (anonymous nonterminals), which can be nested: `[option1|option 2|3rd opt|4th|more [options|nested options]...]`
- variables: `^variable_name={value}` to assign, `^variable_name` or `^{variable_name}` to retrieve (names are case-insensitive)
- built-in text-processing functions:
   - `&plural{...}` (plural), `&a{...}` ("a" or "an")
   - `&cap{...}` (Capitalize), `&lc{...}` and `&uc{...}` (lower- & UPPER-case)
   - selected natural language-processing functions from [compromise](https://github.com/spencermountain/compromise) including (for nouns) `&singular` and `&topic`, and (for verbs) `&past`, `&present`, `&future`, `&infinitive`,  `&adjective`, `&negative`
- special functions:
   - conditionals: `&if{testExpr}{trueExpr}{falseExpr}` evaluates to `trueExpr` if `testExpr` contains any non-whitespace characters, and `falseExpr` otherwise
   - dynamic evaluation: `&eval{expr}` parses `expr` as Bracery and dynamically expands it. Conversely, `&quote{expr}` returns `expr` as a text string, without doing any expansions. So `&eval{&quote{expr}}` is the same as `expr` (with a subtle side effect: there is a limit on the number of dynamic evaluations that an expression can use, to guard against infinite recursion or hammering the server)
- functions, alternations, variable assignments, and conditionals can be arbitrarily nested
- syntactic sugar
   - the Tracery-style expression `#name#` is actually shorthand for `&if{^name}{&eval{^name}}{$name}`. Tracery overloads the same namespace for symbol and variable names, and uses the variable if it's defined; this reproduces that behavior (almost; it won't be quite the same if `^name` is set to whitespace or the empty string)
   - braces can be omitted in many situations where context is obvious, e.g. `^currency=&cap&plural$name` means the same as `^currency={&cap{&plural{$name}}}`
   - as a shorthand, you can use `$Nonterminal_name` as a shorthand for `&cap{$nonterminal_name}`, and `^Variable_name` for `&cap{^variable_name}`
   - similarly, `$NONTERMINAL_NAME` is a shorthand for `&uc{$nonterminal_name}`, and  `^VARIABLE_NAME` for `&uc{^variable_name}`
   - as well as the Tracery syntax for nonterminals, i.e. `#symbol_name#` instead of `$symbol_name`, you can optionally use the Tracery modifier syntax, e.g. `#symbol_name.capitalize#` instead of `&cap{$symbol_name}`
   - There's currently no direct equivalent of Tracery's support for locally scoped variables and nonterminals (what Tracery calls "actions"), but similar effects can be achieved with `&eval` and `&quote`

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

Files in the `data/symbols` directory have the following syntax

~~~~
>nonterminal_name
First option for the nonterminal definition, featuring $nonterminals, [alternations|etc.]
Second option for the nonterminal definition, featuring the same stuff
Third option for the nonterminal definition
Fourth option. If you want newlines, use \n (backslash is an escape character in general)
etc.
~~~~

The symbol definition is terminated by an empty line.
