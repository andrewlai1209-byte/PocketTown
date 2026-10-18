#!/usr/bin/env node
/**
 * build-brain.mjs — compile the real C. elegans hermaphrodite nervous system that
 * ships with the OpenWorm c302 repository into one browser-ready module.
 *
 * Inputs (read-only, from the OpenWorm c302 folder):
 *   c302/data/herm_full_edgelist.csv             the connection graph, weights and types
 *   c302/data/owmeta_cache.json                  OpenWorm's own 302-cell roster: class,
 *                                                fast transmitter, receptor genes, label
 *   c302/data/Bentley_et_al_2016_expression.csv  extra neuropeptide / receptor citations
 *
 * Output: src/data/connectome.gen.js
 *
 * The script adds no connections and invents no cells. It only interprets:
 *   - cell class from owmeta's own class column, plus the command / feeding / motor
 *     roles implied by the recorded names;
 *   - a signed modulatory sensitivity per neuron computed from the receptor genes
 *     actually recorded for that neuron (Gi-coupled DOP-1/2/5 and MOD-1 depress,
 *     stimulatory DOP-3/4/7, SER-1/2/3/7 and OCTR-1 raise, LGC-53/55 depress,
 *     NPR-1 versus NPR-4 biases solitary against gregarious);
 *   - a sensory projection table naming which recorded ending carries which stimulus.
 */
import {readFileSync, writeFileSync, existsSync} from 'fs';
import {resolve, dirname} from 'path';
import {fileURLToPath} from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const WORM = process.argv[2] || 'C:/Users/ZenBook/Desktop/OpenWorm c302/c302';

const EDGELIST = resolve(WORM, 'data/herm_full_edgelist.csv');
const OWMETA = resolve(WORM, 'data/owmeta_cache.json');
const EXPRESSION = resolve(WORM, 'data/Bentley_et_al_2016_expression.csv');
for (const p of [EDGELIST, OWMETA, EXPRESSION]) if (!existsSync(p)) {
  console.error(`Missing OpenWorm source file: ${p}`);
  console.error('Usage: node scripts/build-brain.mjs "<path to OpenWorm c302/c302>"');
  process.exit(1);
}

const trim = s => String(s ?? '').replace(/^\uFEFF/, '').trim();

function parseCsv(path) {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const rows = []; let field = '', row = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => trim(c) !== ''));
}

/* owmeta writes VA1..VA9, the edgelist writes VA01..VA09. One canonical form is used
   for lookups; the edgelist spelling is kept for display. */
const canon = n => { const m = /^([A-Za-z]+?)(\d+)$/.exec(n); return m ? m[1] + String(+m[2]).padStart(2, '0') : n; };
const segment = name => { const m = /(\d+)$/.exec(name); return m ? +m[1] : 0; };

/* ---------------------------------------------------------------- topology */

const edgeRows = parseCsv(EDGELIST);
const head = edgeRows[0].map(trim);
const SI = head.indexOf('Source'), TI = head.indexOf('Target'), WI = head.indexOf('Weight'), TY = head.indexOf('Type');
if (SI < 0 || TI < 0 || WI < 0 || TY < 0) throw new Error('Unexpected edgelist header: ' + head.join(','));

const cache = JSON.parse(readFileSync(OWMETA, 'utf8'));
const NEURON_META = {};
for (const [k, v] of Object.entries(cache.neuron_info || {})) NEURON_META[canon(k)] = v;

const expr = parseCsv(EXPRESSION);
const eh = expr[0].map(trim);
const EA = eh.indexOf('Entity1'), ER = eh.indexOf('Relationship'), EB = eh.indexOf('Entity2');
const extra = new Map();
for (let r = 1; r < expr.length; r++) {
  const row = expr[r], a = canon(trim(row[EA])), rel = trim(row[ER]), b = trim(row[EB]);
  if (!a || !rel) continue;
  if (!extra.has(a)) extra.set(a, {peptides: new Set(), receptors: new Set(), transmitters: new Set()});
  const e = extra.get(a);
  if (rel === 'Neuropeptide') e.peptides.add(b);
  else if (rel === 'Receptor') e.receptors.add(b);
  else if (rel === 'Neurotransmitter') e.transmitters.add(b);
}

const names = new Set();
for (let r = 1; r < edgeRows.length; r++) { names.add(trim(edgeRows[r][SI])); names.add(trim(edgeRows[r][TI])); }
const ordered = [...names].sort((a, b) => canon(a).localeCompare(canon(b), 'en', {numeric: true}));
const index = new Map(ordered.map((n, i) => [n, i]));

