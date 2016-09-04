/**
 * ChoiceController
 *
 * @description :: Server-side logic for managing choices
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

    // override blueprint for create, to allow inline specification of (CC,CD,DC,DD) outcomes
    create: function (req, res) {
        var body = req.body
        var outcomeContainer = {}
        var moves = ['c', 'd']
        moves.forEach (function (move1) {
            moves.forEach (function (move2) {
                var move = move1 + move2
                var moveOutcomes = body[move]
                if (moveOutcomes) {
                    // for convenience, single outcomes need not be wrapped as arrays
                    if (Object.prototype.toString.call(moveOutcomes) !== '[object Array]')
                        moveOutcomes = [moveOutcomes]
                    outcomeContainer[move] = moveOutcomes
                    delete body[move]
                }
            })
        })

        var outcomes = []
        var err
        moves.forEach (function (move1) {
            moves.forEach (function (move2) {
                if (!err) {
                    var move = move1 + move2, antiMove = move2 + move1
                    var moveOutcomes = outcomeContainer[move]
                    if (!moveOutcomes && outcomeContainer[antiMove])
                        moveOutcomes = outcomeContainer[antiMove].map (function (outcome) {
                            var outro = Game.swapTextRoles (outcome.outro)
                            var outro2 = outcome.outro2 ? Game.swapTextRoles (outcome.outro2) : null
                            var antiOutcome =  { outro: outro2 || outro }
                            var identicalKeys = ['weight', 'next', 'flush', 'cash']
                            identicalKeys.forEach (function (key) {
                                if (outcome.hasOwnProperty(key))
                                    antiOutcome[key] = outcome[key]
                            })
                            if (outcome.hasOwnProperty('cash1'))
                                antiOutcome.cash2 = outcome.cash1
                            if (outcome.hasOwnProperty('cash2'))
                                antiOutcome.cash1 = outcome.cash2
                            if (outro2)
                                antiOutcome.outro2 = outro
                            return antiOutcome
                        })

                    if (moveOutcomes) {
                        moveOutcomes.forEach (function (outcome) {
                            outcome.move1 = move1
                            outcome.move2 = move2
                            // symmetrize cash if applicable
                            if (outcome.hasOwnProperty('cash') && !outcome.hasOwnProperty('cash1') && !outcome.hasOwnProperty('cash2')) {
                                outcome.cash1 = outcome.cash2 = outcome.cash
                                delete outcome.cash
                            }
                            // wrap next as an array for convenience
                            if (outcome.next && Object.prototype.toString.call(outcome.next) !== '[object Array]')
                                outcome.next = [outcome.next]
                            outcomes.push (outcome)
                        })
                    } else
                        err = new Error ("Choice does not have any outcomes for (" + move1 + "," + move2 + ")")
                }
            })
        })

        if (err)
            res.status(400).send (err)
        else
            Choice.create ([body]).exec (function (err, choices) {
                if (err)
                    res.status(500).send (err)
                else if (choices.length != 1)
                    res.status(500).send (new Error("Could not create choice"))
                else {
                    var choice = choices[0]
                    outcomes.forEach (function (outcome) {
                        outcome.choice = choice.id
                    })
                    Outcome.create(outcomes).exec (function (err, createdOutcomes) {
                        if (err)
                            res.status(500).send (err)
                        else {
                            // go through some contortions to outwit name collision with virtual attribute for 'outcomes'...
                            var choiceCopy = {}
                            Object.keys(choice).forEach (function (key) { choiceCopy[key] = choice[key] })
                            choiceCopy.outcomes = createdOutcomes
                            res.json (choiceCopy)
                        }
                    })
                }
            })
    }
};

