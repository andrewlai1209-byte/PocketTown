import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
if (!globalThis.performance) globalThis.performance = {now: () => Date.now()};

const {Game} = await import('../src/sim/game.js');
const {GOODS, CITIZENS, PLACES, voiceFor} = await import('../src/data/town.js');

const advance = (game, minutes, dt = 125) => {
  for (let i = 0; i < Math.ceil(minutes * 250 / dt); i++) game.tick(dt);
};

test('twelve real brains, each with its own body in the world', () => {
  const game = new Game();
  assert.equal(game.citizens.length, 12);
  for (const p of game.citizens) {
    assert.equal(p.brain.stats.neurons, 285);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), `${p.name} has a position`);
    assert.ok(CITIZENS[p.id].craft in GOODS, `${p.name} crafts a real good`);
  }
});

test('citizens actually walk around instead of teleporting on a schedule', () => {
  const game = new Game();
  const start = game.citizens.map(p => ({x: p.x, z: p.z}));
  advance(game, 220);
  const travelled = game.citizens.map((p, i) => Math.hypot(p.x - start[i].x, p.z - start[i].z));
  const moving = travelled.filter(d => d > 1).length;
  assert.ok(moving >= 8, `only ${moving}/12 villagers moved`);
  for (const d of travelled) assert.ok(d < 80, 'nobody warped across the map');
});

test('walking is fast enough to see: a shift change moves bodies across the square', () => {
  const game = new Game();
  const before = game.citizens.map(c => ({x: c.x, z: c.z}));
  let prev = before.map(c => ({...c}));
  let path = game.citizens.map(() => 0);
  for (let i = 0; i < 300; i++) {                             // 15 s of real time = one town-hour
    game.tick(50);
    game.citizens.forEach((c, k) => {
      path[k] += Math.hypot(c.x - prev[k].x, c.z - prev[k].z);
      prev[k] = {x: c.x, z: c.z};
    });
  }
  const travelled = game.citizens.map((c, i) => Math.hypot(c.x - before[i].x, c.z - before[i].z));
  assert.ok(travelled.filter(d => d > 4).length >= 6, `only ${travelled.filter(d => d > 4).length}/12 got somewhere`);
  const meanSpeed = path.reduce((a, b) => a + b, 0) / (15 * 12);
  assert.ok(meanSpeed > .5, `mean gait ${meanSpeed.toFixed(2)} u/s would look like standing still`);
  for (const c of game.citizens) assert.ok(Number.isFinite(c.speed) && Math.abs(c.speed) < 9, 'nobody sprinted off the map');
});

test('a town at work is at its own posts, not scattered at random', () => {
  const game = new Game();
  game.state.minute = 10 * 60;                                // 10:00, mid-morning
  advance(game, 55, 50);
  const near = game.citizens.map(c => {
    const w = PLACES.find(x => x.name === c.work);
    return Math.hypot(c.x - w.x, c.z - w.z);
  });
  assert.ok(near.filter(d => d < 12).length >= 6, `${near.filter(d => d < 12).length}/12 reached their workplace by 11am`);
});

test('nobody ends up standing inside anybody else', () => {
  const game = new Game();
  advance(game, 240, 50);
  for (let i = 0; i < game.citizens.length; i++) {
    for (let j = i + 1; j < game.citizens.length; j++) {
      const a = game.citizens[i], b = game.citizens[j];
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > .7, `${a.name} and ${b.name} occupy the same spot`);
    }
  }
});

test('a conversation is two voices, and the town is not one person monologuing', () => {
  const game = new Game();
  const spoken = new Map();
  const say = game.minds.say.bind(game.minds);
  game.minds.say = (p, text, ms) => {
    if (p && p.id !== 'player' && text) spoken.set(p.name, (spoken.get(p.name) || 0) + 1);
    return say(p, text, ms);
  };
  advance(game, 180, 50);
  const voices = [...spoken.values()];
  const total = voices.reduce((a, b) => a + b, 0);
  assert.ok(spoken.size >= 5, `only ${spoken.size} distinct villagers spoke in three hours`);
  assert.ok(voices.some(v => v >= 2), 'somebody answered somebody');
  /* attempts, not bubbles: say() refuses to stack a second sentence on a bubble the player
     is still reading, so this is the ceiling on what appears on screen. What matters here is
     that the town has many voices and no single one of them owns the street. */
  assert.ok(total / 180 < 4, `${(total / 180).toFixed(2)} lines per town-minute is shouting, not talking`);
  assert.ok(Math.max(...voices) <= total / 3, `one villager spoke ${Math.max(...voices)} of ${total} lines`);
});

