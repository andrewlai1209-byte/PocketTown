import test from 'node:test';
import assert from 'node:assert/strict';
import {Brain, BRAIN_INFO, TUNE} from '../src/brain/network.js';
import {measure, CIRCUIT_SIZES} from '../src/brain/readout.js';
import {CONNECTOME} from '../src/data/connectome.gen.js';

const run = (brain, steps, dt = 5) => { for (let i = 0; i < steps; i++) brain.step(dt); return brain; };

test('the connectome really came from the OpenWorm files', () => {
  assert.equal(CONNECTOME.names.length, 448);
  assert.equal(CONNECTOME.meta.neurons, 285);
  assert.equal(CONNECTOME.meta.effectors, 163);
  assert.equal(CONNECTOME.edges.length, 7379);
  assert.equal(CONNECTOME.edges.filter(e => e[3] === 1).length, 2698, 'gap junctions as recorded');
  assert.ok(CONNECTOME.names.includes('AVAR') && CONNECTOME.names.includes('VB01') && CONNECTOME.names.includes('dBWML1'));
  assert.equal(BRAIN_INFO.effectors, 163);
});

test('reward is carried by the eight dopaminergic cells, punishment by octopamine cells', () => {
  assert.deepEqual(BRAIN_INFO.amineCells.dopamine.sort(),
    ['ADEL', 'ADER', 'CEPDL', 'CEPDR', 'CEPVL', 'CEPVR', 'PDEL', 'PDER']);
  assert.ok(BRAIN_INFO.amineCells.octopamine.length >= 2, 'RIC cells exist as the teaching channel');
  assert.ok(CIRCUIT_SIZES.appetite > 50 && CIRCUIT_SIZES.social > 100, 'decoder reads real edge sets');
});

test('same seed produces the same brain, different seeds diverge', () => {
  const a = run(new Brain(4242), 400);
  const b = run(new Brain(4242), 400);
  const c = run(new Brain(9001), 400);
  assert.equal(a.spikes, b.spikes);
  assert.ok(Math.abs(a.spikes - c.spikes) > 0 || a.stats.meanRate !== c.stats.meanRate, 'individuality between seeds');
});

test('the network is alive but not epileptic', () => {
  const brain = run(new Brain(77), 4000);                    // 20 s of brain time
  assert.ok(brain.stats.meanRate > 0.1, `mean firing too low: ${brain.stats.meanRate}`);
  assert.ok(brain.stats.meanRate < 25, `mean firing too high: ${brain.stats.meanRate}`);
  const rates = brain.top(3).map(t => t.rate);
  assert.ok(rates[0] > rates[2], 'top() is ordered by firing');
});

test('food and pain drive different motor output', () => {
  const fed = run(new Brain(31).sense({foodOdour: .9, tastant: .7, internalState: .9}), 3600);
  const hurt = run(new Brain(31).sense({noxious: 1, touch: .9, internalState: -.4}), 3600);
  assert.notEqual(fed.channels.pump, hurt.channels.pump);
  assert.notEqual(fed.channels.arousal, hurt.channels.arousal);
  for (const key of ['forward', 'reverse', 'tension', 'pump', 'arousal', 'arrest']) {
    assert.ok(Number.isFinite(fed.channels[key]) && fed.channels[key] >= -1 && fed.channels[key] <= 1, `${key} in range`);
  }
});

test('reward strengthens recently active synapses, punishment weakens them', () => {
  const base = run(new Brain(9), 1200);
  const before = [...base.w];
  const reward = new Brain(9); run(reward, 1200);
  run(reward, 120);                                       // no teaching: nothing should move
  let idleMoved = 0;
  for (let e = 0; e < reward.w.length; e++) if (Math.abs(reward.w[e] - before[e]) > 0.004) idleMoved++;
  assert.ok(idleMoved < 200, `untouched brain drifted on ${idleMoved} connections`);

  run(reward.sense({foodOdour: .8, internalState: .9}), 0);
  for (let i = 0; i < 150; i++) { reward.step(5); if (i % 20 === 0) reward.reward(1, 'bread'); }
  const punish = new Brain(9);
  run(punish.sense({noxious: .9, touch: .8}), 0);
  for (let i = 0; i < 150; i++) { punish.step(5); if (i % 20 === 0) punish.punish(1, 'caught'); }

  let up = 0, down = 0;
  const snapshot = before;
  for (let e = 0; e < reward.w.length; e++) {
    if (reward.w[e] > snapshot[e] + 0.002) up++;
    if (punish.w[e] < snapshot[e] - 0.002) down++;
  }
  assert.ok(up > 200, `reward strengthened only ${up} connections`);
  assert.ok(down > 200, `punishment weakened only ${down} connections`);
  assert.ok(up > 0 && down > 0);
});

test('company rewarded raises the social and empathy wiring more than food rewarded does', () => {
  const train = (stim, teach) => {
    const b = new Brain(2024);
    run(b, 400);
    b.sense(stim);
    for (let round = 0; round < 8; round++) {
      run(b, 100);
      teach(b);
      run(b, 60);
    }
    return measure(b);
  };
  const social = train({pheromone: .8, touch: .6, substrate: .5}, b => b.reward(1.2, 'company'));
  const food = train({foodOdour: .9, tastant: .8, internalState: .9}, b => b.reward(1.2, 'bread'));
  assert.ok(social.empathy > 1, 'empathy wiring grew from rewarded company');
  assert.ok(social.empathy > food.empathy, 'rewarded company should beat rewarded food on the empathy channel');
  assert.ok(food.craving >= 1, 'rewarded food leaves wanting wiring intact');
});

test('learning survives a save round trip', () => {
  const b = new Brain(606);
  b.sense({foodOdour: .7, internalState: .8});
  for (let i = 0; i < 400; i++) { b.step(5); if (i % 40 === 0) b.reward(1, 'ate'); }
  const saved = b.serialize();
  const clone = new Brain(606);
  clone.restore(saved);
  let worst = 0;
  for (let e = 0; e < b.w.length; e++) worst = Math.max(worst, Math.abs(b.w[e] - clone.w[e]));
  assert.ok(saved.flat.length >= 4, 'something was learned and stored');
  assert.ok(worst <= 0.051, `quantisation error too big: ${worst}`);   // drift under 0.05 is not stored
  assert.ok(JSON.stringify(saved).length < 60000, 'one brain stays small enough for localStorage');
});

test('homeostatic gain keeps a punished brain from going silent', () => {
  const b = new Brain(88);
  b.sense({noxious: .8, pheromone: .4});
  for (let i = 0; i < 1200; i++) { b.step(5); if (i % 25 === 0) b.punish(1, 'shunned'); }
  assert.ok(b.stats.meanRate > 0.3, `over-punished brain went quiet: ${b.stats.meanRate} Hz`);
  assert.ok(b.gain >= TUNE.gainMin - 1e-6 && b.gain <= TUNE.gainMax + 1e-6, 'gain stays inside its band');
});
