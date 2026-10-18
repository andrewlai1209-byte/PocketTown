const store=new Map();
globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const {Game}=await import('./src/sim/game.js');
const {MORAL}=await import('./src/sim/minds.js');
if(process.env.MORAL) Object.assign(MORAL, JSON.parse(process.env.MORAL));
const days = Number(process.argv[2]||4);
const seedNote = process.argv[3]||'';
const game=new Game();
game.state.speed=1;
const ticks = Math.round(days*1440*5);                        // one town-minute per 200 ms at 1x
for(let i=0;i<ticks;i++) game.tick(50);
const r=game.report;
console.log(`MORAL=${JSON.stringify(MORAL)} days=${days} clock=day${game.state.day} ${game.time()} honest=${r.honest} broken=${r.broken} stolen=${r.stolen} promiseKeeping=${r.promiseKeeping}% fairness=${r.fairness}% trade=${r.tradeVolume} rumors=${r.rumors} openDeals=${r.openDeals} learned=${r.learned}`);
console.log('  incidents:', game.minds.incidents.slice(0,4).map(i=>`[${i.type}] ${i.text}`).join(' | '));
console.log('  ledger:', game.citizens.map(c=>`${c.name.split(' ')[0]}:${c.keeps}/${c.betrayals}`).join(' '));
console.log('  circuits:', game.citizens.map(c=>`${c.name.split(' ')[0]} a${c.circuit.appetite.toFixed(2)} r${c.circuit.restraint.toFixed(2)} s${c.circuit.social.toFixed(2)} e${c.circuit.empathy.toFixed(2)}${seedNote}`).join('\n            '));
console.log('  baseline mean w:', game.citizens.map(c=>c.circuit.baseline.toFixed(2)).join(' '));
console.log('  speech:', game.citizens.filter(c=>c.speech).slice(0,2).map(c=>c.name+': '+c.speech.text).join(' || '));