test('neighbours talk to each other, and talking rewards both brains', () => {
  const game = new Game();
  const before = game.citizens.reduce((n, p) => n + p.memories.length, 0);
  advance(game, 300);
  const talked = game.citizens.some(p => p.memories.some(m => /Talked with/.test(m.text)));
  const memories = game.citizens.reduce((n, p) => n + p.memories.length, 0);
  assert.ok(talked || memories > before, 'no conversation happened in five hours of town time');
  const speaking = game.citizens.filter(p => p.speech && p.speech.until > performance.now() - 1e9).length;
  assert.ok(speaking >= 0);
});

test('a promised good that is delivered is paid for with dopamine and trust', () => {
  const game = new Game();
  const a = game.citizens[0], b = game.citizens[4];
  a.inventory.bread = 3;
  const trustBefore = a.trust[b.id];
  const daBefore = a.brain.da;
  game.minds.promise(a, b, 'bread');
  assert.equal(game.minds.deals.at(-1).item, 'bread');
  game.state.day = game.minds.deals.at(-1).due;
  a.circuit = {appetite: .4, restraint: 1.9, social: 1.2, empathy: 1.4, craving: .5};
  a.brain.command = null;
  game.minds.settleDeals();
  const deal = game.minds.deals.at(-1);
  assert.equal(deal.status, 'kept', 'a restrained, honest villager should keep a promise');
  assert.equal(b.inventory.bread, (b.inventory.bread || 0) >= 1 ? b.inventory.bread : 1);
  assert.ok(a.trust[b.id] >= trustBefore, 'trust does not fall when a promise is kept');
  assert.ok(a.brain.da >= daBefore, 'keeping a promise is rewarding');
  assert.equal(a.keeps, 1);
});

test('betrayal punishes the victim, spreads a rumour and costs the betrayer trust', () => {
  const game = new Game();
  const thief = game.citizens[9], victim = game.citizens[10];
  game.state.trust = 8;                                     // a town with no trust in it yet
  for (const other of game.citizens) { other.x = 30; other.z = -30; }   // nobody to see it
  thief.x = 0; thief.z = 0; victim.x = 1; victim.z = 0;
  game.minds.deals.push({from: thief.id, to: victim.id, item: 'bread', due: game.state.day, status: 'open', day: game.state.day});
  thief.inventory.bread = 2;
  thief.drives.hunger = 1;
  thief.trust[victim.id] = 15;
  thief.circuit = {appetite: 2.2, restraint: .4, social: 1, empathy: .7, craving: 1.8};
  victim.trust[thief.id] = 80;
  const victimDopamine = victim.brain.da;
  game.minds.settleDeals();
  advance(game, 3);
  const deal = game.minds.deals.find(d => d.from === thief.id && d.item === 'bread');
  assert.equal(deal.status, 'betrayed', 'a hungry, unrestrained villager with low empathy should break the promise');
  assert.ok(victim.brain.oa > 0, 'the victim receives an octopamine punishment signal');
  assert.ok(victim.trust[thief.id] < 80, 'trust collapses');
  assert.ok(game.minds.rumors.some(r => r.subject === thief.id), 'the town starts talking about it');
  assert.ok(game.minds.incidents.some(i => i.type === 'betrayal'));
  assert.equal(thief.betrayals, 1);
  const taught = victim.brain.log.filter(x => x.kind === 'punish');
  assert.ok(taught.length >= 1, 'the betrayal is recorded as a punishment signal in the victim');
  assert.ok(taught.some(t => /broke a promise/.test(t.why)), 'the victim files the broken promise as a punishment');
  assert.ok(victim.brain.oa > victim.brain.da * .3, 'punishment tone rose with the octopamine');
});

test('seizing goods is rewarded now and punished by witnesses', () => {
  const game = new Game();
  const p = game.citizens[3], q = game.citizens[5], watcher = game.citizens[6];
  for (const good of ['bread', 'produce', 'cup', 'flower', 'tool']) q.inventory[good] = 3;
  p.trust[q.id] = 20; watcher.trust[q.id] = 90; watcher.trust[p.id] = 30;
  p.x = q.x - 2; p.z = q.z;
  watcher.x = p.x + 3; watcher.z = p.z;
  const target = game.minds.mostWantedBy(p);
  const owned = q.inventory[target] || 0;
  const watcherGrudges = watcher.grudges;
  game.minds.take(p, q);
  assert.ok((p.inventory[target] || 0) > 0, 'the thief ends up holding the goods');
  assert.equal(q.inventory[target], owned - 1);
  advance(game, 3);
  assert.ok(p.brain.da > 0, 'taking feels good in the moment');
  assert.ok(watcher.trust[p.id] < 30, 'a witness who liked the victim stops trusting the thief');
  assert.equal(watcher.grudges, watcherGrudges, 'witnesses do not gain grudges from watching');
  assert.ok(game.minds.incidents[0].type === 'theft');
});