/* ------------------------------------------------------- behaviour classes */

const COMMAND = new Set(['AVAL', 'AVAR', 'AVBL', 'AVBR', 'AVCL', 'AVCR', 'AVDL', 'AVDR', 'AVEL', 'AVER',
  'AVFL', 'AVFR', 'AVG', 'AVHL', 'AVHR', 'AVJL', 'AVJR', 'PVCL', 'PVCR']);
const cmdRole = {AVAL: 'reverse', AVAR: 'reverse', AVBL: 'forward', AVBR: 'forward', AVDL: 'reverse',
  AVDR: 'reverse', AVEL: 'forward', AVER: 'forward', AVFL: 'reverse', AVFR: 'reverse', AVG: 'reverse',
  AVHL: 'reverse', AVHR: 'reverse', AVCL: 'omegaTurn', AVCR: 'omegaTurn', PVCL: 'reverse', PVCR: 'reverse',
  AVJL: 'bias', AVJR: 'bias'};

/* owmeta's 302-cell roster carries 15 contractile cells that White (1986) listed
   beside the neurons: the 8 head muscles (SMB and SMD cells), the 5 pharyngeal
   pump and grinder muscles (M1, M2L/R, M3L/R) and the 2 accessory muscles
   ADAL/ADAR. They receive synaptic input and shorten; they are the output layer
   of this network, so they are placed on the effector side instead of being
   simulated as neurons. */
const EFFECTOR_OVERRIDE = new Set(['ADAL', 'ADAR', 'M1', 'M2L', 'M2R', 'M3L', 'M3R',
  'SMBDL', 'SMBDR', 'SMBVL', 'SMBVR', 'SMDDL', 'SMDDR', 'SMDVL', 'SMDVR']);

function muscleGroup(name) {
  if (/^dBWML\d+$/.test(name)) return 'dorsalLeft';
  if (/^dBWMR\d+$/.test(name)) return 'dorsalRight';
  if (/^vBWML\d+$/.test(name)) return 'ventralLeft';
  if (/^vBWMR\d+$/.test(name)) return 'ventralRight';
  if (/^(SMB|SMD)/.test(name)) return 'head';
  if (/^(pm|mc|MP|sph|grn)/.test(name) || /^M[123](L|R)?$/.test(name)) return 'pharyngeal';
  if (/^(um|vm)\d/.test(name)) return 'reproductive';
  return 'other';
}

/* Which recorded cell carries which stimulus. Every name below exists in this
   connectome; the modality is the one the cell is known for (Bargmann 2006,
   Goodman 2006, WormAtlas). */
const SENSE = {
  foodOdour: ['AWAL', 'AWAR', 'AWBL', 'AWBR', 'AWCL', 'AWCR', 'ASGL', 'ASGR', 'ADLL', 'ADLR'],
  tastant: ['ASEL', 'ASER', 'ASIL', 'ASIR', 'ASJL', 'ASJR', 'ASKL', 'ASKR'],
  pheromone: ['ADFL', 'ADFR', 'ASHL', 'ASHR', 'CEPVL', 'CEPVR', 'CEPDL', 'CEPDR'],
  CO2: ['AQR', 'PQR', 'URXL', 'URXR'],
  temperature: ['AFDL', 'AFDR', 'BAGL', 'BAGR', 'AIAL', 'AIAR'],
  touch: ['ALML', 'ALMR', 'AVML', 'AVMR', 'PVM', 'FLPL', 'FLPR', 'OLQDL', 'OLQDR', 'OLQVL', 'OLQVR',
    'IL1L', 'IL1R', 'IL2L', 'IL2R', 'AUAL', 'AUAR', 'PLNL', 'PLNR'],
  noxious: ['ASHL', 'ASHR', 'PLML', 'PLMR', 'PDEL', 'PDER'],
  internalState: ['RIGL', 'RIGR', 'DVC', 'BDUL', 'BDUR', 'NSML', 'NSMR', 'RICL', 'RICR', 'RIR', 'HSNL', 'HSNR'],
  stretch: ['SDQL', 'SDQR', 'DVA', 'LUAL', 'LUAR'],
  substrate: ['PVC', 'PVCL', 'PVCR', 'ALML', 'ALMR', 'PLML', 'PLMR'],
};
const senseOf = name => Object.keys(SENSE).filter(k => SENSE[k].includes(name));

const NT = {Acetylcholine: 'ach', Glutamate: 'glu', GABA: 'gaba', Dopamine: 'da', Serotonin: 'ht', Octopamine: 'oa', Tyramine: 'ta'};
const SIGN = {ach: 1, glu: 1, gaba: -1, da: .35, ht: .25, oa: -.35, ta: -.25, peptide: .2, muscle: 1};

