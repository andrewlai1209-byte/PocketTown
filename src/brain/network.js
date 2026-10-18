import {CONNECTOME as C} from '../data/connectome.gen.js';

/**
 * Brain — a live spiking model of one real C. elegans hermaphrodite nervous system.
 *
 * The wiring is not stylised: every cell, connection, weight and connection type is the
 * recorded animal (see scripts/build-brain.mjs). What is simplified is the *dynamics*:
 * each neuron is a single-compartment conductance-based integrate-and-fire unit with
 * spike-frequency adaptation and a refractory period, instead of the multi-compartment
 * Hodgkin-Huxley trees that c302 generates for NEURON/openJMP. That trade is what buys
 * 285 neurons x 12 villagers in real time in a browser.
 *
 * Individuality is read out of the data rather than rolled:
 *   exc / inh     ionotropic excitatory versus inhibitory receptors recorded for that
 *                 exact cell -> resting threshold and synaptic gain
 *   arouse        modulatory GPCR load -> leak and adaptation strength
 *   d / s / o     signed sensitivity to its own dopamine / serotonin / octopamine tone
 *   peptides      neuropeptide payload -> how widely a spike is credited during learning
 *
 * Learning is three-factor, neuromodulated plasticity. Dopamine (ADE, CEP, PDE — the
 * eight cells owmeta marks as dopaminergic) carries reward, octopamine/tyramine (RIC)
 * carries punishment, serotonin (ADF, NSM, RIS, HSN, RIH) consolidates and calms. A
 * connection only changes when it fired inside the eligibility window *while* a modulator
 * was present, so a villager strengthens precisely the circuit that caused the outcome —
 * operant conditioning, implemented on real anatomy.
 */

const N = C.names.length;
const NEURONS = [], EFFECTORS = [];
for (let i = 0; i < N; i++) (C.kind[i] === 'neuron' ? NEURONS : EFFECTORS).push(i);
const isNeuron = Uint8Array.from(C.names.map((_, i) => (C.kind[i] === 'neuron' ? 1 : 0)));

/* ------------------------------------------------- shared graph, built once */

function buildCSR(filter, bySource = true) {
  const picked = [];
  for (let e = 0; e < C.edges.length; e++) if (filter(C.edges[e][3])) picked.push(e);
  const key = e => (bySource ? C.edges[e][0] : C.edges[e][1]);
  picked.sort((a, b) => key(a) - key(b));
  const start = new Int32Array(N + 1);
  let cursor = 0;
  for (let i = 0; i < N; i++) {
    start[i] = cursor;
    while (cursor < picked.length && key(picked[cursor]) === i) cursor++;
  }
  start[N] = picked.length;
  return {start, list: Int32Array.from(picked)};
}
const CHEM = buildCSR(t => t === 0);
const CHEM_IN = buildCSR(t => t === 0, false);
const GAP = buildCSR(t => t === 1);
const CHEM_COUNT = CHEM.list.length;
const SRC = Int32Array.from(C.edges, e => e[0]);
const DST = Int32Array.from(C.edges, e => e[1]);
const RAWW = Float32Array.from(C.edges, e => Math.sqrt(e[2]));   // compress the 1..142 range
const GAPW = Float32Array.from(C.edges, e => Math.min(6, e[2]));

const indexOfName = name => C.names.indexOf(name);
const pick = pred => NEURONS.filter(pred);

const CHANNELS = {};
for (let i = 0; i < N; i++) for (const key of C.sense[i]) (CHANNELS[key] ||= []).push(i);
const CHANNEL_LIST = Object.entries(CHANNELS).map(([key, cells]) => [key, Int32Array.from(cells)]);

const DA_CELLS = Int32Array.from(pick(i => C.nt[i] === 'da'));
const OA_CELLS = Int32Array.from(pick(i => C.nt[i] === 'oa' || C.nt[i] === 'ta'));
const HT_CELLS = Int32Array.from(pick(i => C.nt[i] === 'ht'));
const FORWARD = Int32Array.from(pick(i => C.cmd[i] === 'forward'));
const REVERSE = Int32Array.from(pick(i => C.cmd[i] === 'reverse'));
/* turning in this animal is head muscles plus the AVCh/RIM/AIB turn impulse */
const OMEGA = Int32Array.from(pick(i => C.cmd[i] === 'omegaTurn'
  || /^(RIM[LR]|AIB[LR]|AV[CR][LR]|RIA[LR])$/.test(C.names[i])));
