#name prison
#scene init
You are in a cold, uncomfortable prison cell.
;;
The police say $other is singing like a bird.
Your only hope is to rat them out and reduce your sentence.
#hint ["Rat them out", "Stay quiet"]
#cc {
  You both stay silent: good for you!
  #next {
    A life of crime awaits you on the outside.
  }
}
#cc You both stay silent: nice work!
#cd2 $player2 rats $player1 out.
#dd You both rat each other out.
