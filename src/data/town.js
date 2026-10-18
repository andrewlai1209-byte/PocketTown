import {VOICES} from './voices.js';

/**
 * The town, its goods, and its twelve people.
 *
 * Everything a citizen *is* here is written by hand — their craft, what they want,
 * what they are known for, and the exact words they use. The numbers that decide how
 * they behave are not written here: those come from their brain (src/brain/network.js)
 * and from what that brain has been rewarded or punished for.
 */

export const PLACES = [
  {name:'Town Hall', type:'civic', x:0, z:-15, w:11, d:8, h:9, color:0xe4d8bd, roof:0x708ca3, icon:'🏛️',
    description:'Where promises are made in public and recorded.',
    stations:[{x:-3, z:-9}, {x:3, z:-9}], goods:['letter']},
  {name:'Bakery', type:'bakery', x:-18, z:-13, w:8, d:7, h:6, color:0xf0bf9d, roof:0xb96c61, icon:'🥐',
    description:'Produce in, bread out. The smell reaches the whole square.',
    stations:[{x:-18, z:-8}, {x:-15, z:-8}], goods:['bread']},
  {name:'Clinic', type:'clinic', x:18, z:-13, w:8, d:7, h:7, color:0xe6eee7, roof:0x6aafb0, icon:'🏥',
    description:'Rest and remedies, for anyone who can walk to the door.',
    stations:[{x:18, z:-8}, {x:21, z:-8}], goods:['remedy']},
  {name:'School', type:'school', x:-18, z:1, w:10, d:8, h:7, color:0xe6d19f, roof:0xc98962, icon:'🏫',
    description:'Lessons are given freely. Attention is the only fee.',
    stations:[{x:-18, z:6}, {x:-14, z:6}], goods:['lesson']},
  {name:'Café', type:'cafe', x:18, z:1, w:8, d:7, h:6, color:0xeebfae, roof:0x9e7798, icon:'☕',
    description:'Warm cups and long conversations. Rumours travel fastest here.',
    stations:[{x:18, z:6}, {x:22, z:6}], goods:['cup']},
  {name:'Farm', type:'farm', x:-19, z:17, w:11, d:8, h:5, color:0xccac74, roof:0x927c59, icon:'🌾',
    description:'The town’s food starts in this soil.',
    stations:[{x:-22, z:21}, {x:-16, z:21}, {x:-19, z:24}], goods:['produce']},
  {name:'Market', type:'market', x:18, z:17, w:10, d:8, h:6, color:0xc4ded0, roof:0x6ca396, icon:'🛒',
    description:'Barter floor. Anything can be traded here if two people want it.',
    stations:[{x:16, z:22}, {x:21, z:22}], goods:['produce', 'bread']},
  {name:'Workshop', type:'workshop', x:-4, z:20, w:8, d:7, h:6, color:0xbfc4c0, roof:0x637d8e, icon:'🛠️',
    description:'Broken things come in, tools go out.',
    stations:[{x:-6, z:24}, {x:-2, z:24}], goods:['tool']},
  {name:'Library', type:'library', x:8, z:20, w:9, d:7, h:7, color:0xdbc9ab, roof:0x8196b3, icon:'📚',
    description:'Books, quiet, and the town’s memory.',
    stations:[{x:8, z:24}, {x:11, z:24}], goods:['book']},
  {name:'Park', type:'park', x:1, z:9, w:14, d:11, h:1, color:0x86c995, roof:0x74a982, icon:'🌳',
    description:'Benches, one pond, seven trees, and flowers Nana Rose grows by the path.',
    stations:[{x:-2, z:9}, {x:4, z:10}], goods:['flower']},
];

export const GOODS = {
  produce: {label:'produce', icon:'🥬', food:.20, comfort:0, work:0, social:0, knowledge:0, note:'Anything cooked or mended starts here.'},
  bread:   {label:'bread', icon:'🍞', food:.34, comfort:.08, work:0, social:0, knowledge:0, note:'Mira’s loaves. Two days without it and people get short-tempered.'},
  remedy:  {label:'remedy', icon:'🧴', food:.05, comfort:.10, work:.22, social:0, knowledge:0, note:'Noah’s mixture. Takes the edge off exhaustion.'},
  tool:    {label:'tool', icon:'🔧', food:0, comfort:0, work:.32, social:0, knowledge:.04, note:'Finn’s work. Good tools make honest shifts shorter.'},
  cup:     {label:'warm cup', icon:'☕', food:.12, comfort:.20, work:.06, social:.12, knowledge:0, note:'Leo pours it, and people stay longer than they meant to.'},
  letter:  {label:'letter', icon:'✉️', food:0, comfort:.06, work:0, social:.34, knowledge:.06, note:'Someone else’s message in your hands. Wren carries them.'},
  flower:  {label:'flowers', icon:'🌼', food:0, comfort:.26, work:0, social:.18, knowledge:0, note:'From the park path. The usual way to say sorry.'},
  book:    {label:'book', icon:'📖', food:0, comfort:.06, work:.05, social:.04, knowledge:.30, note:'Sage keeps the shelves in order and remembers who took what.'},
  lesson:  {label:'lesson', icon:'✏️', food:0, comfort:.05, work:.10, social:.10, knowledge:.26, note:'Ada teaches anyone who sits down and stays.'},
};

