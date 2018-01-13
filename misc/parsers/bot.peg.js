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
  = input:Input _ "=>" _ reaction:Reaction _ weight:Weight { return { input: input, dest: reaction.dest, output: reaction.output, weight: weight } }

Reaction
  = dest:Mood _ "{" output:NodeList "}" { return { dest: dest, output: output } }
  / dest:Mood { return { dest: dest } }
  / "{" output:NodeList "}" { return { output: output } }

Input
  = "{" _ kl:Keywords _ "}"  { return kl }
  / ""  { return [] }

Keywords
  = k:Keyword _ "," _ kl:Keywords  { return [k].concat(kl) }
  / k:Keyword { return [k] }

Keyword
  = kc:[a-zA-Z]+  { return kc.join("") }

Weight
  = nc:[0-9\+\-\.eE]+ { return parseFloat(nc.join("")) || 0 }
  / ""  { return 1 }
