Machine
  = _ machine:MoodDescriptions _

MoodDescriptions
  = md:MoodDescription _ machine:MoodDescriptions { return addToMachine(machine,md) }
  / md:MoodDescription { return initMachine(md) }

MoodDescription
  = ml:Moods _ ":" _ tl:Transitions { return [ml, tl] }

Moods
  = m:Mood _ "," _ ml:Moods { return [m].concat(ml) }
  / m:Mood { return [m] }

Mood
  = "@" Identifier

Transitions
  = t:Transition _ tl:Transitions { return [t].concat(tl) }
  / t:Transition { return [t] }

Transition
  = input:Input _ rate:Wait _ "=>" _ reaction:Reaction { return [input, rate].concat (reaction) }

Input
  = "{" _ Keywords _ "}"  { return keywords }
  / ""  { return [] }

Keywords
  = k:Keyword _ "," _ kl:Keywords  { return [k].concat(kl) }
  / k:Keyword { return [k] }

Keyword
  = [a-zA-Z]+

Wait
  = nc:[0-9\+\-\.eE]+ { return parseFloat(nc.join("")) || 0 }
  / ""  { return 1 }

Reaction
  = "{" output:RHS "}"  { return [null, output] }
  / dest:Mood _ "{" output:RHS "}"  { return [dest, output] }
  / dest:Mood  { return [dest, null] }
