// Comparison insults (excluding simple variants e.g. "more X" <--> "no less X")
// the_subject_has less/fewer positive_abstract_noun than an_object
// the_subject_has more negative_abstract_noun than an_object
// the_subject's abstract_noun is more_negative_adjective than an_object
// the_subject's abstract_noun is less positive_adjective than an_object
// the_subject_is as adjective as an_object
// the_subject_is less positive_adjective than an_object
// the_subject_is more_negative_adjective than an_object
// the_subject does_something like_an_object_does
// does_something -> nonreflexive_verbs
// does_something -> reflexive_verbs themself
// like_an_object_does -> like an_object
// like_an_object_does -> as adverb as an_object
// like_an_object_does -> less positive_adverb than an_object
// like_an_object_does -> more negative_adverb than an_object

// Perception insults (sounds like, looks like, feels like, smells like, tastes like)
// the_subject perception_verbs adjective
// the_subject perception_verbs like an_object
// the_subject perception_verbs past_tense_negative_passive_verb
// the_subject perception_verbs like subject_it subject_was past_tense_negative_passive_verb by an_object

// Prefixes and suffixes
// the_subject -> subject
// the_subject -> judging by subject_its appearance_noun, subject
// the_subject -> from the quality_noun of subject_its appearance_noun, it looks like subject
// the_subject_verb -> judging by subject_its appearance_noun, subject looks to verb
// the_subject_verb -> from the quality_noun of subject_its appearance_noun, subject looks to verb

// an_object -> an [adjective] object [object_qualifier]
// an_object -> an [adjective] object's object_property_noun [object_qualifier]
// object_property_noun -> appearance_noun | quality_noun | material_noun
// object_qualifier -> with affliction_proper_noun
// object_qualifier -> from location_proper_noun
// object_qualifier -> that has past_tense_active_verb a material_noun
// object_qualifier -> that was past_tense_negative_passive_verb by an object

// Threats, taunts, and commands
// i active_verb subject
// i active_verb subject with an_object
// go active_verb subject
// go active_verb an_object
// go active_verb subject or i will active_verb subject2
// go active_verb an_object or i will active_verb subject with an_object2

// Reaction statements
// the_subject_is_so_something it_causes_a_reaction
// the_subject_is_so_something, when subject_it activity_verbs, it_causes_a_reaction

// the_subject_is_so_something -> the_subject is so negative_adjective
// the_subject_is_so_something -> the_subject has so little positive_abstract_noun
// the_subject_is_so_something -> the_subject has so much negative_abstract_noun

// it_causes_a_reaction -> it makes me negative_reaction_adjective
// it_causes_a_reaction -> it makes me want to negative_reaction_verb
// it_causes_a_reaction -> it makes an_object perception_verb positive_abstract_noun

