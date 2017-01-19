// Comparison insults (excluding simple variants e.g. "more X" <--> "no less X")
// the_subject_has less/fewer positive_abstract_noun than an_object
// the_subject_has more negative_abstract_noun than an_object
// the_subject's abstract_noun is more_negative_adjective than an_object
// the_subject's abstract_noun is less positive_adjective than an_object
// the_subject_is as adjective as an_object
// the_subject_is less positive_adjective than an_object
// the_subject_is more_negative_adjective than an_object
// the_subject intransitive_verbs like an_object
// the_subject transitive_verbs material_nouns like an_object
// the_subject intransitive_verbs as adverb as an_object
// the_subject transitive_verbs material_nouns as adverb as an_object
// the_subject intransitive_verbs less positive_adverb than an_object
// the_subject transitive_verbs material_nouns more negative_adverb than an_object
// the_subject doesn't intransitive_verb more positive_adverb than an_object

// Attributary insults (sound like, look like, feel like, smell of/like, taste of/like)
// the_subject attributary_verbs adjective
// the_subject attributary_verbs attributary_verb_preposition object
// the_subject attributary_verbs past_tense_negative_passive_verb
// the_subject attributary_verbs past_tense_negative_passive_verb by an_object
// the_subject attributary_verbs attributary_verb_preposition subject_it subject_was past_tense_negative_passive_verb by an_object

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
// it_causes_a_reaction -> it makes an_object attributary_verb positive_abstract_noun

// Menu symbols
// subject
// object
// positive_abstract_noun, negative_abstract_noun
// more_negative_adjective, more_positive_adjective
// positive_adjective, negative_adjective
// transitive_verb, intransitive_verb
// positive_adverb, negative_adverb
// material_noun, quality_noun, appearance_noun
// attributary_verb
// past_tense_negative_passive_verb
// active_verb
// affliction_proper_noun, location_proper_noun
// activity_verb

// Intermediate symbols
// than_an_object, like_an_object, as_an_object, by_an_object