const PHARYNX_NEURONS = Int32Array.from(pick(i => C.cls[i] === 'pharyngeal'));
/* lateralised head motor cells: the animal's own left/right steering apparatus */
const LEFT_TURN = Int32Array.from(['RMDL', 'SAAVL', 'AVCL', 'RIGL', 'ALML'].map(n => C.names.indexOf(n)).filter(i => i >= 0));
const RIGHT_TURN = Int32Array.from(['RMDR', 'SAAVR', 'AVCR', 'RIGR', 'ALMR'].map(n => C.names.indexOf(n)).filter(i => i >= 0));

const G = C.groups;
const BW_ALL = Int32Array.from([...(G.dorsalLeft || []), ...(G.dorsalRight || []), ...(G.ventralLeft || []), ...(G.ventralRight || [])]);
const BW_DORSAL = Int32Array.from([...(G.dorsalLeft || []), ...(G.dorsalRight || [])]);
const BW_VENTRAL = Int32Array.from([...(G.ventralLeft || []), ...(G.ventralRight || [])]);
const BW_LEFT = Int32Array.from([...(G.dorsalLeft || []), ...(G.ventralLeft || [])]);
const BW_RIGHT = Int32Array.from([...(G.dorsalRight || []), ...(G.ventralRight || [])]);
const BW_ANTERIOR = Int32Array.from([...(G.dorsalLeft || []), ...(G.dorsalRight || []), ...(G.ventralLeft || []), ...(G.ventralRight || [])].filter(i => C.seg[i] <= 12));
const BW_POSTERIOR = Int32Array.from([...(G.dorsalLeft || []), ...(G.dorsalRight || []), ...(G.ventralLeft || []), ...(G.ventralRight || [])].filter(i => C.seg[i] > 12));
const PHARYNX_MUSCLE = Int32Array.from(G.pharyngeal || []);
const HEAD_MUSCLE = Int32Array.from(G.head || []);

/* ------------------------------------------------------------ tunable gains */
export const TUNE = {
  EL: -65, EE: 0, EI: -82, VRESET: -70, ADAPT_CEIL: 26,
  leak: 1,
  chemGain: 0.030,        // sqrt(weight) -> conductance quantum
  gapGain: 0.022,
  synDecay: 17,           // ms
  stimGain: 15,           // mV of drive at a full stimulus
  gEcap: 1.15, gIcap: 1.4,
  refractory: 9,          // ms
  adaptStep: 2.6, adaptTau: 760,
  homeoTarget: 3.2,       // Hz mean firing the gain control defends
  homeoDead: 1.0,         // deadband: inside it the brain is left alone
  homeoRate: 0.00045,
  scaleRate: 0.055, gainMin: 0.70, gainMax: 1.60,
  tonic: 18,              // mV of spontaneous drive: a real animal is never silent
  noise: 2.6,             // mV of beat-to-beat jitter
  traceTau: 620, traceCap: 3,
  lrDa: 0.010, lrOa: 0.009, wMin: 0.45, wMax: 2.2, forget: 0.000006,
  scaleRate: 0.0016,      // homeostatic weight scaling per tick
  daRise: 0.026, oaRise: 0.030, htRise: 0.020, modTau: 420, tonicTau: 2600,
  kickReward: 11, kickPunish: 13, withdrawalPunish: 3.5,
};