/* Receptor profile → signed sensitivity, keyed on the genes owmeta lists per cell. */
const G = {
  daDown: ['DOP-1', 'DOP-2', 'DOP-5'], daUp: ['DOP-3', 'DOP-4', 'DOP-7'],
  htDown: ['MOD-1', 'SER-5', 'SER-6'], htUp: ['SER-1', 'SER-2', 'SER-3', 'SER-4', 'SER-7'],
  oaUp: ['OCTR-1', 'OCTR-2', 'OCTR-3'], taDown: ['TYRA-1', 'TYRA-2', 'TYRA-3'],
  exc: ['GLR-1', 'GLR-2', 'GLR-3', 'GLR-4', 'GLR-5', 'GLR-6', 'GLR-7', 'GLR-8', 'NMR-1', 'NMR-2',
    'DEL-3', 'DEL-4', 'GGR-1', 'GGR-2'],
  inh: ['LGC-53', 'LGC-55', 'AVR-14', 'GGR-3', 'SRA-11', 'UNC-73', 'CLR-1'],
  solitary: ['NPR-1', 'NPR-2'], gregarious: ['NPR-4', 'NPR-11', 'NPR-12'],
  arousal: ['UNC-68', 'SLO-1', 'EGL-19', 'TAC-1', 'CJL-16'],
};
const has = (list, genes) => genes.filter(g => list.includes(g)).length;
const norm = (n, over = 2) => Math.max(-1, Math.min(1, n / over));

let effectorByOverride = 0;
const cells = ordered.map(name => {
  const key = canon(name);
  const override = EFFECTOR_OVERRIDE.has(name) || EFFECTOR_OVERRIDE.has(key);
  const meta = override ? null : NEURON_META[key];
  const x = extra.get(key);
  const peptides = x ? [...x.peptides].sort() : [];
  if (!meta) {
    if (override) effectorByOverride++;
    return {name, kind: 'effector', cls: muscleGroup(name), nt: 'muscle', genes: [], peptides,
      d: 0, s: 0, o: 0, solo: 0, exc: 0, inh: 0, arouse: 0, sense: [], cmd: '',
      seg: /^(d|v)BWM[LR]/.test(name) ? segment(name) : 0};
  }
  const genes = [...new Set([...meta[2], ...(x ? [...x.receptors] : [])])].sort();
  const classes = meta[1] || [];
  const rawNt = (meta[3] || [])[0] || (x && [...x.transmitters][0]) || 'none';
  const nt = NT[rawNt] || 'peptide';
  const PHARYNX = /^I[1-6][LR]?$|^M[45][LR]?$|^NSM[LR]$|^MCL$|^MCR$|^MI$|^RIP[LR]$/;
  const MOTOR_BODY = /^V[AB]\d\d$|^D[ABG]\d\d$|^DD\d\d$|^VD\d\d$|^AS\d\d$|^VC\d\d$/;
  const cls = COMMAND.has(key) ? 'command'
    : PHARYNX.test(name) ? 'pharyngeal'
    : MOTOR_BODY.test(name) ? 'motorBody'
    : classes.includes('motor') ? 'motorHead'
    : classes.includes('sensory') ? 'sensory' : 'interneuron';
  return {
    name, kind: 'neuron', cls, nt, genes, peptides,
    d: +norm(has(G.daUp, genes) - has(G.daDown, genes)).toFixed(3),
    s: +norm(has(G.htUp, genes) - has(G.htDown, genes)).toFixed(3),
    o: +norm(has(G.oaUp, genes) - has(G.taDown, genes)).toFixed(3),
    solo: has(G.solitary, genes) > 0 && has(G.gregarious, genes) === 0 ? 1 : 0,
    exc: +norm(has(G.exc, genes), 3).toFixed(3),
    inh: +norm(has(G.inh, genes), 3).toFixed(3),
    arouse: +norm(has(G.arousal, genes), 2).toFixed(3),
    sense: senseOf(name),
    cmd: cmdRole[key] || '',
    seg: segment(name),
    label: meta[4] || name,
  };
});

/* ------------------------------------------------------------------- edges */

