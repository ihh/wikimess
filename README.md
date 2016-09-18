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


# Story concepts

* A story is organized as a (stochastic) context-free grammar.
* Players have both global state (a JSON object persists between games) and local state (specific to a game). The game also has common state that is not associated particularly with either player. A game can modify any or all these states. They are also available to in-game JavaScript eval's, via the expressions `$global1`, `$global2`, `$local1`, `$local2`, `$common` or the shorthands `$g1`, `$g2`, `$l1`, `$l2`, `$c`.
* Each nonterminal in the grammar, called a **Choice**,
represents a finite-option two-player game
in the [game-theoretic](https://en.wikipedia.org/wiki/Game_theory) sense).
 * The two players make their moves "blind"; that is, they must each commit to a **move** without seeing what each other is doing.
 * They can however signal their intention, whether honestly or deceptively, by changing their **mood** avatar to one of the four available moods: _happy_, _angry_, _sad_, or _surprised_ (they can upload photos for all four of these).
 * Each Choice has a **name** that is used to identify it.
 * Each Choice has an **intro** that can be as simple as a text string or as complicated as a small self-contained Choose-Your-Own-Adventure story. (Key fields in an intro node: **text** for what's shown on the card, **left**/**right** for the next choice (or **next** if they're both the same), **hint** for the hint that's shown before swiping, **choice** to commit the player to a move on reaching that node, **name**/**goto** to jump around the DAG.)
 * By default the two available Moves in a Choice are just `l` and `r` (for _left_ and _right_), but they can be any text string that can go in a URL. There can also be more than two of them; if the intro is just a text string, however, then the Choice will present as a single card with a swipe-left-or-right decision, and so it only makes sense to have two moves in that case. For more than two moves it is necessary to set up a more complicated intro (e.g. a decision tree, or DAG, with multiple exit nodes, each of which could correspond to a different move).
* Each production rule in the grammar, called an **Outcome**, generates a sequence of additional Choices.
 * Each choice has a list of possible outcomes.
 * Outcomes are uniquely associated with a given Choice, and can be filtered by the moves made by each player using its **move1** and **move2** atttributes. For example, an Outcome might only be available if player 1 swiped right and player 2 swiped left: `{ move1: 'r', move2: 'l', ... }`
     * Alternatively, a syntactic sugar allows the quick declaration of (sets of) Outcomes with the moves already bound.
     * For example, `rl: {xxx}` is shorthand for `outcome: [{ move1: 'r', move2: 'l', xxx }]`
     * And `same: {xxx}` is short for `outcome: [{move1:'r',move2:'r',xxx},{move1:'l',move2:'l',xxx}]` -- i.e. it duplicates the Outcome declaration for the two possibilities where the moves are the same.
     * Other shorthands are `diff`, `lr2` (which declares `lr` and then flips players 1 & 2 before declaring the symmetric `rl` equivalent), `any` (short for all four outcomes), `notll` (short for `lr`, `rl` and `rr`), `xl` (short for `ll` and `rl`), and so on.
     * Obviously, these shorthands only work if the moves are `l` and `r`. If there are more moves than that for a given Choice, you will need to roll the outcomes yourself.
 * An Outcome's **weight** attribute can also be filtered by an arbitrary JavaScript expression, that can depend on the players' moves as well as the current game & player states. Actually, this is a probabilistic weight that can be used to favor some outcomes stochastically over others. The expressions `$1` and `$2` can be used in the weight eval to refer to the players' moves.
 * An Outcome can generate zero new Choices (your story ends here), or one new Choice (turn to page X), or two new Choices (turn to page X, then when you have finished the sub-quest on that page, turn to page Y), or any number of new Choices. The list of Choice names generated by an Outcome is given by its **next** attribute (this can also be used to declare inline nested Choices, recursively).
 * An Outcome can influence player & game states.
 * An Outcome has associated with it an optional **outro** text that is shown before the intro of the next Choice. As with intros, outros can be as simple as text strings, or as complicated as a Choose-Your-Own-Adventure story. (Outro nodes have the same syntax as intro nodes: **text**, **left**, **right**, **next**, **hint**, **choice**, **name**, **goto**.)
 * Outcomes and Choices can play sound effects, show icons, etc.
