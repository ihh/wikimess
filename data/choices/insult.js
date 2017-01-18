// Comparison insults
// the_subject_has less/fewer positive_abstract_noun than an_object
// the_subject_has more negative_abstract_noun than an_object
// the_subject's abstract_noun is inferior_comparative_adjective than an_object
// the_subject's abstract_noun is no superior_comparative_adjective than an_object
// the_subject_is as adjective as an_object
// the_subject_is less positive_adjective than an_object
// the_subject_is more negative_adjective than an_object
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
// inferior_comparative_adjective, superior_comparative_adjective
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

  // Insult helpers
  function subject_list (person, list) {
    return label_list ('subject.text', { subject: { person: person } }, list)
  }

  function object_list (list, hintMap) {
    return label_list ('object', {}, list, hintMap)
  }

  function insult(expr) {
    return { labexpr: { insult: expr } }
  }

  // Data
  return {
    name: "insult",
    intro:
    extend
    (seq (sample1(['the_subject_has','less_positive_abstract_noun','than_an_object']),
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
		opts: subject_list('s3',prefix_with('your ',['father','mother','brother','sister','husband','wife','girlfriend','boyfriend','spouse']))
	      },
	      { opts: subject_list('p3',prefix_with('your ',['rhymes','words','insults','jibes','slights','barbs']))
		.concat (subject_list('s3',prefix_with('this ',['conversation','exchange','back-and-forth'])))
	      },
	      { opts: subject_list('s3',prefix_with('your ',['doctor','dentist','tailor','stylist','boss','hairdresser']))
	      },
	      { opts: subject_list('s2',['you']) }] } } },

       { name: 'select_object',
	 text: "What will you compare them to?",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ opts: object_list(['pig','cow','dog','turkey','chicken','weasel','monkey','horse','ape','gorilla','baboon','chimp','chimpanzee','lemur','lemming','whale','shrew','ass','donkey','mule','shrimp','cuttlefish','squid','goldfish','mouse','rat','hamster','guinea-pig'],(item)=>capitalize(prefix_a(item))) },
	      { opts: object_list(['imbecile','buffoon','idiot','fool','scoundrel','rascal','bastard','jock','punk','nerd','wussy','fop'],(item)=>capitalize(prefix_a(item))) },
	      { opts: object_list(['anti-vaxer','flat-earther','climate denier','9-11 truther','conspiracy theorist','Luddite','fascist','Nazi','Communist','Socialist','commie','green','liberal','conservative','Democrat','Republican'],(item)=>capitalize(prefix_a(item))) }] } } },

       { name: 'select_positive_abstract_noun',
	 text: "What do you want to insult about them?",
	 menu:
	 { sample:
	   { shuffle: true,
	     groups:
	     [{ opts: label_list('abstract_noun',{},['sense of style','taste','education','civility','courtesy','politeness','manners','breeding'],(noun) => 'Their '+noun) },
	      { opts: label_list('abstract_noun',{},['kindness','honesty','virtue','diligence','industriousness','sexual morality','sobriety','competence','courage','honor'],(noun) => 'Their '+noun) },
	      { opts: label_list('abstract_noun',{},['sexual performance','attractiveness','prettiness','agility','gait','posture','height','muscles'],(noun) => 'Their '+noun) }] } } },

       // sentence components
       defseq('the_subject_has',['select_subject',insult("[$label('subject.text'),$has($label('subject.person'))]")]),
       defseq('less_positive_abstract_noun',['select_positive_abstract_noun',insult("$less($label('abstract_noun'))")]),
       defseq('than_an_object',['select_object',insult("['than',$a($label('object'))]")])
      ]
     })
  }
})()