const TYPE_CODE = {chemical: 0, electrical: 1, electrical_synapse: 1, synapse: 0, neuromuscular: 0};
const edges = [];
for (let r = 1; r < edgeRows.length; r++) {
  const row = edgeRows[r];
  const s = index.get(trim(row[SI])), t = index.get(trim(row[TI]));
  const w = Number(trim(row[WI])), type = TYPE_CODE[trim(row[TY]).toLowerCase()] ?? 0;
  if (!Number.isFinite(w) || w <= 0 || s === undefined || t === undefined) continue;
  edges.push([s, t, Math.round(w), type]);
}

const musclesByGroup = {};
cells.forEach((c, i) => { if (c.kind === 'effector') (musclesByGroup[c.cls] ||= []).push(i); });

const neurons = cells.filter(c => c.kind === 'neuron').length;
const effectors = cells.length - neurons;
const chem = edges.filter(e => e[3] === 0).length, gap = edges.filter(e => e[3] === 1).length;
const withNt = cells.filter(c => c.kind === 'neuron' && c.nt !== 'peptide').length;
const withSense = cells.filter(c => c.sense.length).length;

const payload = {
  meta: {
    source: 'OpenWorm c302 · herm_full_edgelist.csv + owmeta_cache.json + Bentley 2016 expression',
    built: new Date().toISOString().slice(0, 10),
    cells: cells.length, neurons, effectors, edges: edges.length, chemical: chem, gapJunctions: gap,
    transmittersFromOwmeta: withNt, transmittersPeptidergic: neurons - withNt,
    effectorsReclassified: effectorByOverride, sensoryCells: withSense,
  },
  names: cells.map(c => c.name),
  kind: cells.map(c => c.kind),
  cls: cells.map(c => c.cls),
  nt: cells.map(c => c.nt),
  d: cells.map(c => c.d), s: cells.map(c => c.s), o: cells.map(c => c.o),
  solo: cells.map(c => c.solo), exc: cells.map(c => c.exc), inh: cells.map(c => c.inh),
  arouse: cells.map(c => c.arouse),
  peptides: cells.map(c => c.peptides),
  sense: cells.map(c => c.sense),
  cmd: cells.map(c => c.cmd),
  seg: cells.map(c => c.seg),
  sign: cells.map(c => SIGN[c.nt] ?? 1),
  edges,
  groups: Object.fromEntries(Object.entries(musclesByGroup).map(([k, v]) => [k, v])),
};

const banner = `/* GENERATED by scripts/build-brain.mjs — do not edit by hand.
 *
 * The real C. elegans hermaphrodite nervous system, compiled from the OpenWorm c302
 * repository: ${payload.meta.cells} cells (${neurons} neurons, ${effectors} effectors:
 * body-wall, head, pharyngeal, uterine and gut muscle), ${payload.meta.edges} connections
 * (${chem} chemical, ${gap} electrical gap junctions).
 *
 * Columns come from:
 *   names, edges, weights, type   -> data/herm_full_edgelist.csv
 *   cls (cell class), nt, genes   -> data/owmeta_cache.json (the OpenWorm database)
 *   peptides                      -> data/Bentley_et_al_2016_expression.csv
 *   d / s / o / solo / exc / inh  -> signed modulatory sensitivity computed from the
 *                                     receptor genes recorded for that exact cell
 *   sense                         -> which real sensory ending carries which stimulus
 * ${effectorByOverride} contractile cells that owmeta lists inside its 302-neuron roster (head,
 * pharyngeal and accessory muscles) were moved back to the effector side.
 */
export const CONNECTOME = ${JSON.stringify(payload)};
`;

writeFileSync(resolve(ROOT, 'src/data/connectome.gen.js'), banner);

const tally = key => Object.entries(cells.reduce((m, c) => (m[c[key]] = (m[c[key]] || 0) + 1, m), {}))
  .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ');
console.log(`cells ${cells.length}  neurons ${neurons}  effectors ${effectors}  (reclassified ${effectorByOverride})`);
console.log(`edges ${edges.length}  chemical ${chem}  electrical ${gap}`);
console.log('classes:', tally('cls'));
console.log('transmitters:', tally('nt'), `| known: ${withNt}/${neurons}`);
console.log(`sensory cells mapped: ${withSense}`);
console.log('command:', cells.filter(c => c.cmd).map(c => c.name + ':' + c.cmd).join(' '));
console.log('dopaminergic:', cells.filter(c => c.nt === 'da').map(c => c.name).join(' '),
  '| octopaminergic:', cells.filter(c => c.nt === 'oa').map(c => c.name).join(' '),
  '| serotonergic:', cells.filter(c => c.nt === 'ht').map(c => c.name).join(' '));
console.log('wrote src/data/connectome.gen.js,', (Buffer.byteLength(banner) / 1024).toFixed(1), 'KB');