(function() {
  // JavaScript helpers
  function extend() {
    var merged = {}
    Array.prototype.forEach.call (arguments, function (obj) {
      Object.keys(obj).forEach (function (key) { merged[key] = obj[key] })
    })
    return merged
  }
  function clone(obj) { return extend ({}, obj) }
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
  function sample1() { return { sample1: { opts: Array.prototype.map.call (arguments, to_node) } } }

  function label_list (label, props, list, hintMap) {
    hintMap = hintMap || capitalize
    var lpath = label.split('.'), lkey = lpath.pop()
    return list.map (function (item) {
      var l = clone(props), obj = { hint: hintMap (item), label: l }
      lpath.forEach (function(k) { l = l[k] })
      l[lkey] = item
      return obj
    })
  }

  // uncomment 'debug = 1' to show menus instead of sampling
  var debug = 1
  function debug_sample1() {
    var args = Array.prototype.slice.call(arguments,0)
    return typeof(debug) !== 'undefined'
      ? { text: "<happy>(DEBUG)</happy> <sadother>Select an option:</sadother>",
	  menu: args.map (function(opt) { return extend ({ hint: to_string(opt) }, to_node(opt)) }) }
    : sample1.apply(this,args)
  }
  function to_string(opt) { return typeof(opt) === 'string' ? opt : (isArray(opt) ? opt.map(to_string).join(' ') : JSON.stringify(opt)) }
  
  // Insult helpers
  function subject_list (person, list) {
    return label_list ('subject.text', { subject: { person: person } }, list)
  }

  function object_list (list, hintMap) {
    return label_list ('object', {}, list, hintMap)
  }

  function abstract_noun_list (list) {
    return label_list('abstract_noun',{},list,(noun) => 'Their '+noun)
  }

  function adjective_list (prefix,list,suffix) {
    return label_list('adjective',{},list,(noun) => prefix+noun+(suffix||''))
  }
  
  function insult(expr) {
    return { labexpr: { insult: expr } }
  }

  // Data
  return {
    name: "insult",
    intro:
    extend
    (seq (debug_sample1(['the_subject_has','less_positive_abstract_noun','than_an_object'],
			['the_subject_has','more_negative_abstract_noun','than_an_object'],
			['the_subjects','abstract_noun_is','more_negative_adjective','than_an_object'],
			['the_subjects','abstract_noun_is','less_positive_adjective','than_an_object'],
			['the_subject_is','as_adjective','as_an_object'],
			['the_subject_is','less_positive_adjective','than_an_object'],
			['the_subject_is','more_negative_adjective','than_an_object']
		       ),
	  { text: "Your insult is:\n\"<Label:insult >!\"" }),
     {define:
      // menus
      [{ name: 'select_subject',
	 text: "Let's start by picking a subject for your insult.",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ n: 2,
		opts: subject_list('s3',prefix_with('your ',['father','mother','brother','sister','husband','wife','girlfriend','boyfriend','spouse']))  // family members
	      },
	      { opts: subject_list('p3',prefix_with('your ',['rhymes','words','insults','jibes','slights','barbs']))
		.concat (subject_list('s3',prefix_with('this ',['conversation','exchange','back-and-forth'])))  // words
	      },
	      { opts: subject_list('s3',prefix_with('your ',['doctor','dentist','tailor','stylist','boss','hairdresser']))  // professional relationships
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
	     [{ opts: abstract_noun_list(['sense of style','taste','education','civility','courtesy','politeness','manners','breeding']) },  // class
	      { opts: abstract_noun_list(['kindness','honesty','virtue','diligence','industriousness','sexual morality','sobriety','competence','courage','honor']) },  // character
	      { opts: abstract_noun_list(['sexual performance','hygiene','cleanliness','attractiveness','prettiness','agility','gait','posture','height','muscles']) }] } } },  // appearance

       { name: 'select_negative_abstract_noun',
	 text: "What do you want to insult about them?",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ opts: abstract_noun_list(['boorishness','vulgarity','Justin Bieber records']) },  // class
	      { opts: abstract_noun_list(['indecency','filth','lechery','infamy','indiscretions']) },  // character
	      { opts: abstract_noun_list(['flab','stretch-marks','chins','cankles','love-handles','skid marks','halitosis','bad breath','bald patches']) }] } } },  // appearance

       { name: 'select_negative_adjective',
	 text: "What's bad about it?",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ opts: adjective_list('Too ',['tasteless','unfashionable','dated','incivil','crass','crude','boorish','outmoded','vulgar','jarring','discourteous','impolite','rude','ill-mannered','ill-bred','ignorant','uneducated']) },  // class
	      { opts: adjective_list('Too ',['indecent','cruel','vicious','mean','nasty','horrible','sadistic','selfish','lazy','spiteful','gossipy','venal','callous','thoughtless','weak','stupid','idiotic','banal','mundane','tedious','boring']) },  // character
	      { opts: adjective_list('Too ',['ugly','smelly','disgusting','unwashed','filthy','stinky','fat','skinny','short','stunted','gangly']) }] } } }, // appearance

       { name: 'select_positive_adjective',
	 text: "What's bad about it?",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ opts: adjective_list('Not ',['tasteful','fashionable','current','civil','well-educated','well-informed','well-rounded','well-bred','polite','courteous','genteel'],' enough') },  // class
	      { opts: adjective_list('Not ',['decent','kind','generous','compassionate','gentle','thoughtful'],' enough') },  // character
	      { opts: adjective_list('Not ',['sexy','fragrant','strong','clean','brave','well-toned','muscly','tall','powerful'],' enough') }] } } }, // appearance

       // sentence components
       defseq('the_subject_has',['select_subject',insult("[$label('subject.text'),$has_p($label('subject.person'))]")]),
       defseq('the_subject_is',['select_subject',insult("[$label('subject.text'),$is_p($label('subject.person'))]")]),
       defseq('the_subjects',['select_subject',insult("$poss($label('subject.text'))")]),

       extend({name:'select_abstract_noun'},debug_sample1('select_positive_abstract_noun','select_negative_abstract_noun')),
       defseq('less_positive_abstract_noun',['select_positive_abstract_noun',insult("$less($label('abstract_noun'))")]),
       defseq('more_negative_abstract_noun',['select_negative_abstract_noun',insult("['more',$label('abstract_noun')]")]),
       defseq('abstract_noun_is',['select_abstract_noun',insult("$is($label('abstract_noun'))")]),

       extend({name:'select_adjective'},debug_sample1('select_positive_adjective','select_negative_adjective')),
       defseq('more_negative_adjective',['select_negative_adjective',insult("$comp($label('adjective'))")]),
       defseq('less_positive_adjective',['select_positive_adjective',insult("['less',$label('adjective')]")]),
       defseq('as_adjective',['select_adjective',insult("['as',$label('adjective')]")]),
       
       defseq('than_an_object',['select_object',insult("['than',$a($label('object'))]")]),
       defseq('as_an_object',['select_object',insult("['as',$a($label('object'))]")])
      ]
     })
  }
})()