const clamp = (x, lo, hi) => x < lo ? lo : x > hi ? hi : x;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Brain {
  constructor(seed = 1) {
    const T = TUNE;
    this.seed = seed >>> 0;
    const rand = mulberry32(this.seed);
    this.rand = rand;

    this.v = new Float32Array(N).fill(T.EL);
    this.leak = new Float32Array(N).fill(T.leak);
    this.tau = new Float32Array(N).fill(20);
    this.thrStatic = new Float32Array(N).fill(-52);
    this.adapt = new Float32Array(N);
    this.adaptStep = new Float32Array(N).fill(T.adaptStep);
    this.refr = new Float32Array(N);
    this.gE = new Float32Array(N);
    this.gI = new Float32Array(N);
    this.gap = new Float32Array(N);
    this.inj = new Float32Array(N);
    this.fired = new Uint8Array(N);
    this.rate = new Float32Array(N);
    this.muscle = new Float32Array(N);
    this.elig = new Float32Array(C.edges.length);
    this.w = new Float32Array(C.edges.length).fill(1);
    this.tonicA = new Float32Array(N);
    this.phase = new Float32Array(N);
    this.period = new Float32Array(N);

    const TONIC_BY_CLASS = {sensory: 1.15, command: .95, pharyngeal: 1.05, motorBody: .8, motorHead: .7, interneuron: .62};
    for (const i of NEURONS) {
      const jitter = () => 1 + (rand() - .5) * .35;
      this.thrStatic[i] = -52 - C.exc[i] * 4 + C.inh[i] * 5 + (rand() - .5) * 3.5;
      this.leak[i] = T.leak * (1 + C.arouse[i] * .35) * jitter();
      this.tau[i] = clamp((C.cls[i] === 'sensory' ? 14 : C.cls[i] === 'command' ? 24 : C.cls[i] === 'motorBody' ? 19 : 20) * jitter(), 7, 55);
      this.adaptStep[i] = T.adaptStep * (1 + C.arouse[i] * .9) * (C.cls[i] === 'sensory' ? 1.35 : 1);
      this.tonicA[i] = T.tonic * (TONIC_BY_CLASS[C.cls[i]] || .6) * (1 + C.exc[i] * .4) * jitter();
      this.phase[i] = rand() * 6.283;
      this.period[i] = 900 + rand() * 2400;
      this.v[i] = T.EL + (rand() - .5) * 5;
    }
    for (const i of EFFECTORS) { this.leak[i] = 1.1; this.tau[i] = 120; }

    this.da = 0; this.oa = 0; this.ht = 0;
    this.daTonic = 0; this.oaTonic = 0; this.htTonic = 0;   // baseline the burst is measured against
    this.homeo = 0;                 // slowly rising global inhibition, like the animal's own gain control
    this.stim = {};
    this.command = null;                  // set by an outside hand on the motor loop
    this.clock = 0;
    this.spikes = 0;
    this.flux = 0;                  // spikes per ms, smoothed
    this.lastSpike = new Float32Array(N).fill(-10000);
    this.pendingReward = 0;
    this.pendingPunish = 0;
    this.log = [];
    this.raster = [];
    this.rasterCap = 1200;
    this.ema = {};                        // per-feature baseline for self-normalisation
    this.lastDt = 5;
    this.gain = 1;                        // homeostatic global multiplier
    this.meanRate = 0;
    this.raw = {};
    this.channels = {forward: .5, reverse: .5, omega: .5, tension: .5, roll: 0, bend: 0, wave: 0, pump: .5, head: 0, arousal: .5, arrest: .3, move: 0};
  }

  /* ---------------------------------------------------------- input surface */

  /**
   * Set how strong each recorded stimulus is right now (roughly -1..1). Drive is injected
   * as current into the sensory cells that really carry that modality; nothing else in the
   * network is poked, so the decision is made by the connectome, not by a rule.
   */
  sense(next) { this.stim = {...this.stim, ...next}; return this; }

  /** Put a hand on the motor loop: go -1..1 (back..forward), turn -1..1 (left..right). */
  setCommand(go, turn) { this.command = Number.isFinite(go) || Number.isFinite(turn) ? {go, turn} : null; return this; }

  /** Dopamine teaching signal — "that was good", strengthen what just fired. */
  reward(amount = 1, why = '') { this.pendingReward = clamp(this.pendingReward + amount, 0, 3); this.note('reward', why, amount); }

  /** Octopamine/tyramine teaching signal — "that hurt", weaken what just fired. */
  punish(amount = 1, why = '') { this.pendingPunish = clamp(this.pendingPunish + amount, 0, 3); this.note('punish', why, amount); }

  note(kind, why, amount = 1) {
    this.log.unshift({t: Math.round(this.clock), kind, why, amount: +amount.toFixed(2)});
    if (this.log.length > 40) this.log.length = 40;
  }

  /* ----------------------------------------------------------------- step */

  step(dt) {                                  // dt in ms; 2..10 is the stable range
    const T = TUNE, {v, refr, adapt, leak, gE, gI, inj, fired, muscle, gap, rate} = this;
    this.clock += dt;
    this.lastDt = dt;
    fired.fill(0);

    /* 1. sensory drive into recorded endings */
    inj.fill(0);
    for (const [key, cells] of CHANNEL_LIST) {
      const raw = this.stim[key];
      if (!raw) continue;
      const value = clamp(raw, -1, 1);
      const amp = (value > 0 ? value : value * .7) * T.stimGain;
      for (let k = 0; k < cells.length; k++) {
        const i = cells[k];
        inj[i] += amp * (0.7 + C.exc[i] * .5) * (C.cls[i] === 'sensory' ? 1 : .45);
      }
    }

    /* spontaneous activity: a real animal is never silent, cells drift in and out of
       threshold on their own slow oscillation plus channel noise */
    const clock = this.clock;
    for (let n = 0; n < NEURONS.length; n++) {
      const i = NEURONS[n];
      inj[i] += this.tonicA[i] * (0.55 + 0.45 * Math.sin(clock / this.period[i] * 6.283 + this.phase[i]))
        + (this.rand() - .5) * T.noise;
    }

    /* 2. teaching currents enter through the cells that make those amines */
    if (this.pendingReward > 0) {
      const unit = Math.min(this.pendingReward, 1);
      for (const i of DA_CELLS) inj[i] += T.kickReward * unit;
      this.da = clamp(this.da + T.daRise * 6 * unit, 0, 1.5);
      this.pendingReward = Math.max(0, this.pendingReward - 1);
    }
    if (this.pendingPunish > 0) {
      const unit = Math.min(this.pendingPunish, 1);
      for (const i of OA_CELLS) inj[i] += T.kickPunish * unit;
      for (const i of REVERSE) inj[i] += T.withdrawalPunish * unit;    // hurt -> back away
      this.oa = clamp(this.oa + T.oaRise * 6 * unit, 0, 1.5);
      this.pendingPunish = Math.max(0, this.pendingPunish - 1);
    }

    /* 2b. an outside hand on the motor loop. This is current injected straight into this
       animal's own command and head-motor cells — the villager keeps contributing their
       own urges, so they can resist, lag behind, or shrug the stranger off. */
    if (this.command) {
      const go = clamp(this.command.go, -1, 1), turn = clamp(this.command.turn, -1, 1);
      const strength = T.stimGain * 1.25;
      if (go > .05) for (const i of FORWARD) inj[i] += strength * go;
      else if (go < -.05) for (const i of REVERSE) inj[i] += strength * -go * .9;
      if (turn < -.05) for (const i of LEFT_TURN) inj[i] += strength * -turn;
      else if (turn > .05) for (const i of RIGHT_TURN) inj[i] += strength * turn;
      if (Math.abs(turn) > .2) for (const i of OMEGA) inj[i] += strength * Math.abs(turn) * .4;
    }

    /* 3. gap junctions: ohmic, bidirectional coupling as recorded */
    gap.fill(0);
    for (let i = 0; i < N; i++) {
      const a = GAP.start[i], b = GAP.start[i + 1];
      if (a === b) continue;
      const vi = v[i];
      for (let p = a; p < b; p++) {
        const e = GAP.list[p], t = DST[e];
        gap[t] += (vi - v[t]) * GAPW[e] * T.gapGain * this.w[e] * this.gain;
      }
    }

    /* 4. integrate neurons */
    const daT = this.da, oaT = this.oa, htT = this.ht;
    const decaySyn = Math.exp(-dt / T.synDecay);
    const spiking = [];
    for (let n = 0; n < NEURONS.length; n++) {
      const i = NEURONS[n];
      rate[i] -= rate[i] * dt / 900;                       // firing-rate estimate relaxes to 0
      if (refr[i] > 0) { refr[i] -= dt; v[i] += (T.VRESET - v[i]) * Math.min(1, dt / 6); continue; }
      const threshold = this.thrStatic[i] - daT * C.d[i] * 5.5 - htT * C.s[i] * 3.5 + oaT * C.o[i] * 4.5 + adapt[i];
      const gain = 1 + daT * C.d[i] * .16 + htT * C.s[i] * .1;
      const current = (T.EL - v[i]) * (leak[i] + this.homeo)
        + gE[i] * (T.EE - v[i]) * gain
        + gI[i] * (T.EI - v[i])
        + inj[i] + gap[i];
      v[i] = clamp(v[i] + clamp(current * dt / this.tau[i], -30, 30), T.EI - 6, T.EE + 4);
      adapt[i] -= adapt[i] * dt / T.adaptTau;
      if (v[i] >= threshold) {
        v[i] = T.VRESET;
        fired[i] = 1;
        spiking.push(i);
        refr[i] = T.refractory + C.inh[i] * 2.5;
        adapt[i] = Math.min(T.ADAPT_CEIL, adapt[i] + this.adaptStep[i]);
        const isi = this.clock - this.lastSpike[i];
        rate[i] = rate[i] * .6 + (isi > 12 && isi < 6000 ? 1000 / isi : 6) * .4;
        this.lastSpike[i] = this.clock;
        this.spikes++;
        this.raster.push(this.clock, i);
        if (this.raster.length > this.rasterCap * 2) this.raster.splice(0, this.raster.length - this.rasterCap * 2);
      }
    }

    /* 5. chemical transmission + eligibility traces */
    this.flux += (spiking.length / dt - this.flux) * (1 - Math.exp(-dt / 260));
    const meanRateNow = this.meanRate = this.flux * 1000 / NEURONS.length;
    for (let n = 0; n < spiking.length; n++) {
      const i = spiking[n];
      const a = CHEM.start[i], b = CHEM.start[i + 1];
      const quantum = C.sign[i] < 0 ? gI : gE;
      const cap = C.sign[i] < 0 ? T.gIcap : T.gEcap;
      const modulator = C.sign[i] >= 0 ? 1 + daT * .18 : 1 + oaT * .25;
      for (let p = a; p < b; p++) {
        const e = CHEM.list[p], t = DST[e];
        quantum[t] = Math.min(cap, quantum[t] + RAWW[e] * this.w[e] * this.gain * T.chemGain * modulator * (isNeuron[t] ? 1 : 2.6));
        this.elig[e] = Math.min(T.traceCap, this.elig[e] + 1);
      }
    }
    /* coincidence tag: a post-synaptic spike re-credits the inputs that just drove it */
    for (let n = 0; n < spiking.length; n++) {
      const t = spiking[n];
      const a = CHEM_IN.start[t], b = CHEM_IN.start[t + 1];
      for (let p = a; p < b; p++) {
        const e = CHEM_IN.list[p];
        this.elig[e] = Math.min(T.traceCap, this.elig[e] + .5);
      }
    }

    /* 6. decay conductances, traces and slow forgetting */
    for (let n = 0; n < NEURONS.length; n++) { const i = NEURONS[n]; gE[i] *= decaySyn; gI[i] *= decaySyn; }
    const decayTrace = Math.exp(-dt / T.traceTau);
    for (let e = 0; e < C.edges.length; e++) {
      const tr = this.elig[e];
      if (tr) this.elig[e] = tr * decayTrace < 1e-3 ? 0 : tr * decayTrace;
      if (this.w[e] !== 1) this.w[e] += (1 - this.w[e]) * T.forget * dt;
    }

    /* 7. three-factor plasticity, gated by the *phasic* part of each amine signal.
       Tonic dopamine does not teach; a burst above this animal's own baseline does —
       that is the prediction-error signal the real ADE/CEP/PDE cells carry. */
    const daTonic = this.daTonic, oaTonic = this.oaTonic;
    const daPhase = Math.max(0, daT - daTonic - 0.09);
    const oaPhase = Math.max(0, oaT - oaTonic - 0.09);
    if (daPhase > 0.01 || oaPhase > 0.01) {
      const lr = daPhase > oaPhase ? T.lrDa * daPhase : -T.lrOa * oaPhase;
      for (let e = 0; e < C.edges.length; e++) {
        const tr = this.elig[e];
        if (tr < 0.3) continue;
        if (C.edges[e][3] === 1) continue;                       // gap junctions stay as recorded
        const pre = SRC[e], post = DST[e];
        const scope = isNeuron[post] ? 1 : .4;                   // neuromuscular learns slower
        const spread = 1 + Math.min(1.8, C.peptides[pre].length * .18);
        this.w[e] = clamp(this.w[e] + lr * tr * scope * spread, T.wMin, T.wMax);
        this.elig[e] = tr * 0.5;                                 // the trace is spent as it is used
      }
    }

    /* 7b. homeostatic gain control: a deadband around the animal's own target rate. This
       is a single global multiplier, so the per-connection record stays honest about what
       this villager actually learned from reward and punishment. */
    const err = T.homeoTarget - meanRateNow;
    if (Math.abs(err) > T.homeoDead) this.gain = clamp(this.gain * (1 + err * T.scaleRate * dt / 1000), T.gainMin, T.gainMax);

    /* 8. amine tone follows the firing of the amine cells themselves; the slow
       component is the animal's baseline, the fast one is what teaches */
    const count = (cells, arr) => { let k = 0; for (let n = 0; n < cells.length; n++) if (arr[cells[n]]) k++; return k; };
    this.da = clamp(this.da * Math.exp(-dt / T.modTau) + count(DA_CELLS, fired) * T.daRise, 0, 1.5);
    this.oa = clamp(this.oa * Math.exp(-dt / (T.modTau * .85)) + count(OA_CELLS, fired) * T.oaRise, 0, 1.5);
    this.ht = clamp(this.ht * Math.exp(-dt / (T.modTau * 1.6)) + count(HT_CELLS, fired) * T.htRise, 0, 1.2);
    const kTonic = 1 - Math.exp(-dt / T.tonicTau);
    this.daTonic += (this.da - this.daTonic) * kTonic;
    this.oaTonic += (this.oa - this.oaTonic) * kTonic;
    this.htTonic += (this.ht - this.htTonic) * kTonic;

    /* 9. homeostatic gain control keeps the network out of seizure and out of silence */
    const meanRate = meanRateNow;
    this.homeo = clamp(this.homeo + (meanRate - T.homeoTarget) * T.homeoRate * dt, 0, 1.6);

    /* 10. effectors: graded contraction, no spikes */
    for (let n = 0; n < EFFECTORS.length; n++) {
      const i = EFFECTORS[n];
      const drive = gE[i] * (T.EE - v[i]) + gI[i] * (T.EI - v[i]) + gap[i] - (v[i] - T.EL) * leak[i];
      v[i] = clamp(v[i] + clamp(drive * dt / this.tau[i], -12, 12) * .55, T.EL - 10, -20);
      gE[i] *= decaySyn; gI[i] *= decaySyn;
      muscle[i] = clamp(muscle[i] + (clamp((v[i] - T.EL) / 22, 0, 1) - muscle[i]) * dt / 70, 0, 1);
    }

    /* 11. behaviour readout. Motor features are normalised against this animal's own
       recent history: an urge is a relative state, so a calm citizen and a frantic one
       are both legible, and the same absolute voltage does not mean the same thing to
       two different brains. */
    const meanCells = cells => { if (!cells.length) return 0; let s = 0; for (let n = 0; n < cells.length; n++) s += rate[cells[n]]; return s / cells.length; };
    const avgMus = cells => { if (!cells.length) return 0; let s = 0; for (let n = 0; n < cells.length; n++) s += muscle[cells[n]]; return s / cells.length; };
    const raw = {
      forward: meanCells(FORWARD),
      reverse: meanCells(REVERSE),
      omega: meanCells(OMEGA) + avgMus(HEAD_MUSCLE) * 8,
      tension: avgMus(BW_ALL) * 100,
      roll: (avgMus(BW_LEFT) - avgMus(BW_RIGHT)) * 100,
      bend: (avgMus(BW_DORSAL) - avgMus(BW_VENTRAL)) * 100,
      wave: (avgMus(BW_ANTERIOR) - avgMus(BW_POSTERIOR)) * 100,
      pump: avgMus(PHARYNX_MUSCLE) * 100 + meanCells(PHARYNX_NEURONS),
      head: avgMus(HEAD_MUSCLE) * 100,
      arousal: meanRate,
    };
    this.raw = raw;
    const ch = this.channels;
    for (const key in raw) ch[key] = this.normalise(key, raw[key]);
    ch.roll = clamp(this.normalise('roll', raw.roll) * 2 - 1, -1, 1);
    ch.bend = clamp(this.normalise('bend', raw.bend) * 2 - 1, -1, 1);
    ch.wave = clamp(this.normalise('wave', raw.wave) * 2 - 1, -1, 1);
    ch.head = clamp(this.normalise('head', raw.head) * 2 - 1, -1, 1);
    ch.move = clamp(ch.forward - ch.reverse, -1, 1);
    ch.arrest = clamp((1 - ch.tension) * .55 + this.oa * .3 - this.da * .1, 0, 1);
  }

  /** Where this feature sits relative to this brain's own running baseline (0..1). */
  normalise(key, value) {
    const ema = this.ema[key] || (this.ema[key] = {m: value, s: Math.max(.5, Math.abs(value) * .2)});
    const k = 1 - Math.exp(-this.lastDt / 4200);
    const delta = value - ema.m;
    ema.m += delta * k;
    ema.s += (Math.abs(delta) - ema.s) * k * .8;
    return clamp(.5 + delta / (3.2 * (ema.s + .35)), 0, 1);
  }

  /* --------------------------------------------------------------- reports */

  /** Loudest recorded cells by their real names — used by the mind HUD. */
  top(k = 6) {
    const out = [];
    for (let n = 0; n < NEURONS.length; n++) {
      const i = NEURONS[n];
      out.push({i, name: C.names[i], cls: C.cls[i], nt: C.nt[i], rate: this.rate[i]});
    }
    return out.sort((a, b) => b.rate - a.rate).slice(0, k);
  }

  drivers(classes = ['sensory', 'command', 'interneuron']) {
    const out = [];
    for (const cls of classes) {
      const pool = this.top(NEURONS.length).filter(c => C.cls[c.i] === cls).slice(0, 2);
      for (const c of pool) out.push({name: c.name, cls, nt: c.nt, rate: +c.rate.toFixed(1)});
    }
    return out;
  }

  /** Recent spikes of one named cell, for the sparkline in the HUD. */
  recentSpikes(name, windowMs = 2500) {
    const i = indexOfName(name);
    if (i < 0) return [];
    const from = this.clock - windowMs;
    const hits = [];
    for (let p = this.raster.length - 2; p >= 0; p -= 2) {
      if (this.raster[p] < from) break;
      if (this.raster[p + 1] === i) hits.unshift(this.raster[p]);
    }
    return hits;
  }

  /** Learned part of this brain, sparsely and quantised, for the save file. */
  serialize() {
    const flat = [];
    for (let e = 0; e < C.edges.length; e++) {
      const d = this.w[e] - 1;
      if (Math.abs(d) > 0.05) flat.push(e, Math.round(clamp(d, -0.9, 2.4) * 250));
    }
    return {seed: this.seed, gain: +this.gain.toFixed(3), flat, clock: Math.round(this.clock), spikes: this.spikes};
  }

  restore(data) {
    if (!data) return;
    if (Number.isFinite(data.gain)) this.gain = clamp(data.gain, TUNE.gainMin, TUNE.gainMax);
    if (!Array.isArray(data.flat)) return;
    for (let i = 0; i < data.flat.length; i += 2) {
      const e = data.flat[i];
      if (e >= 0 && e < C.edges.length) this.w[e] = clamp(1 + data.flat[i + 1] / 250, TUNE.wMin, TUNE.wMax);
    }
    if (Number.isFinite(data.clock)) this.clock = data.clock;
    if (Number.isFinite(data.spikes)) this.spikes = data.spikes;
  }

  get stats() {
    let changed = 0;
    for (let e = 0; e < C.edges.length; e++) if (Math.abs(this.w[e] - 1) > 0.02) changed++;
    return {
      cells: N, neurons: NEURONS.length, effectors: EFFECTORS.length,
      connections: C.edges.length, chemical: CHEM_COUNT, electrical: C.edges.length - CHEM_COUNT,
      meanRate: +(this.flux * 1000 / NEURONS.length).toFixed(2),
      changed, gain: +this.gain.toFixed(2), homeo: +this.homeo.toFixed(3),
    };
  }
}

export const BRAIN_INFO = {
  meta: C.meta,
  neurons: NEURONS.length,
  effectors: EFFECTORS.length,
  connections: C.edges.length,
  stimulusChannels: CHANNEL_LIST.map(([k, v]) => ({key: k, cells: v.length})),
  muscleGroups: Object.fromEntries(Object.entries(G).map(([k, v]) => [k, v.length])),
  amineCells: {
    dopamine: [...DA_CELLS].map(i => C.names[i]),
    octopamine: [...OA_CELLS].map(i => C.names[i]),
    serotonin: [...HT_CELLS].map(i => C.names[i]),
  },
  commandCells: {forward: [...FORWARD].map(i => C.names[i]), reverse: [...REVERSE].map(i => C.names[i]), omega: [...OMEGA].map(i => C.names[i])},
};
