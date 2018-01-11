Machine
  = _ machine:MoodDescriptions _ { return machine }

MoodDescriptions
  = md:MoodDescription _ machine:MoodDescriptions { return addToMachine(machine,md) }
  / md:MoodDescription { return initMachine(md) }

MoodDescription
  = ml:Moods _ ":" _ tl:Transitions { return [ml, tl] }

Moods
  = m:Mood _ "," _ ml:Moods { return [m].concat(ml) }
  / m:Mood { return [m] }

Mood
  = "@" m:Identifier  { return m }

Transitions
  = t:Transition _ tl:Transitions { return [t].concat(tl) }
  / t:Transition { return [t] }

Transition
  = input:Input _ "=>" _ reaction:Reaction _ delay:Delay { return { input: input, dest: reaction[0], output: reaction[1], rate: 1 / delay} }

Reaction
  = dest:Mood _ "{" output:NodeList "}" { return [dest, output] }
  / dest:Mood { return [dest, null] }
  / "{" output:NodeList "}" { return [null, output] }

Input
  = "{" _ kl:Keywords _ "}"  { return kl }
  / ""  { return [] }

Keywords
  = k:Keyword _ "," _ kl:Keywords  { return [k].concat(kl) }
  / k:Keyword { return [k] }

Keyword
  = kc:[a-zA-Z]+  { return kc.join("") }

Delay
  = nc:[0-9\+\-\.eE]+ { return parseFloat(nc.join("")) || 0 }
  / ""  { return 1 }
