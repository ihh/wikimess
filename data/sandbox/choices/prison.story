#name prison
#scene init
You are in a cold, uncomfortable prison cell.
;;
The police say $other is singing like a bird.
Your only hope is to rat them out and reduce your sentence.
#hint ["Rat them out", "Stay quiet"]
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
#rr You both stay silent: nice work!
