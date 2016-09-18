# bighouse

    brew install node
    brew install imagemagick
    brew install pkg-config
    npm install -g sails
    npm install
    sails lift
    bin/load-choices.js

Repo follows the general [directory layout of a Sails app](http://sailsjs.org/documentation/anatomy/my-app).

Files of interest:
* [Scene file in JSON](data/choices/test.json)
* [Scene file in .story minilanguage](data/choices/prison.story) ... fewer quotes
* [Emacs mode for .story minilanguage](emacs/story-mode.el)
* [Monolithic JavaScript client](assets/js/bighouse/bighouse.js) and [libraries](assets/js/ext)
* [EJS templates for status page](views/status)
* [Icons](assets/images/icons) (from [game-icons.net](http://game-icons.net/)) and [default mood avatars](assets/images/avatars/generic)
* [Music and sound FX](assets/sounds) mostly produced using [cfxr](http://thirdcog.eu/apps/cfxr)
* Sails config: [routes](config/routes.js), [policies](config/policies.js)
* Sails code: [models](api/models), [controllers](api/controllers), [services](api/services)


# Story format

* Players have both global state (a JSON object persists between games) and local state (specific to a game). The game also has common state that is not associated particularly with either player. A game can modify any or all these states. They are also available to in-game JavaScript eval's, via the expressions `$global1`, `$global2`, `$local1`, `$local2`, `$common` or the shorthands `$g1`, `$g2`, `$l1`, `$l2`, `$c`.
* A story is organized as a (stochastic) context-free grammar.
* Each nonterminal in the grammar, called a **Choice**,
represents a finite-option two-player game
in the [game-theoretic](https://en.wikipedia.org/wiki/Game_theory) sense).
 * The two players make their moves "blind"; that is, they must each commit to a **move** without seeing what each other is doing.
 * They can however signal their intention, whether honestly or deceptively, by changing their **mood** avatar to one of the four available moods: _happy_, _angry_, _sad_, or _surprised_ (they can upload photos for all four of these).
 * Each Choice has a **name** that is used to identify it.
 * Each Choice has an **intro** that can be as simple as a text string or as complicated as a small self-contained Choose-Your-Own-Adventure story. (Key fields in an intro node: **text** for what's shown on the card, **left**/**right** for the next choice (or **next** if they're both the same), **hint** for the hint that's shown before swiping, **choice** to commit the player to a move on reaching that node, **name**/**goto** to jump around the DAG.)
 * By default the two available Moves in a Choice are just `l` and `r` (for _left_ and _right_), but they can be any text string that can go in a URL. There can also be more than two of them; if the intro is just a text string, however, then the Choice will present as a single card with a swipe-left-or-right decision, and so it only makes sense to have two moves in that case. For more than two moves it is necessary to set up a more complicated intro (e.g. a decision tree, or DAG, with multiple exit nodes, each of which could correspond to a different move).
 * A Choice may have a time limit (**timeout**). The web client will nudge the player towards this time limit by making moves for them. Note that, design-wise, it does not make a whole lot of sense to mix time-limited choices with time-unlimited choices in the same game. A game should either be asynchronous (all choices time-unlimited), or synchronous (all choices time-limited).
 * A Choice can set game state using the same type of update expressions as an Outcome (see below), and an intro can refer to game state via embedded expressions like `{{ $local1.cash }}` which are treated as JavaScript evals (at least, everything between the curly braces is).
     * Certain other text macros are expanded in the intros including `$self`, `$other`, `$player1` and `$player2`. A double semicolon `;;` is a shorthand for a break between cards (the player must swipe to move past the break) -- so `{text:"xxx;;yyy"}` is, loosely speaking, the same as `{text:"xxx",next:{text:"yyy"}}`. The same text macros are available in outros (see below).
* Each production rule in the grammar, called an **Outcome**, generates a sequence of additional Choices.
 * Each choice has a list of possible outcomes.
 * Outcomes are uniquely associated with a given Choice, and can be filtered by the moves made by each player using its **move1** and **move2** atttributes. For example, an Outcome might only be available if player 1 swiped right and player 2 swiped left: `{ move1: 'r', move2: 'l', ... }`
     * Alternatively, a syntactic sugar allows the quick declaration of (sets of) Outcomes with the moves already bound.
     * For example, `rl: {xxx}` is shorthand for `outcome: [{ move1: 'r', move2: 'l', xxx }]`
     * And `same: {xxx}` is short for `outcome: [{move1:'r',move2:'r',xxx},{move1:'l',move2:'l',xxx}]` -- i.e. it duplicates the Outcome declaration for the two possibilities where the moves are the same.
     * Other shorthands are `diff`, `lr2` (which declares `lr` and then flips players 1 & 2 before declaring the symmetric `rl` equivalent), `any` (short for all four outcomes), `notll` (short for `lr`, `rl` and `rr`), `xl` (short for `ll` and `rl`), and so on.
     * Obviously, these shorthands only work if the moves are `l` and `r`. If there are more moves than that for a given Choice, you will need to roll the outcomes yourself.
 * As well as "move1" and "move2", an Outcome's **weight** attribute also allows it to be filtered by an arbitrary JavaScript expression, that can depend on the players' moves as well as the current game & player states.
     * Actually, this is a probabilistic weight that can be used to favor some outcomes stochastically over others. The expressions `$1` and `$2` can be used in the weight eval to refer to the players' moves.
     * By default, Outcomes are mutually exclusive: only one Outcome will be (randomly) selected for a given choice, proportionally by its weight (and consistent with player 1 & 2's moves). However, you can also flag an outcome as not being exclusive by setting its **exclusive** attribute to false.
 * An Outcome can generate zero new Choices (your story ends here), or one new Choice (turn to page X), or two new Choices (turn to page X, then when you have finished the sub-quest on that page, turn to page Y), or any number of new Choices. The list of Choice names generated by an Outcome is given by its **next** attribute (this can also be used to declare inline nested Choices, recursively).
     * It's actually not quite true to say that "your story ends here" if the Outcome produces no new choices. For one thing, the outro for the Outcome will still be shown. Furthermore, any choices that have been pushed onto the stack by previous outcomes will be visited (this is a context-free grammar, not just a state machine). If you want an Outcome to purge the stack of any pending Choices (e.g. a "sudden death" scenario), set its **flush** attribute.
 * An Outcome can influence player & game states, via its **mood1**, **mood2**, **global1**, **global2**, **local1**, **local2** and **common** attributes. These are JavaScript eval's, with the usual shorthands (`$g1`, `$g2`, `$l1`, `$l2`, `$c`) as well as a few others, like `$` for the old value of the state variable being updated, or `++` and `--` as shorthands for just bumping that variable up or down a notch.
 * An Outcome has associated with it an optional **outro** text that is shown before the intro of the next Choice. As with intros, outros can be as simple as text strings, or as complicated as a Choose-Your-Own-Adventure story. (Outro nodes have the same syntax as intro nodes: **text**, **left**, **right**, **next**, **hint**, **choice**, **name**, **goto**.)
 * Outcomes and Choices can play sound effects, show icons, change the CSS class of cards, etc.
* The story minilanguage is essentially a thin layer of preprocessing over this JSON format, auto-adding quotes around text fields (**intro**, **outro**, **text**) and adding a very little amount of context.
 * Lines beginning with hash characters are assumed to be keys for the JSON object in the current context.

Here is a (very simple) example of the story file format:

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
    

And here is the JSON it expands into (using the [loader script](bin/load-choices.js))

    [
      {
        "name": "prison",
        "scene": "init",
        "intro": [
          {
            "text": "You are in a cold, uncomfortable prison cell.;;The police say $other is singing like a bird. Your only hope is to rat them out and reduce your sentence.",
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
    