(function() {
  // JavaScript helpers
  function extend() {
    var merged = {}
    Array.prototype.forEach.call (arguments, function (obj) {
      Object.keys(obj).forEach (function (key) { merged[key] = obj[key] })
    })
    return merged
  }
  function clone(obj) {
    if (typeof(obj) !== 'object') return obj
    var cloned = {}
    Object.keys(obj).forEach (function(key) { cloned[key] = clone(obj[key]) })
    return cloned
  }
  function isArray (obj) { return Object.prototype.toString.call(obj) === '[object Array]' }

  // Grammar helpers
  function capitalize (text) { return text.charAt(0).toUpperCase() + text.substr(1) }

  function prefix_with(prefix,list) {
    return list.map (function (item) { return prefix + item })
  }

  function prefix_a(arg) {
    if (isArray(arg)) return arg.map(prefix_a)
    return arg.match(/^[aeiouAEIOU]/) ? ('an ' + arg) : ('a ' + arg)
  }

  // BigHouse helpers
  function goto(label) { return { 'goto': label } }
  function to_node(arg) { return isArray(arg) ? seq.apply(seq,arg) : ((typeof(arg) === 'string') ? goto(arg) : arg) }
  function seq() { return { sequence: Array.prototype.map.call (arguments, to_node) } }
  function defseq(name,opts) { return extend ({ name: name }, seq.apply(this,opts)) }
  function defsample(name,opts) { return extend ({ name: name }, debug_sample1.apply(null,opts)) }
  function sample1() { return { sample1: { opts: Array.prototype.map.call (arguments, to_node) } } }

  function label_list (label, list, propMap, hintMap) {
    propMap = propMap || {}
    if (typeof(propMap) === 'object') propMap = (function(obj) { return function() { return clone(obj) } }) (propMap)
    hintMap = hintMap || capitalize
    var lpath = label.split('.'), lkey = lpath.pop()
    return list.map (function (item, n) {
      var l = propMap(item,n), obj = { hint: hintMap (item,n), label: l }
      lpath.forEach (function(k) { l = l[k] })
      l[lkey] = item
      return obj
    })
  }

  function set(label,expr) {
    var obj = {}
    obj[label] = "[null," + expr + "]"
    return { labexpr: obj }
  }

  // uncomment 'debugMenus = 1' to show menus instead of sampling
  var debugMenus = 1
  function debug_sample1() {
    var args = Array.prototype.slice.call(arguments,0)
    return typeof(debugMenus) !== 'undefined'
      ? { text: "(DEBUG)",
	  menu: args.map (function(opt) { return extend ({ hint: to_string(opt) }, to_node(opt)) }) }
    : sample1.apply(this,args)
  }
  function to_string(opt) { return typeof(opt) === 'string' ? opt : (isArray(opt) ? opt.map(to_string).join(' ') : JSON.stringify(opt)) }
  
  // Insult helpers
  function score_prop_map (list, range) {
    range = range || { generic: [1,1] }
    return function (item, n) {
      var score = {}
      Object.keys(range).forEach (function (type) {
        var minScore = range[type][0], maxScore = range[type][1]
        score[type] = Math.round (minScore + (maxScore-minScore) * n / Math.max (1, list.length - 1))
      })
      return { score: score }
    }
  }

  function subject_list (person, list) {
    return label_list ('subject.np', list, { subject: { person: person } })
  }

  function object_list (list, hintMap) {
    return label_list ('object', list, {}, hintMap)
  }

  function abstract_noun_list (list, range) {
    return label_list ('abstract_noun', list, score_prop_map(list,range), (noun) => 'Their '+noun)
  }

  function adjective_list (prefix, list, suffix, range) {
    return label_list ('adjective', list, score_prop_map(list,range), (adj) => prefix+adj+(suffix||''))
  }

  function verb_list (prefix, list, suffix, range) {
    return label_list ('verb', list, score_prop_map(list,range), (verb) => prefix+verb+(suffix||''))
  }

  function adverb_list (prefix, list, suffix, range) {
    return label_list ('adverb', list, score_prop_map(list,range), (adv) => prefix+adv+(suffix||''))
  }

  function past_participle_list (list, range) {
    return label_list ('past', list, score_prop_map(list,range), (past) => 'Got '+past)
  }
  
  function insult(expr) {
    return { labexpr: { insult: expr } }
  }

  // Data
  return {
    name: "insult",
    effect: {
      local1: { score: "+= $1.magnitude()" },
      local2: { score: "+= $2.magnitude()" },
      outro: { text: "<angry>#{Label.capitalize($$.join('insult',' '))}#!</angry> <surprised:judge>Wow! #{Label.plural($$.magnitude(),'point')}#!</surprised:judge> <angryother>#{Label.capitalize($$o.join('insult',' '))}#!</angryother> <happy:judge>Oh, snap! #{Label.plural($$o.magnitude(),'point')}#!</happy:judge>" }
    },
    intro:
    extend
    (seq (debug_sample1(['the_subject_has','less_positive_abstract_noun','than_an_object'],
			['the_subject_has','more_negative_abstract_noun','than_an_object'],
			['the_subjects','abstract_noun_is','more_negative_adjective','than_an_object'],
			['the_subjects','abstract_noun_is','less_positive_adjective','than_an_object'],
			['the_subject_is','as_adjective','as_an_object'],
			['the_subject_is','less_positive_adjective','than_an_object'],
			['the_subject_is','more_negative_adjective','than_an_object'],
			['the_subject','does_something','like_an_object_does'],
			['the_subject','perception_verbs','perception_description']
		       ),
	  { text: "Your insult is \"<Label:insult >!\"\n<happy:judge>Hmm, pretty good: I rate the consistency of that insult as [[$percent($magnitude()/$taxicab())]]. Let's see what $other has to offer, before I give the final scores.</happy:judge>" }),
     {define:
      // menus
      [{ name: 'select_subject',
	 text: "Let's start by picking a subject for your insult.",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ n: 2,
		opts: subject_list('s3',prefix_with('your ',['father','mother','brother','sister','cousin','grandfather','grandmother','auntie','uncle','husband','wife','girlfriend','boyfriend','spouse']))  // family members
	      },
	      { opts: subject_list('s3',prefix_with('your ',['doctor','dentist','tailor','stylist','boss','hairdresser','professor','driving instructor','therapist','life coach']))  // professional relationships
	      },
	      { opts: subject_list('s2',['you']) }] } } },

       { name: 'select_object',
	 text: "What will you compare them to?",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ opts: object_list(['pig','cow','dog','turkey','chicken','weasel','monkey','horse','ape','gorilla','baboon','chimp','chimpanzee','lemur','lemming','whale','shrew','ass','donkey','mule','shrimp','cuttlefish','squid','goldfish','mouse','rat','hamster','guinea-pig'],(item)=>capitalize(prefix_a(item))) },  // animals
	      { opts: object_list(['imbecile','buffoon','idiot','fool','scoundrel','rascal','bastard','jock','punk','nerd','wussy','fop'],(item)=>capitalize(prefix_a(item))) },  // bad personal qualities
	      { opts: object_list(['anti-vaxer','flat-earther','climate denier','9-11 truther','conspiracy theorist','Luddite','fascist','Nazi','Communist','Socialist','Commie','Green','Environmentalist','Liberal','Conservative','Democrat','Republican'],(item)=>capitalize(prefix_a(item))) }] } } },  // political types

       { name: 'select_positive_abstract_noun',
	 text: "What do you want to insult about them?",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ opts: abstract_noun_list(['civility','politeness','courtesy','style','taste','education','manners','breeding'],
                                         {class:[1,6]}) },  // class
	      { opts: abstract_noun_list(['sexual morality','diligence','industriousness','sobriety','virtue','courage','honesty','kindness','honor'],
                                         {character:[1,10]}) },  // character
	      { opts: abstract_noun_list(['rhymes','words','barbs','insults','jibes','slights','wit','repartee','competence'],
                                         {intelligence:[1,8]}) },  // intelligence
	      { opts: abstract_noun_list(['sexual performance','height','cleanliness','prettiness','agility','poise','attractiveness','muscles','hygiene'],
                                         {appearance:[1,4]}) }] } } },  // appearance

       { name: 'select_negative_abstract_noun',
	 text: "What do you want to insult about them?",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ opts: abstract_noun_list(['boorishness','vulgarity'],
                                         {class:[1,2]}) },  // class
	      { opts: abstract_noun_list(['indecency','indiscretions','lechery','infamy','filth'],
                                         {character:[1,3]}) },  // character
	      { opts: abstract_noun_list(['foolishness','ineptitude','incompetence','idiocy','stupidity'],
                                          {intelligence:[1,2]}) },  // intelligence
	      { opts: abstract_noun_list(['cankles','love-handles','skid marks','halitosis','bald patches'],
                                          {appearance:[1,2]}) }] } } },  // appearance

       { name: 'select_negative_adjective',
	 text: "Why are they bad?",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ opts: adjective_list('Too ',['tasteless','unfashionable','dated','incivil','crass','crude','boorish','outmoded','vulgar','jarring','discourteous','impolite','rude','ill-mannered','ill-bred','ignorant','uneducated'],'',
                                     {class:[1,10]}) },  // class
	      { opts: adjective_list('Too ',['indecent','cruel','vicious','mean','nasty','horrible','sadistic','selfish','lazy','spiteful','gossipy','venal','callous','thoughtless','weak'],'',
                                     {character:[1,10]}) },  // character
	      { opts: adjective_list('Too ',['stupid','idiotic','banal','mundane','tedious','boring'],'',
                                     {intelligence:[1,10]}) },  // intelligence
	      { opts: adjective_list('Too ',['ugly','smelly','disgusting','unwashed','filthy','stinky','fat','skinny','short','stunted','gangly'],'',
                                     {appearance:[1,10]}) }] } } }, // appearance

       { name: 'select_positive_adjective',
	 text: "Why are they bad?",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ opts: adjective_list('Not ',['tasteful','fashionable','current','civil','well-educated','well-informed','well-rounded','well-bred','polite','courteous','genteel'],' enough',
                                     {class:[1,10]}) },  // class
	      { opts: adjective_list('Not ',['decent','kind','generous','compassionate','gentle','thoughtful'],' enough',
                                     {character:[1,10]}) },  // character
	      { opts: adjective_list('Not ',['smart','clever','witty','sharp','intelligent'],' enough',
                                     {intelligence:[1,10]}) },  // intelligence
	      { opts: adjective_list('Not ',['sexy','fragrant','strong','clean','brave','well-toned','muscly','tall','powerful'],' enough',
                                     {appearance:[1,10]}) }] } } }, // appearance

       { name: 'select_nonreflexive_verb',
	 text: "What's so bad about them?",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ opts: verb_list('The way they ',['behave','wear clothes'],'',
                                {class:[1,10]}) },  // class
	      { opts: verb_list('They way they ',['work'],'',
                                {character:[1,10]}) },  // character
	      { opts: verb_list('They way they ',['read','read books'],'',
                                {intelligence:[1,10]}) },  // intelligence
	      { opts: verb_list('They way they ',['walk'],'',
                                {appearance:[1,10]}) }] } } }, // appearance

       { name: 'select_reflexive_verb',
	 text: "What's so bad about them?",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ opts: verb_list('The way they ',['comport','carry'],' themselves',
                                {class:[1,10]}) },  // class
	      { opts: verb_list('They way they ',['carry'],' themselves',
                                {character:[1,10]}) },  // character
	      { opts: verb_list('They way they ',['preen'],' themselves',
                                {intelligence:[1,10]}) },  // intelligence
	      { opts: verb_list('They way they ',['clean'],' themselves',
                                {appearance:[1,10]}) }] } } }, // appearance

       defsample ('perception_verb', label_list ('perception_verb', ['smell', 'sound', 'taste', 'feel', 'look', 'seem'])),

       { name: 'select_passive_past_participle',
	 text: "What happened to [[$join('passive_verb_object')]]?",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ n: 3,
                opts: past_participle_list(['eaten','mauled','fondled','licked','kissed','hugged','ravaged','befriended','seduced','cuddled','wooed','courted','dishonored','deflowered']) }] } } },

       // sentence components
       defseq('the_subject_has',['select_subject',insult("[$label('subject.np'),$has_p($label('subject.person'))]")]),
       defseq('the_subject_is',['select_subject',insult("[$label('subject.np'),$is_p($label('subject.person'))]")]),
       defseq('the_subjects',['select_subject',insult("$poss($label('subject.np'))")]),
       defseq('the_subject',['select_subject',insult("$label('subject.np')")]),

       defsample('does_something',['reflexive_verbs','nonreflexive_verbs']),
       defseq('reflexive_verbs',['select_reflexive_verb',insult("[$conj($label('verb'),$label('subject.person')),$themself($label('subject.person'))]")]),
       defseq('nonreflexive_verbs',['select_nonreflexive_verb',insult("[$conj($label('verb'),$label('subject.person'))]")]),
       defseq('perception_verbs',['perception_verb',insult("[$conj($label('perception_verb'),$label('subject.person'))]")]),

       defsample('select_abstract_noun',['select_positive_abstract_noun','select_negative_abstract_noun']),
       defseq('less_positive_abstract_noun',['select_positive_abstract_noun',insult("$less($label('abstract_noun'))")]),
       defseq('more_negative_abstract_noun',['select_negative_abstract_noun',insult("['more',$label('abstract_noun')]")]),
       defseq('abstract_noun_is',['select_abstract_noun',insult("$is($label('abstract_noun'))")]),

       defsample('select_adjective',['select_positive_adjective','select_negative_adjective']),
       defseq('more_negative_adjective',['select_negative_adjective',insult("$more_adj($label('adjective'))")]),
       defseq('less_positive_adjective',['select_positive_adjective',insult("['less',$label('adjective')]")]),
       defseq('as_adjective',['select_adjective',insult("['as',$label('adjective')]")]),
       defseq('adjective',['select_adjective',insult("[$label('adjective')]")]),

       defseq('than_an_object',['select_object',insult("['than',$a($label('object'))]")]),
       defseq('as_an_object',['select_object',insult("['as',$a($label('object'))]")]),
       defseq('like_an_object',['select_object',insult("['like',$a($label('object'))]")]),
       defseq('by_an_object',['select_object',insult("['by',$a($label('object'))]")]),

       defseq('as_adverb_as_an_object',['select_adjective',insult("['as',$adverb($label('adjective'))]"),'as_an_object']),
       defseq('less_positive_adverb_than_an_object',['select_positive_adjective',insult("['less',$adverb($label('adjective'))]"),'than_an_object']),
       defseq('more_negative_adverb_than_an_object',['select_negative_adjective',insult("$more_adv($adverb($label('adjective')))"),'than_an_object']),

       defsample('like_an_object_does',['like_an_object','as_adverb_as_an_object','less_positive_adverb_than_an_object','more_negative_adverb_than_an_object']),
       defsample('perception_description',['adjective','like_an_object','passive_verbed',['like_it_was_passive_verbed','by_an_object']]),

       defseq('passive_verbed',['select_passive_past_participle',insult("[$label('past')]")]),
       defseq('like_it_was_passive_verbed',[insult("['like',$they($label('subject.person')),$was($label('subject.person'),'n')]"),set('passive_verb_object',"'them'"),'passive_verbed'])

      ]
     })
  }
})()
