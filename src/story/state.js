export const STORY_KEY='pocket-town-story-v1';

const chapters=[
['A Letter in the Frost','Meet Wren and learn why the winter shipment vanished.','Town Hall','Speak with Wren'],
['The Last Sheaf','Harvest the Farm’s final winter grain before the storm.','Farm','Harvest a sack of grain'],
['A Choice at the Granary','Decide who deserves the grain you worked to grow.','Farm','Choose the grain’s fate'],
['Mira’s Empty Oven','Carry the truth of the missing flour to the Bakery.','Bakery','Ask Mira about the flour'],
['A Fair Exchange','Find a way to feed the town without hiding the cost.','Market','Negotiate a food exchange'],
['The Maker’s Promise','Ask Finn to repair a pump that serves every home.','Workshop','Secure a repair kit'],
['Water for Everyone','Bring clean water back to the village square.','Park','Restore the public pump'],
['Names in the Ledger','Ask Sage to compare the shipment books.','Library','Inspect the winter ledger'],
['A Witness at Dusk','Find the person who saw the grain cart leave.','Café','Interview the evening witness'],
['The First Council','Bring evidence to Mayor Ellis before the storm.','Town Hall','Present your first report'],
['A Town Divided','Listen to both sides before choosing a plan.','School','Hold a listening circle'],
['The Quiet Storehouse','Look for a second cache beneath the old storehouse.','Farm','Search the storage shed'],
['Pip’s Drawing','Learn what a child saw from the schoolyard.','School','Study Pip’s sketch'],
['The Price of Silence','Ask June who paid for the missing delivery.','Market','Trace the payment'],
['Noah’s Warning','Check whether the town’s water has been tampered with.','Clinic','Test the well sample'],
['A Broken Seal','Compare a damaged wax seal with the council records.','Library','Match the seal'],
['A Message Unsent','Find the letter Wren never delivered.','Town Hall','Recover the undelivered letter'],
['Lanterns on the Lane','Follow a trail of lights after the last bell.','Park','Follow the lantern trail'],
['The Baker’s Account','Give Mira a safe chance to tell the whole story.','Bakery','Compare flour accounts'],
['A Familiar Footstep','Identify who has been following the witnesses.','Workshop','Check the muddy boot print'],
['The Second Council','Ask the village to protect its witnesses together.','Town Hall','Propose witness protection'],
['A Market in Shadow','Find out what changed hands after closing time.','Market','Reconstruct the night trade'],
['The Empty Remedy Jar','Learn why Noah’s medicine stock is disappearing.','Clinic','Audit the remedy shelf'],
['A Song at the Café','Use a familiar song to draw out a hidden memory.','Café','Ask for the old harvest song'],
['A Map Beneath the Floor','Recover the route drawn under the school stage.','School','Lift the loose floorboard'],
['Finn’s Missing Tools','Discover who borrowed the maker’s finest tools.','Workshop','Track the tool marks'],
['Rose Remembers','Ask Nana Rose about the town’s older winter pact.','Park','Hear Rose’s account'],
['The River Crossing','Inspect the crossing before the next shipment arrives.','Park','Secure the river crossing'],
['A False Confession','Test a confession that sounds too convenient.','Library','Verify the confession'],
['The Third Council','Choose how much truth the whole town can bear.','Town Hall','Call an open council'],
['The Night Courier','Find the courier who carried a sealed parcel.','Town Hall','Follow the courier route'],
['Bread for the Neighbours','Help Mira distribute food without keeping score.','Bakery','Organize a shared meal'],
['The Workshop Signal','Decode a signal hidden among the repair orders.','Workshop','Decode Finn’s order marks'],
['A Friend in the Clinic','Protect Noah after someone searches the clinic.','Clinic','Secure the medicine cabinet'],
['The Mayor’s Draft','Read a draft decree that was never made public.','Library','Find the draft decree'],
['A Bargain at Midnight','Meet a trader who offers answers at a dangerous price.','Market','Hear the midnight offer'],
['Leo’s Other Ledger','Compare Leo’s private figures with Sage’s records.','Café','Check the private ledger'],
['The Garden of Names','Find the names scratched beneath Rose’s garden bench.','Park','Read the hidden names'],
['A Door Left Open','Discover who let a stranger into the storehouse.','Farm','Rebuild the entry timeline'],
['The Fourth Council','Decide whether a confession can be trusted.','Town Hall','Hear the public testimony'],
['The Winter Road','Prepare a safe route for food and medicine.','Workshop','Build road markers'],
['A Letter to the South','Send proof beyond Pocket Town’s reach.','Town Hall','Dispatch the evidence'],
['The Long Thaw','Keep neighbours working together while the snow melts.','Farm','Coordinate a thaw harvest'],
['The House of Witnesses','Bring the scattered witnesses somewhere safe.','School','Open the witness shelter'],
['The Price of Loyalty','Face the friend who sold information about you.','Café','Confront the informant'],
['The Missing Page','Recover the last page that names the organizer.','Library','Find the missing page'],
['A Choice Before Dawn','Choose whether to expose the plan now or wait.','Park','Set the final signal'],
['The Last Delivery','Escort the town’s final winter delivery.','Market','Protect the grain cart'],
['The Fifth Council','Present the complete story and let the town answer.','Town Hall','Present the full case'],
['A Winter Promise','Choose the future Pocket Town will remember.','Town Hall','Choose the town’s future']
];
export const QUESTS=chapters.map(([title,description,destination,action],i)=>[title,description,destination,action]);
export function newStory(){return {version:1,stage:0,health:100,food:100,money:30,bag:{},clues:[],relations:{},log:['You arrived in Pocket Town. Find Wren at Town Hall.'],x:0,z:5,yaw:0,pitch:0,elapsed:0,ended:false,ending:'',risk:0,seed:Math.floor(Math.random()*4294967295),betrayals:0,kindTurns:0,suspicion:0,pendingChoice:null};}
export function roll(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
function normalizeStory(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||!Number.isInteger(value.stage)||value.stage<0||value.stage>QUESTS.length||!Number.isFinite(value.health)||!Number.isFinite(value.x)||!Number.isFinite(value.z)||!value.bag||typeof value.bag!=='object'||Array.isArray(value.bag)||!Array.isArray(value.clues))return null;
  const stage=Math.min(value.stage,QUESTS.length-1),ended=Boolean(value.ended)||value.stage===QUESTS.length;
  const pending=value.pendingChoice&&value.pendingChoice.stage===stage&&!ended?{stage}:null;
  const relations=value.relations&&typeof value.relations==='object'&&!Array.isArray(value.relations)?Object.fromEntries(Object.entries(value.relations).filter(([name,score])=>typeof name==='string'&&Number.isFinite(score))):{};
  const bag=Object.fromEntries(Object.entries(value.bag).filter(([name,count])=>/^[a-z]+$/.test(name)&&Number.isFinite(count)&&count>=0));
  return {...newStory(),...value,stage,ended,health:Math.max(0,Math.min(100,value.health)),food:Math.max(0,Math.min(100,finite(value.food,100))),money:Math.max(0,finite(value.money,30)),bag,clues:value.clues.filter(x=>typeof x==='string').map(x=>x.replace(/[<>]/g,'')),relations,log:Array.isArray(value.log)?value.log.filter(x=>typeof x==='string').map(x=>x.replace(/[<>]/g,'')).slice(0,40):[],x:Math.max(-34,Math.min(34,value.x)),z:Math.max(-34,Math.min(34,value.z)),yaw:finite(value.yaw,0),pitch:Math.max(-1.2,Math.min(1.2,finite(value.pitch,0))),elapsed:Math.max(0,finite(value.elapsed,0)),risk:Math.max(0,finite(value.risk,0)),seed:(finite(value.seed,0)>>>0),betrayals:Math.max(0,finite(value.betrayals,0)),kindTurns:Math.max(0,finite(value.kindTurns,0)),suspicion:Math.max(0,finite(value.suspicion,0)),ending:typeof value.ending==='string'?value.ending.replace(/[<>]/g,''):'' ,pendingChoice:pending};
}
export function readStory(){try{return normalizeStory(JSON.parse(localStorage.getItem(STORY_KEY)));}catch{return null;}}
export function importStory(text){let parsed;try{parsed=JSON.parse(text);}catch{throw new Error('Choose a Pocket Town story save exported from the journal.');}const story=normalizeStory(parsed);if(!story||!Array.isArray(parsed.log)&&parsed.log!==undefined)throw new Error('Choose a valid Pocket Town story save exported from the journal.');localStorage.setItem(STORY_KEY,JSON.stringify(story));return story;}