/** A craft: where it happens, what it consumes, what it yields, and what it costs. */
export const CRAFTS = {
  produce: {place:'Farm', need:{}, yield:3, effort:14, note:'Ivy works the rows.'},
  bread:   {place:'Bakery', need:{produce:1}, yield:2, effort:11},
  remedy:  {place:'Clinic', need:{produce:1}, yield:1, effort:9},
  cup:     {place:'Café', need:{produce:1}, yield:2, effort:7},
  tool:    {place:'Workshop', need:{produce:1}, yield:1, effort:13},
  lesson:  {place:'School', need:{}, yield:1, effort:8},
  book:    {place:'Library', need:{}, yield:1, effort:5},
  letter:  {place:'Town Hall', need:{}, yield:2, effort:6},
  flower:  {place:'Park', need:{}, yield:2, effort:5},
};

export const CITIZENS = [
  {name:'Mira', role:'Baker', work:'Bakery', home:[-27, -23], color:0xe77f77,
    craft:'bread', wants:['produce', 'tool', 'flower'], knownFor:'handing out the first loaf',
    persona:'Warm, generous, and the town’s unofficial noticeboard.',
    shifts:[7, 19], haunts:['Bakery', 'Market', 'Town Hall']},
  {name:'Noah', role:'Doctor', work:'Clinic', home:[-18, -23], color:0x7ab8ac,
    craft:'remedy', wants:['produce', 'flower', 'book'], knownFor:'saying the hard thing plainly',
    persona:'Careful and principled; keeps the town honest about its limits.',
    shifts:[7, 20], haunts:['Clinic', 'Farm', 'Park']},
  {name:'Ada', role:'Teacher', work:'School', home:[18, -23], color:0x907db6,
    craft:'lesson', wants:['book', 'lesson', 'tool'], knownFor:'grading her own honesty publicly',
    persona:'Exacting and fair; measures effort, not charm.',
    shifts:[8, 17], haunts:['School', 'Library', 'Town Hall']},
  {name:'Leo', role:'Barista', work:'Café', home:[27, -23], color:0xc285a4,
    craft:'cup', wants:['produce', 'bread', 'flower'], knownFor:'promising before pouring',
    persona:'Charming, evasive, and the first to look for an angle.',
    shifts:[6, 15], haunts:['Café', 'Market', 'Town Hall']},
  {name:'Ivy', role:'Farmer', work:'Farm', home:[-28, 7], color:0xa5b669,
    craft:'produce', wants:['tool', 'bread', 'remedy'], knownFor:'never wasting anything',
    persona:'Steady and thrifty; the town eats because she does.',
    shifts:[5, 18], haunts:['Farm', 'Market', 'Workshop']},
  {name:'June', role:'Shopkeeper', work:'Market', home:[28, 7], color:0xe0a459,
    craft:'produce', wants:['bread', 'tool', 'cup'], knownFor:'friendship that costs nothing yet',
    persona:'Social and opportunistic; friendly fast, forgiving never.',
    shifts:[8, 19], haunts:['Market', 'Café', 'Farm']},
  {name:'Finn', role:'Maker', work:'Workshop', home:[-27, 28], color:0x799fbb,
    craft:'tool', wants:['produce', 'remedy', 'book'], knownFor:'fixing what he never agreed to fix',
    persona:'Terse and proud of his craft; despises anything thrown away.',
    shifts:[8, 18], haunts:['Workshop', 'Farm', 'Market']},
  {name:'Sage', role:'Librarian', work:'Library', home:[-17, 28], color:0xa18bbb,
    craft:'book', wants:['flower', 'book', 'lesson'], knownFor:'knowing who said what first',
    persona:'Thoughtful and conflict-avoidant; hears everything, repeats little.',
    shifts:[9, 18], haunts:['Library', 'School', 'Park']},
  {name:'Wren', role:'Mail Carrier', work:'Town Hall', home:[18, 28], color:0xe0b86c,
    craft:'letter', wants:['cup', 'bread', 'letter'], knownFor:'letters that arrive late, if at all',
    persona:'Chatty, everywhere, entrusted with the town’s messages.',
    shifts:[6, 18], haunts:['Town Hall', 'Café', 'Market']},
  {name:'Mayor Ellis', role:'Mayor', work:'Town Hall', home:[27, 28], color:0x708ba6,
    craft:'letter', wants:['lesson', 'book', 'tool'], knownFor:'council promises with no date on them',
    persona:'Strategic and image-conscious; wants the town to work, on camera.',
    shifts:[7, 20], haunts:['Town Hall', 'Market', 'Clinic']},
  {name:'Pip', role:'Student', work:'School', home:[-28, -5], color:0xe6a0a5,
    craft:'lesson', wants:['book', 'bread', 'cup'], knownFor:'repeating adults verbatim',
    persona:'Playful and honest; the worst secret-keeper in town.',
    shifts:[9, 15], haunts:['School', 'Park', 'Library']},
  {name:'Nana Rose', role:'Retired Neighbour', work:'Park', home:[28, -5], color:0xb49abb,
    craft:'flower', wants:['letter', 'flower', 'book'], knownFor:'remembering everyone’s grandmother',
    persona:'Wise, forgiving, lonely; sees people clearly and stays anyway.',
    shifts:[8, 19], haunts:['Park', 'Café', 'Bakery']},
];

/** Per-citizen voice pack, authored one person at a time in src/data/voices/. */
export const voiceFor = name => VOICES[name] || {greet: ['Hello there.'], thoughts: {routine: ['Another day in town.']}};

export const TRAITS = {
  Mira: 'generous', Noah: 'careful', Ada: 'exacting', Leo: 'opportunistic', Ivy: 'steady', June: 'trading',
  Finn: 'independent', Sage: 'observant', Wren: 'sociable', 'Mayor Ellis': 'political', Pip: 'innocent', 'Nana Rose': 'forgiving',
};

/* Backwards-compatible aliases for the modules written before the brain arrived. */
export const places = PLACES;
export const citizens = CITIZENS.map(({name, role, work, home, color}) => ({name, role, work, home, color}));
