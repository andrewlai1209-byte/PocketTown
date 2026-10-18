import {CONNECTOME as C} from '../data/connectome.gen.js';

/**
 * readout — a decoder that turns the learned state of one brain into four numbers a
 * town can act on.
 *
 * This is the honest bridge between "285 spiking cells" and "a person who decides to
 * cheat on a deal". Each number is the *average learned multiplier over a real set of
 * recorded connections*, so it moves only when reward or punishment has actually
 * potentiated or weakened that part of the wiring:
 *
 *   appetite   excitatory connections feeding the forward command system (AVB, AVE):
 *              how strongly "go get it" is wired in this villager
 *   restraint  inhibitory connections onto that same forward system, plus the ones
 *              feeding the reversal system (AVA, AVD, AVF, AVG, PVC): how well
 *              "don't, even though you want it" is wired
 *   social     connections leaving the cells that sense other animals — the pheromone,
 *              touch and substrate endings — into interneurons and commands: how much
 *              other people register at all
 *   empathy    connections feeding the eight dopaminergic cells (ADE, CEP, PDE) from
 *              those same social endings: whether company is *rewarding* by itself
 *
 * Nothing here is a personality constant. Train a villager and these four move, and
 * with them the mix of what they choose to say and do.
 */

const NEURON_BY_NAME = new Map(C.names.map((n, i) => [n, i]));
const nameCells = list => list.map(n => NEURON_BY_NAME.get(n)).filter(i => i !== undefined);

const SOCIAL_SENSORS = new Set(nameCells([
  'ADFL', 'ADFR', 'ASHL', 'ASHR', 'ASEL', 'ASER', 'AWAL', 'AWAR', 'AWBL', 'AWBR',
  'CEPVL', 'CEPVR', 'CEPDL', 'CEPDR', 'ALML', 'ALMR', 'AVML', 'AVMR', 'PVM', 'FLPL', 'FLPR',
  'PLML', 'PLMR', 'PDEL', 'PDER', 'ADLL', 'ADLR', 'ASGL', 'ASGR',
]));
const APPETITIVE_SENSORS = new Set(nameCells([
  'AWCL', 'AWCR', 'ASGL', 'ASGR', 'ASEL', 'ASER', 'BAGL', 'BAGR',
  'RIGL', 'RIGR', 'BDUL', 'BDUR', 'NSML', 'NSMR', 'ADFL', 'ADFR',
]));
const FORWARD_TARGETS = new Set(nameCells(['AVBL', 'AVBR', 'AVEL', 'AVER']));
const REVERSE_TARGETS = new Set(nameCells(['AVAL', 'AVAR', 'AVDL', 'AVDR', 'AVFL', 'AVFR', 'AVG', 'PVCL', 'PVCR', 'AVHL', 'AVHR']));
const DA_TARGETS = new Set(nameCells(['ADEL', 'ADER', 'CEPVL', 'CEPVR', 'CEPDL', 'CEPDR', 'PDEL', 'PDER']));

const sets = {appetite: [], restraint: [], social: [], empathy: [], craving: []};
for (let e = 0; e < C.edges.length; e++) {
  if (C.edges[e][3] === 1) continue;                 // gap junctions are not learnable here
  const pre = C.edges[e][0], post = C.edges[e][1];
  if (C.kind[post] !== 'neuron') continue;
  if (C.sign[pre] > 0 && FORWARD_TARGETS.has(post)) sets.appetite.push(e);
  /* restraint = every connection that could stop a reach: inhibition onto the forward
     command system, plus anything feeding the withdrawal system */
  if ((C.sign[pre] < 0 && FORWARD_TARGETS.has(post)) || REVERSE_TARGETS.has(post)) sets.restraint.push(e);
  if (SOCIAL_SENSORS.has(pre)) sets.social.push(e);
  if (SOCIAL_SENSORS.has(pre) && DA_TARGETS.has(post)) sets.empathy.push(e);
  if (APPETITIVE_SENSORS.has(pre)) sets.craving.push(e);
}

export const CIRCUIT_SIZES = Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.length]));

const mean = (brain, list) => {
  if (!list.length) return 1;
  let s = 0;
  for (let i = 0; i < list.length; i++) s += brain.w[list[i]];
  return s / list.length;
};

/**
 * Each number is expressed relative to this brain's own average learning. Reward happens
 * constantly in a living town, which inflates every synapse together; dividing by the
 * global mean leaves the interesting part — which circuits were potentiated *more* than
 * the rest of this brain — and keeps 1.0 meaning "typical for me".
 */
export function measure(brain) {
  let total = 0;
  for (let e = 0; e < brain.w.length; e++) total += brain.w[e];
  const baseline = Math.max(0.2, total / brain.w.length);
  return {
    appetite: +(mean(brain, sets.appetite) / baseline).toFixed(4),
    restraint: +(mean(brain, sets.restraint) / baseline).toFixed(4),
    social: +(mean(brain, sets.social) / baseline).toFixed(4),
    empathy: +(mean(brain, sets.empathy) / baseline).toFixed(4),
    craving: +(mean(brain, sets.craving) / baseline).toFixed(4),
    baseline: +baseline.toFixed(4),
  };
}

/** A short, human explanation of what is driving this brain right now. */
export function summarize(brain, circuit) {
  const ch = brain.channels;
  const drivers = brain.drivers(['sensory', 'command', 'interneuron']);
  const loudest = drivers[0] ? drivers[0].name : 'resting network';
  const move = ch.move > 0.25 ? 'moving toward' : ch.move < -0.25 ? 'pulling away from' : 'holding position near';
  const mood = brain.da > brain.oa * 1.6 ? 'encouraged' : brain.oa > brain.da * 1.3 ? 'stung' : brain.ht > .5 ? 'calm' : 'unsettled';
  return {loudest, move, mood, text: `${move} · ${mood} · led by ${loudest}`};
}

export const DECODER_INFO = {
  circuitSizes: CIRCUIT_SIZES,
  appetiteCells: [...FORWARD_TARGETS].map(i => C.names[i]),
  restraintCells: [...REVERSE_TARGETS].map(i => C.names[i]),
  socialSensors: [...SOCIAL_SENSORS].map(i => C.names[i]),
  dopamineCells: [...DA_TARGETS].map(i => C.names[i]),
};
