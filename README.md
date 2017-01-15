# bighouse

## Installation

This works for me on my late-2014 iMac (OS X El Capitan 10.11.16)

    git submodule update --init --recursive
    brew install node
    brew install imagemagick
    brew install pkg-config
    npm install -g sails
    npm install
    sails lift

Then from another terminal:

    bin/load-choices.js

Then point your browser to [localhost:1337](http://localhost:1337/).

The final step of this initialization --- the [load-choices.js](bin/load-choices.js) script --- crawls the [data](data) directory to load some content.
By default, this includes two test accounts, named `fred` and `sheila`, both with password `test`, as well as one AI player `titfortat`. These default accounts are defined in [data/players](data/players/players.json).

You can also log in using Facebook authentication (via [passport.js](http://passportjs.org/)).
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

## Gameplay

At the moment, the game UI is as follows:
- you explore a little outer world of hyperlinked "Locations". The interface here is vaguely inspired by Fallen London.
 - this outer world includes links to "Events" which essentially register your interest in starting a game
 - I'm in the process of developing a more MUD-like interface for the outer environment that allows you to specifically initiate games with particular players, rather than randomly matching you to whomever's logged in
- when other players try to start the same Event, the game begins
 - alternatively, if no other players join within a time limit, the game will start with an AI player
 - I find the easiest way to test two-player is to open Firefox and Chrome side-by-side, but you still need to switch rapidly between them to join both players inside the time limit
- the game itself is an inner minigame environment over a card table
- you swipe to select choices, and can also flip the emotional state of your avatar as a side-channel
- the game is oriented around a set of scenes ("Choices"), each "Choice" corresponding to a decision that both players make simultaneously
- they can arrive at this decision via a series of binary decisions (swipe left or right) or multiple-choice decisions (select from menu then swipe)
- the joint outcome of each Choice determines the next option
- there are up to M*N possible joint Outcomes at each Choice, where M is the number of options for player 1 & N is the number of options for player 2 (the text and options presented to each player are symmetric by default, but they don't have to be).
 - The M*N outcomes don't all need to be different. They can follow game-theoretic templates like [Prisoner's Dilemma](https://en.wikipedia.org/wiki/Prisoner's_dilemma), [Deadlock](https://en.wikipedia.org/wiki/Deadlock_(game_theory)), [Rock/Paper/Scissors](https://en.wikipedia.org/wiki/Rock%E2%80%93paper%E2%80%93scissors), [Battle of the Sexes](https://en.wikipedia.org/wiki/Battle_of_the_sexes_(game_theory)), [Stag Hunt](https://en.wikipedia.org/wiki/Stag_hunt), [Matching Pennies](https://en.wikipedia.org/wiki/Matching_pennies), [Chicken](https://en.wikipedia.org/wiki/Chicken_(game)), and [so on](https://en.wikipedia.org/wiki/List_of_games_in_game_theory). Or, they can just lead to simple narrative outcomes in various ways (e.g. if both players choose to enter the dungeon, the quest begins, otherwise the quest ends).
- the overall structure (i.e. the procession of Choices and Outcomes) looks like a choose-your-own-adventure with GOSUBs (or, equivalently, a context-free grammar) with scores, variables and so on. There is some support for icons, meters, and other basic graphics & sounds.

The content of the test story is minimal. There is only one scene (Choice), and it repeats over and over. That's if you're lucky: unless you both swipe left on the first move, the game will end after the first scene. The purpose is just to test out most of the options. The [JSON story file](data/choices/test.json) shows these. There is also a slightly more Choicescript-like [story minilanguage](data/choices/prison.story) that has fewer quotes and braces than JSON, and so allows for more natural writing.

## Repository organization

The repository follows the general [directory layout of a Sails app](http://sailsjs.org/documentation/anatomy/my-app).

Files of interest:

* Game data
 * [Story file in JSON](data/choices/test.json)
    * [Story file in .story minilanguage](data/choices/prison.story) ... fewer quotes
    * [Emacs mode for .story minilanguage](emacs/story-mode.el)
 * [Location file (JSON)](data/locations/root.json)
 * [Items file (JSON)](data/items/cash.json) ... info about objects player can acquire
 * [Awards file (JSON)](data/awards/test.json) ... info about accomplishments for player's status page
 * [Meters file (JSON)](data/meters/days.json) ... info about meters for player's status page (stats, scores, etc.)
 * [Players file (JSON)](data/players/players.json) ... test players
    * [Player file for NPC Dean Wedgwood (JSON)](data/players/players.json) ... slightly (but not much) more complex character info that includes an avatar description
* Main codebase
 * [Monolithic JavaScript client](assets/js/bighouse/bighouse.js) and [libraries](assets/js/ext)
 * Sails config: [routes](config/routes.js), [policies](config/policies.js)
 * Sails code: [models](api/models), [controllers](api/controllers), [services](api/services)
 * Default avatars use a custom fork of [facesjs](https://github.com/ihh/facesjs/)
* Third-party libraries/plugins:
 * [jquery](https://jquery.com/)
 * [swing](https://github.com/gajus/swing) for the card-swiping interface
 * [howler.js](https://howlerjs.com/) for sound
 * Moving/cropping of uploaded images uses [jquery-cropbox](https://github.com/acornejo/jquery-cropbox) plus [hammer.js](http://hammerjs.github.io/) for touch gestures
 * [https://github.com/infusion/jQuery-xcolor](jquery-xcolor) for color manipulation

* Assets
 * [Music and sound FX](assets/sounds) mostly produced using [cfxr](http://thirdcog.eu/apps/cfxr)
  * except for the tunes which are currently [Hot Chip](http://www.hotchip.co.uk/), just as a placeholder, obviously not for commercial release
 * [Icons](assets/images/icons) (from [game-icons.net](http://game-icons.net/)) and [default mood avatars](assets/images/avatars/generic)
 * [EJS templates for status page](views/status)


## Game concepts

Players have both global state (a JSON object persists between games) and local state (specific to a game). The game also has common state that is not associated particularly with either player. A game can modify any or all these states. They are also available to in-game JavaScript eval's, via the expressions `$global1`, `$global2`, `$local1`, `$local2`, `$common` or the shorthands `$g1`, `$g2`, `$l1`, `$l2`, `$c`.

When a game starts, a player is automatically matched with another player at a similar stage in the game (see `scene` attribute below, under Choices). If no compatible player is available, then after a timer expires, the player is paired off with an AI.

### Choices and Outcomes

Examples of most of the constructs detailed here can be found in the [test story](data/choices/test.json).

* The overall structure of the game is a (stochastic) context-free grammar. Each nonterminal symbol of the grammar is called a **Choice**,
represents a finite-option two-player game
in the [game-theoretic](https://en.wikipedia.org/wiki/Game_theory) sense).
 * The two players make their moves "blind"; that is, they must each commit to a **move** without seeing what each other is doing.
     * They can however signal their intention, whether honestly or deceptively, by changing their **mood** avatar to one of the four available moods: _happy_, _angry_, _sad_, or _surprised_ (they can upload photos for all four of these).
 * Each Choice has a **name** that is used to identify it uniquely. (It also has an internal database ID, for fast lookup, but the name must still be unique.)
 * Each Choice has an **intro** that can be as simple as a text string or as complicated as a small self-contained Choose-Your-Own-Adventure story. In the latter case, the intro (like the outer game structure) consists of a context-free grammar. Each intro node (that is, each nonterminal symbol of this grammar) corresponds to a card shown to the player, and can have the following fields: **text** for what's shown on the card, **left**/**right** for the next node (or **next** if they're both the same), **hint** for the hint that's shown before swiping, **choice** to commit the player to a move on reaching that node, **name**/**goto** to make connections within the grammar (or **sequence**, which is a bit like a series of "gosub" commands). For examples, see the [test story](data/choices/test.json).
     * If there is a separate **intro2** field, then a separate intro is shown to player 2; otherwise, they both get the same intro (although text expansions can be used to make them _look_ different).
 * By navigating through the intro grammar, the player generates a parse tree which is their move. This parse tree may have labels attached to individual nodes via the **label** property.
 * A Choice may have a time limit (**timeout**). The web client will nudge the player towards this time limit by swiping through the intro for them. Note that, design-wise, it does not make a whole lot of sense to mix time-limited choices with time-unlimited choices in the same game. A game should either be asynchronous (all choices time-unlimited), or synchronous (all choices time-limited).
     * This is a good point to note why the fine-scale detail of the intros (and outros -- see below) has the structure that it does, and why this structure is a little less expressive than the higher-order structure. The essential difference is that navigation of the intros and outros is handled purely on the client, while the Choice grammar is processed on the server. The detailed path a player takes through an intro/outro does not affect the course of the game (except insofar as it leads that player to commit to a particular move). The two players can navigate through their intros independently during the allotted time; the server doesn't know where in an intro the player is at any given moment, and the time limit (which is ultimately adjudicated by the server) applies at the level of the Choice, i.e. it is for the entire intro as a whole. Thus, the client needs to split this time limit up between the nodes of the intro, so that the player has a consistent idea of how much time is left in the turn, and how much time to spend on each card. This means the client needs to know how deep each node is (i.e. the maximum path length from any node to a leaf). It would present problems if there were cycles in the intro graph, or state-dependent logic, that might prevent the client from giving clear & consistent visual and audio feedback to the player on how much time they had left in a turn and how many cards they had to read & swipe through in that time. So the intros and outros only allow DAG structures, with no extra logic filtering the possibilities, while the Choices (which are handled on the server) allow for a more elaborate game structure with sub-quests, state-dependent logic, and so forth.
 * A Choice can set game state using the same type of update expressions as an Outcome (see below), and an intro can refer to game state via embedded expressions like `{{ $local1.cash }}` which are treated as JavaScript evals (at least, everything between the curly braces is).
      * Certain other text macros are expanded in the intros including `$self`, `$other`, `$player1` and `$player2`. A double semicolon `;;` is a shorthand for a break between cards (the player must swipe to move past the break) -- so `{text:"xxx;;yyy"}` is, loosely speaking, the same as `{text:"xxx",next:{text:"yyy"}}`. Newlines start new `<span>` elements. The same text macros are available in outros (see below).
      * If an intro node has a field named `expr` then this field will be evaluated on the server as a JavaScript expression as if it were surrounded by `{{ ... }}`, and the entire intro node replaced by the result of this eval. This can be used to dynamically generate intros (or parts of intros) on the server as a function of current game/player state (or using randomness), partially mitigating the otherwise limited expressive power of intros.
 * A Choice has an optional `scene` field which is a text attribute describing what section of the broader story it can serve as an entry point for. This field is also used to match players together during games (so that players always get matched with other players who are at the same "level" in the game, so to speak, i.e. they are ready for the same scenes.) A special part of the `global` player state, `global.scene`, indicates which scenes a player is ready for. When the player is first created, this is set to `{ init: true }`, which means the player's first game will begin with a Choice that has the scene field equal to `init`.
* Each production rule in the grammar is called an **Outcome**. Each Choice has a list of possible Outcomes, corresponding to the elements in the [payoff matrix](https://en.wikipedia.org/wiki/Normal-form_game) for the Choice.
 * Outcomes are uniquely associated with a given Choice, and can be filtered by the moves made by each player using its **move1** and **move2** attributes, which by default are compared to the "choice" labels in the move tree (more precisely, the concatenation of those labels). For example, an Outcome might only be available if player 1 swiped right and player 2 swiped left: `{ move1: 'r', move2: 'l', ... }`
     * Alternatively, a syntactic sugar allows the quick declaration of (sets of) Outcomes with the moves already bound.
     * For example, `rl: {xxx}` is shorthand for `outcome: [{ move1: 'r', move2: 'l', xxx }]`
     * And `same: {xxx}` is short for `outcome: [{move1:'r',move2:'r',xxx},{move1:'l',move2:'l',xxx}]` -- i.e. it duplicates the Outcome declaration for the two possibilities where the moves are the same.
     * Other shorthands are `diff`, `lr2` (which declares `lr` and then flips players 1 & 2 before declaring the symmetric `rl` equivalent), `any` (short for all four outcomes), `notll` (short for `lr`, `rl` and `rr`), `xl` (short for `ll` and `rl`), and so on.
     * These shorthands only work if the moves are `l` and `r`. If there are more moves than that for a given Choice, you will need to roll the outcomes yourself.
 * As well as `move1` and `move2`, an Outcome's **weight** attribute also allows it to be filtered by an arbitrary JavaScript expression, that can depend on the players' moves as well as the current game & player states.
     * Actually, this is a probabilistic weight that can be used to favor some outcomes stochastically over others. The expressions `$1` and `$2` can be used in the weight eval to refer to the players' moves.
     * By default, Outcomes are mutually exclusive: only one Outcome will be (randomly) selected for a given choice, proportionally by its weight (and consistent with player 1 & 2's moves). However, you can also flag an outcome as not being exclusive by setting its **exclusive** attribute to false. All such non-exclusive Outcomes which match the criteria specified by `move1`, `move2` and `weight` will be executed after both players have moved, in addition to the single exclusive outcome which is stochastically selected.
 * An Outcome can lead to zero new Choices (your story ends here), or one new Choice (turn to page X), or two new Choices (turn to page X, then when you have finished the sub-quest on that page, turn to page Y), or any number of new Choices. The list of Choice names generated by an Outcome is given by its **next** attribute (this can also be used to declare inline nested Choices, recursively).
     * It's actually not quite true to say that "your story ends here" if the Outcome produces no new choices. For one thing, the outro for the Outcome will still be shown. Furthermore, any choices that have been pushed onto the stack by previous outcomes will be visited (this is a context-free grammar, not just a state machine). If you want an Outcome to purge the stack of any pending Choices (e.g. a "sudden death" scenario), set its **flush** attribute.
 * An Outcome can influence player & game states, via its **mood1**, **mood2**, **global1**, **global2**, **local1**, **local2** and **common** attributes. These are JavaScript eval's, with the usual shorthands (`$g1`, `$g2`, `$l1`, `$l2`, `$c`) as well as a few others, like `$` for the old value of the state variable being updated, or `++` and `--` as shorthands for just bumping that variable up or down a notch. The results of these eval's are merge'd with the original objects. This is a rather terse description, but examples can be found in the [test story](data/choices/test.json).
 * An Outcome has associated with it an optional **outro** text that is shown before the intro of the next Choice. As with intros, outros can be as simple as text strings, or as complicated as a Choose-Your-Own-Adventure story. (Outro nodes have the same syntax as intro nodes: **text**, **left**, **right**, **next**, **hint**, **choice**, **name**, **goto**, **expr**.)
 * An Outcome's outro nodes (and a Choice's intro nodes) can play [sound effects](assets/sounds/), include [icons](assets/images/icons/), change the [CSS class](assets/css/bighouse/) of cards, update the player's mood, etc. These are accomplished by embedding various tags inside the intro/outro text. For example: `<sfx:reward>`, `<class:outcome>`, `<icon:ice-cream-cone>`, `<mood:happy>`.
     * By default, a Choice with outcomes `ll`, `lr`, `rl` or `rr` will (respectively) set player 1's mood to `sad`, `angry`, `surprised` or `happy`, and play the sound effect for (respectively) `punish`, `sucker`, `cheat` or `reward`. The angry/surprised moods and sucker/cheat effects are, naturally, flipped for player 2.
 
### The .story format
 
The story minilanguage is essentially a thin layer of preprocessing over the JSON format, auto-adding quotes around text fields (**intro**, **outro**, **text**) and adding a very little amount of context. The story format can be parsed using the loader script [load-choices.js](bin/load-choices.js) which uploads the story to the database via the REST API, or (if the `-s` option is used) just prints the corresponds JSON to the output.

Lines beginning with hash characters are assumed to be keys for the JSON object in the current context, and the remainder of data on the line is either a string literal, or (if it begins with a `[` or `{`) a JSON array or object.

For example, this is a string literal in .story format

    #name prison

which expands to this JSON

    name: "prison"

On the other hand, this line of .story format

    #left { hint: "No!" }

expands to this JSON

    left: { hint: "No!" }

The `#name` field is special: each `#name` line starts a new Choice.

If the first hashed word on the line is followed by a single opening brace `{`, then every line that follows is assumed to be in a nested context, up until the next line that consists only of a closing brace `}`. For example, this .story block

    #name cell
    #intro {
      #text You are locked in a cell.
      #right {
        #hint Try to escape
        #text You try fruitlessly to escape.
      }
      #left {
        #hint Sit tight
        #text You wait, patiently.
      }
    }

expands to this JSON

    {
      "name": "cell",
      "intro": [
        {
          "text": "You are locked in a cell.",
          "right": {
            "hint": "Try to escape",
            "text": "You try fruitlessly to escape."
          },
          "left": {
            "hint": "Sit tight",
            "text": "You wait, patiently."
          }
        }
      ]
    }

In any given context, bare text (without a hash in front) is auto-appended to the default text field for that context. Inside a Choice the default text field is `intro`; inside an Outcome it is `outro`; and inside an extended intro or outro, the default text field is `text`. The outermost context is "Choice".

So, the above .story could have been written more compactly without the `#text` tags, like so:

    #name cell
    #intro {
      You are locked in a cell.
      #right {
        #hint Try to escape
        You try fruitlessly to escape.
      }
      #left {
        #hint Sit tight
        You wait, patiently.
      }
    }


Blank lines in the story file translate to newlines in the relevant text fields of the JSON file, which show up as separate `<span>` elements in the game client.

Here is a (very simple) longer example of a Choice in the .story file format:

    #name prison
    #scene init
    #intro {
      You are in a cold, uncomfortable prison cell.
      ;;
      The police say $other is singing like a bird.
      
      Your only hope is to rat them out and reduce your sentence.
      #left {
        #hint Rat them out
      }
      #right {
        #hint Stay quiet
      }
    }
    #lr2 $player2 rats $player1 out.
    #ll You both rat each other out.
    #rr {
      You both stay silent: good for you!
      #next {
        #intro {
          A life of crime awaits you on the outside.
          #left { hint: "No!" }
          #right { hint: "Awesome!" }
        }
      }
    }
    

And here is the JSON it expands into (using the [loader script](bin/load-choices.js)). Note that the entire output is wrapped in a list `[...]`; this is because there can be multiple Choices in a story file.

    [
      {
        "name": "prison",
        "intro": [
          {
            "text": "You are in a cold, uncomfortable prison cell.;;The police say $other is singing like a bird.\n Your only hope is to rat them out and reduce your sentence.",
            "left": {
              "hint": "Rat them out"
            },
            "right": {
              "hint": "Stay quiet"
            }
          }
        ],
        "lr2": [
          {
            "outro": "$player2 rats $player1 out."
          }
        ],
        "ll": [
          {
            "outro": "You both rat each other out."
          }
        ],
        "rr": [
          {
            "outro": "You both stay silent: good for you!",
            "next": [
              {
                "intro": [
                  {
                    "text": "A life of crime awaits you on the outside.",
                    "left": {
                      "hint": "No!"
                    },
                    "right": {
                      "hint": "Awesome!"
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]

This is what gets POSTed to the REST API, though it gets processed a little more on the server side. For completeness, the internal database Choice table after this processing looks as follows (using the schema as of 9/18/2016)

    [
      {
        "outcomes": [
          {
            "outro": [
              {
                "text": "$player2 rats $player1 out."
              }
            ],
            "move1": "l",
            "move2": "r",
            "choice": 1,
            "weight": "1",
            "exclusive": true,
            "mood1": "auto",
            "mood2": "auto",
            "next": [],
            "flush": false,
            "createdAt": "2016-09-18T17:22:56.337Z",
            "updatedAt": "2016-09-18T17:22:56.337Z",
            "id": 1
          },
          {
            "outro": [
              {
                "text": "$player1 rats $player2 out."
              }
            ],
            "move1": "r",
            "move2": "l",
            "choice": 1,
            "weight": "1",
            "exclusive": true,
            "mood1": "auto",
            "mood2": "auto",
            "next": [],
            "flush": false,
            "createdAt": "2016-09-18T17:22:56.338Z",
            "updatedAt": "2016-09-18T17:22:56.338Z",
            "id": 2
          },
          {
            "outro": [
              {
                "text": "You both rat each other out."
              }
            ],
            "move1": "l",
            "move2": "l",
            "choice": 1,
            "weight": "1",
            "exclusive": true,
            "mood1": "auto",
            "mood2": "auto",
            "next": [],
            "flush": false,
            "createdAt": "2016-09-18T17:22:56.339Z",
            "updatedAt": "2016-09-18T17:22:56.339Z",
            "id": 3
          },
          {
            "outro": [
              {
                "text": "You both stay silent: good for you!"
              }
            ],
            "next": [
              "prison.1"
            ],
            "move1": "r",
            "move2": "r",
            "choice": 1,
            "weight": "1",
            "exclusive": true,
            "mood1": "auto",
            "mood2": "auto",
            "flush": false,
            "createdAt": "2016-09-18T17:22:56.339Z",
            "updatedAt": "2016-09-18T17:22:56.339Z",
            "id": 4
          }
        ],
        "name": "prison",
        "mood1": "unchanged",
        "mood2": "unchanged",
        "autoexpand": false,
        "verb1": "choose",
        "verb2": "choose",
        "timeout": 60,
        "createdAt": "2016-09-18T17:22:56.318Z",
        "updatedAt": "2016-09-18T17:22:56.331Z",
        "id": 1,
        "scene": "init",
        "intro": [
          {
            "text": "You are in a cold, uncomfortable prison cell.;;The police say $other is singing like a bird.\n Your only hope is to rat them out and reduce your sentence.",
            "left": {
              "hint": "Rat them out"
            },
            "right": {
              "hint": "Stay quiet"
            }
          }
        ],
        "intro2": null
      },
      {
        "outcomes": [],
        "name": "prison.1",
        "mood1": "unchanged",
        "mood2": "unchanged",
        "autoexpand": false,
        "verb1": "choose",
        "verb2": "choose",
        "timeout": 60,
        "createdAt": "2016-09-18T17:22:56.344Z",
        "updatedAt": "2016-09-18T17:22:56.351Z",
        "id": 2,
        "intro": [
          {
            "text": "A life of crime awaits you on the outside.",
            "left": {
              "hint": "No!"
            },
            "right": {
              "hint": "Awesome!"
            }
          }
        ],
        "parent": "prison",
        "intro2": null
      }
    ]