const store = new Map();
globalThis.localStorage = {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)};
const {Game} = await import('../src/sim/game.js');

const game = new Game();
game.state.speed = 1;
const m = game.minds;

/* the sim measures bubble lifetimes on a wall clock; headless, that clock is the two
   seconds this script takes to run, so give the game a clock that follows simulated time */
let simMs = 0;
game.clockNow = () => simMs;

/* count what the town actually does: every bubble, every trade, every conversation that
   runs its course */
const counts = {speech: 0, replies: 0, trades: 0, talks: 0, notes: 0, acts: {}, byGoal: {}, byPerson: {}};
const say = m.say.bind(m);
m.say = (p, text, ms) => {
  const before = p?.speech?.until ?? 0;
  const out = say(p, text, ms);
  /* only lines the throttle actually let through are bubbles the player can see */
  if (p && p.id !== 'player' && p.speech && p.speech.text === text && p.speech.until > before) {
    counts.speech++;
    const k = p.goal?.kind ?? '?';
    counts.byGoal[k] = (counts.byGoal[k] || 0) + 1;
    counts.byPerson[p.name] = (counts.byPerson[p.name] || 0) + 1;
  }
  return out;
};
const perform = m.perform.bind(m);
m.perform = (p, action, other, hours) => {
  counts.acts[action] = (counts.acts[action] || 0) + 1;
  return perform(p, action, other, hours);
};
const runChats = m.runChats.bind(m);
m.runChats = () => runChats();
const talk = m.talk.bind(m);
m.talk = (p, o) => { counts.talks++; return talk(p, o); };
const notice = game.notice.bind(game);
game.notice = text => { counts.notes++; if (/⇄/.test(text)) counts.trades++; return notice(text); };

function snapshot(label) {
  const rows = game.citizens.map(c => `${c.name.split(' ')[0].padEnd(6)} (${c.x.toFixed(0)},${c.z.toFixed(0)}) spd=${c.speed.toFixed(1)} ${c.goal.kind}${c.speech && c.speech.until > simMs ? ' 💬' : ''}`);
  const near = game.citizens.map(c => Math.min(...game.citizens.filter(q => q !== c).map(q => Math.hypot(q.x - c.x, q.z - c.z))));
  const mean = a => (a.reduce((x, y) => x + y, 0) / a.length);
  console.log(`\n=== ${label} · day${game.state.day} ${game.time()} ===`);
  console.log('  ' + rows.slice(0, 6).join('  |  '));
  console.log('  ' + rows.slice(6).join('  |  '));
  console.log(`  mean |speed| ${mean(game.citizens.map(c => Math.abs(c.speed))).toFixed(2)} u/s · mean nearest-neighbour ${mean(near).toFixed(1)} u · speaking ${game.citizens.filter(c => c.speech && c.speech.until > simMs).length}`);
  console.log(`  speech ${counts.speech} · meetings ${counts.talks} · trades ${counts.trades} · ledger ${JSON.stringify(m.ledger)} · open ${m.deals.filter(d => d.status === 'open').length} · rumours ${m.rumors.length}`);
}

const start = game.citizens.map(c => ({x: c.x, z: c.z}));
const path = game.citizens.map(() => 0);
let prev = start.map(p => ({x: p.x, z: p.z}));
snapshot('start');
const TICKS = Number(process.argv[2] || 3000);
for (let i = 0; i < TICKS; i++) {
  simMs += 50 * game.state.speed;
  game.tick(50);
  game.citizens.forEach((c, k) => { path[k] += Math.hypot(c.x - prev[k].x, c.z - prev[k].z); prev[k] = {x: c.x, z: c.z}; });
}
const minutes = TICKS * 0.2;                            // 50 ms per tick, one town-minute per 250 ms at 1x
console.log(`\n${TICKS} ticks ≈ ${(TICKS * 50 / 1000).toFixed(0)} s of real time = ${minutes.toFixed(0)} town-minutes = ${(minutes / 60).toFixed(1)} town-hours`);
console.log('  net displacement :', game.citizens.map((c, i) => Math.hypot(c.x - start[i].x, c.z - start[i].z).toFixed(0)).join(' '));
console.log('  distance walked  :', path.map(d => d.toFixed(0)).join(' '));
snapshot('final');
console.log('  speech per town-hour:', (counts.speech / (minutes / 60)).toFixed(1), '· trades per town-hour:', (counts.trades / (minutes / 60)).toFixed(2));
console.log('  actions:', Object.entries(counts.acts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('  speech by goal:', Object.entries(counts.byGoal).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('  speech by person:', Object.entries(counts.byPerson).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' '));
console.log('  report:', JSON.stringify(game.report));
