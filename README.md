# bighouse

## Installation

    brew install node
    brew install imagemagick
    brew install pkg-config
    npm install -g sails
    npm install
    sails lift
    bin/load-choices.js

Then point your browser to [localhost:1337](http://localhost:1337/).

By default, the [load-choices.js](bin/load-choices.js) script creates two test accounts, named `fred` and `sheila`, both with password `test`, as well as one AI player `titfortat`. These default accounts are defined in [data/players](data/players/players.json).

## Repository organization

The repository follows the general [directory layout of a Sails app](http://sailsjs.org/documentation/anatomy/my-app).

Files of interest:

* [Story file in JSON](data/choices/test.json)
* [Story file in .story minilanguage](data/choices/prison.story) ... fewer quotes
* [Emacs mode for .story minilanguage](emacs/story-mode.el)
* [Monolithic JavaScript client](assets/js/bighouse/bighouse.js) and [libraries](assets/js/ext)
* [EJS templates for status page](views/status)
* [Icons](assets/images/icons) (from [game-icons.net](http://game-icons.net/)) and [default mood avatars](assets/images/avatars/generic)
* [Music and sound FX](assets/sounds) mostly produced using [cfxr](http://thirdcog.eu/apps/cfxr)
* Sails config: [routes](config/routes.js), [policies](config/policies.js)
* Sails code: [models](api/models), [controllers](api/controllers), [services](api/services)


## Game concepts

Players have both global state (a JSON object persists between games) and local state (specific to a game). The game also has common state that is not associated particularly with either player. A game can modify any or all these states. They are also available to in-game JavaScript eval's, via the expressions `$global1`, `$global2`, `$local1`, `$local2`, `$common` or the shorthands `$g1`, `$g2`, `$l1`, `$l2`, `$c`.

When a game starts, a player is automatically matched with another player at a similar stage in the game (see `scene` attribute below, under Choices). If no compatible player is available, then after a timer expires, the player is paired off with an AI.

### Choices and Outcomes

* The overall structure of the game is a (stochastic) context-free grammar. Each nonterminal in the grammar, called a **Choice**,
represents a finite-option two-player game
in the [game-theoretic](https://en.wikipedia.org/wiki/Game_theory) sense).
 * The two players make their moves "blind"; that is, they must each commit to a **move** without seeing what each other is doing.
 * They can however signal their intention, whether honestly or deceptively, by changing their **mood** avatar to one of the four available moods: _happy_, _angry_, _sad_, or _surprised_ (they can upload photos for all four of these).
 * Each Choice has a **name** that is used to identify it.
 * Each Choice has an **intro** that can be as simple as a text string or as complicated as a small self-contained Choose-Your-Own-Adventure story. In the latter case, the intro consists of a Directed Acyclic Graph. Each node can have the following fields: **text** for what's shown on the card, **left**/**right** for the next node (or **next** if they're both the same), **hint** for the hint that's shown before swiping, **choice** to commit the player to a move on reaching that node, **name**/**goto** to jump around the DAG.
     * If there is a separate **intro2** field, then a separate intro is shown to player 2; otherwise, they both get the same intro (although text expansions can be used to make them _look_ different).
 * By default the two available Moves in a Choice are just `l` and `r` (for _left_ and _right_), but they can be any text string that can go in a URL. There can also be more than two of them; if the intro is just a text string, however, then the Choice will present as a single card with a swipe-left-or-right decision, and so it only makes sense to have two moves in that case. For more than two moves it is necessary to set up a more complicated intro (e.g. a decision tree, or DAG, with multiple exit nodes, each of which could correspond to a different move).
 * A Choice may have a time limit (**timeout**). The web client will nudge the player towards this time limit by making moves for them. Note that, design-wise, it does not make a whole lot of sense to mix time-limited choices with time-unlimited choices in the same game. A game should either be asynchronous (all choices time-unlimited), or synchronous (all choices time-limited).
 * A Choice can set game state using the same type of update expressions as an Outcome (see below), and an intro can refer to game state via embedded expressions like `{{ $local1.cash }}` which are treated as JavaScript evals (at least, everything between the curly braces is).
     * Certain other text macros are expanded in the intros including `$self`, `$other`, `$player1` and `$player2`. A double semicolon `;;` is a shorthand for a break between cards (the player must swipe to move past the break) -- so `{text:"xxx;;yyy"}` is, loosely speaking, the same as `{text:"xxx",next:{text:"yyy"}}`. Newlines start new `<span>` elements. The same text macros are available in outros (see below).
 * A Choice has an optional `scene` field which is a text attribute describing what section of the broader story it can serve as an entry point for. This field is also used to match players together during games (so that players always get matched with other players who are at the same "level" in the game, so to speak, i.e. they are ready for the same scenes.) A special part of the `global` player state, `global.scene`, indicates which scenes a player is ready for. When the player is first created, this is set to `{ init: true }`, which means the player's first game will begin with a Choice that has the scene field equal to `init`.
* Each production rule in the grammar is called an **Outcome**. Each Choice has a list of possible Outcomes, corresponding to the elements in the [payoff matrix](https://en.wikipedia.org/wiki/Normal-form_game) for the Choice.
 * Outcomes are uniquely associated with a given Choice, and can be filtered by the moves made by each player using its **move1** and **move2** atttributes. For example, an Outcome might only be available if player 1 swiped right and player 2 swiped left: `{ move1: 'r', move2: 'l', ... }`
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
 * An Outcome can influence player & game states, via its **mood1**, **mood2**, **global1**, **global2**, **local1**, **local2** and **common** attributes. These are JavaScript eval's, with the usual shorthands (`$g1`, `$g2`, `$l1`, `$l2`, `$c`) as well as a few others, like `$` for the old value of the state variable being updated, or `++` and `--` as shorthands for just bumping that variable up or down a notch. The results of these eval's are merge'd with the original objects.
 * An Outcome has associated with it an optional **outro** text that is shown before the intro of the next Choice. As with intros, outros can be as simple as text strings, or as complicated as a Choose-Your-Own-Adventure story. (Outro nodes have the same syntax as intro nodes: **text**, **left**, **right**, **next**, **hint**, **choice**, **name**, **goto**.)
 * Outcomes and Choices can play [sound effects](assets/sounds/), show [icons](assets/images/icons/), change the [CSS class](assets/css/bighouse/) of cards, etc. These are accomplished by embedding various tags inside the intro/outro text. For example: `<sfx:reward>`, `<class:outcome>`, `<icon:ice-cream-cone>`.
 * By default, a Choice with outcomes `ll`, `lr`, `rl` or `rr` will (respectively) set player 1's mood to `sad`, `angry`, `surprised` or `happy`, and play the sound effect for (respectively) `punish`, `sucker`, `cheat` or `reward`. The angry/surprised moods and sucker/cheat effects are, naturally, flipped for player 2.
 
### The .story format
 
The story minilanguage is essentially a thin layer of preprocessing over the JSON format, auto-adding quotes around text fields (**intro**, **outro**, **text**) and adding a very little amount of context. The story format can be parsed using the loader script [load-choices.js](bin/load-choices.js) which uploads the story to the database via the REST API, or (if the `-s` option is used) just prints the corresponds JSON to the output.

Lines beginning with hash characters are assumed to be keys for the JSON object in the current context, and the remainder of data on the line is either a string literal, or (if it begins with a `[` or `{`) a JSON array or object. 
For example, this is a string literal in .story format

    #name prison

which expands to this JSON

    name: "prison"

On the other hand, this .story format

    #left { hint: "No!" }

expands to this JSON

    left: { hint: "No!" }

If the first hashed word on the line is followed by a single opening brace `{`, then every line that follows is assumed to be in a nested context, up until the next line that consists only of a closing brace `}`. For example, this .story

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