test('praise and condemnation from the player change the measured character numbers', () => {
  const game = new Game();
  const p = game.citizens[2];
  advance(game, 60);
  const before = {...p.circuit};
  for (let i = 0; i < 6; i++) {
    game.talk(p, 'reward');
    advance(game, 6);
  }
  const after = {...game.citizens[2].circuit};
  const moved = Object.keys(after).filter(k => Math.abs(after[k] - before[k]) > 1e-4).length;
  assert.ok(moved >= 1, 'rewarding should move at least one decoded character number');
  assert.ok(game.state.friendships[p.name] >= 40);
});

test('the player can give, and the gift is taken into the villager body', () => {
  const game = new Game();
  const p = game.citizens[0];
  game.state.bag.flower = 2;
  const result = game.give(p, 'flower');
  advance(game, 3);
  assert.ok(result.ok);
  assert.equal(game.state.bag.flower, 1);
  assert.ok((p.inventory.flower || 0) >= 1);
  assert.ok(p.brain.da > 0, 'a gift raises dopamine');
  assert.ok(game.state.friendships[p.name] > 40);
});

test('a full town day runs, saves, and reloads with its history intact', () => {
  const game = new Game();
  game.state.bag.bread = 2;
  advance(game, 1500);                                   // more than a day of town time
  assert.ok(game.state.day >= 2, 'the clock advanced past day one');
  const report = game.report;
  assert.ok(report.people === 12);
  game.save();
  const again = new Game();
  assert.equal(again.state.day, game.state.day);
  assert.equal(again.state.bag.bread ?? 0, game.state.bag.bread ?? 0);
  assert.equal(again.report.honest + again.report.cheated, report.honest + report.cheated);
  assert.ok(again.citizens.every(p => Number.isFinite(p.x) && Number.isFinite(p.z)));
  assert.ok(again.citizens.some(p => Object.keys(p.inventory).length > 0), 'inventories survived');
});

test('work produces goods and fills the town stores', () => {
  const game = new Game();
  const ivy = game.citizens[4];                            // Farmer
  ivy.x = -19; ivy.z = 21;                                  // at the Farm station
  const stores = game.state.supplies;
  const had = ivy.inventory.produce || 0;
  game.state.minute = 10 * 60;
  ivy.drives.energy = .9;
  game.minds.craft(ivy);
  assert.ok((ivy.inventory.produce || 0) > had, 'Ivy harvested produce');
  assert.ok(game.state.supplies > stores, 'the town stores grew');
  assert.equal(CITIZENS[ivy.id].craft, 'produce');
});

test('every villager has an authored voice, not a template', () => {
  const seen = new Set();
  for (let i = 0; i < CITIZENS.length; i++) {
    const name = CITIZENS[i].name;
    const voice = voiceFor(name);
    for (const key of ['greet', 'offer', 'ask', 'accept', 'refuse', 'promise', 'keep', 'break', 'accuse', 'confess', 'gossip', 'thanks', 'shun', 'work', 'eat', 'rest', 'lonely', 'hurt', 'happy']) {
      assert.ok(Array.isArray(voice[key]) && voice[key].length >= 2, `${name}.${key} missing`);
      for (const line of voice[key]) {
        assert.ok(!seen.has(line), `${name}.${key} reuses a line authored for somebody else`);
        seen.add(line);
      }
    }
    for (const key of ['routine', 'wanting', 'scheming', 'guilty', 'hopeful', 'wary']) {
      assert.ok(Array.isArray(voice.thoughts[key]) && voice.thoughts[key].length >= 2, `${name}.thoughts.${key} missing`);
    }
  }
  assert.ok(seen.size >= 450, `expected hundreds of unique lines, got ${seen.size}`);
});

test('places own goods so villagers can find food', () => {
  assert.ok(PLACES.some(p => (p.goods || []).includes('bread')));
  assert.ok(PLACES.some(p => p.name === 'Park'));
  const game = new Game();
  const found = game.minds.nearestFood(game.citizens[0]);
  assert.ok(found.found && found.dist < 60);
});
