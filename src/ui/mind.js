import {GOODS} from '../data/town.js';
import {BRAIN_INFO} from '../brain/network.js';
import {CONNECTOME} from '../data/connectome.gen.js';

const CELL_INDEX = new Map(CONNECTOME.names.map((n, i) => [n, i]));

/**
 * MindPanel — the instrument you are looking through when you are inside somebody.
 * Perception, drives, amine tone, the competing urges, the loudest cells of 285, and a
 * live spike raster. Nothing here is decoration: every bar is a value the brain produced.
 */

const SENSE_LABEL = {
  foodOdour: 'food smell', tastant: 'taste of it', internalState: 'gut state',
  pheromone: 'people nearby', touch: 'contact', substrate: 'voices & footsteps',
  noxious: 'harshness', temperature: 'temperature', CO2: 'crowd air', stretch: 'obligations',
};
const DRIVE_LABEL = {hunger: 'hunger', energy: 'energy', comfort: 'comfort', social: 'need for company', purpose: 'need to work', pride: 'pride', tension: 'tension'};
const CHANNEL_LABEL = {forward: 'go forward', reverse: 'back away', omega: 'turn', tension: 'body tension', pump: 'mouth / feeding', arousal: 'arousal', arrest: 'freeze'};
const CIRCUIT_LABEL = {appetite: 'reach-for-it wiring', restraint: 'braking wiring', social: 'other-people wiring', empathy: 'company-rewards-me wiring', craving: 'wanting wiring', baseline: 'overall potentiation'};
const TRACK = ['AVAR', 'AVAL', 'AVBL', 'ASER', 'ADEL', 'CEPVL', 'NSML', 'RIML', 'AIBR', 'RICL', 'AWCR', 'PLMR'];

const bar = (label, value, {min = 0, max = 1, tone = 'teal', suffix = '', digits = 2} = {}) => {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return `<div class="row ${tone}"><span class="k">${label}</span><span class="v">${value.toFixed(digits)}${suffix}</span>
    <i class="track"><b style="width:${pct.toFixed(1)}%"></b></i></div>`;
};

export class MindPanel {
  constructor(app) {
    this.app = app;
    this.game = app.game;
    this.el = document.getElementById('mind');
    this.open = false;
    this.el.addEventListener('click', event => {
      const button = event.target.closest('[data-mind]');
      if (!button) return;
      this.handle(button.dataset.mind, app.ui);
    });
  }

  show() { this.el.classList.remove('hidden'); this.open = true; }
  hide() { this.el.classList.add('hidden'); this.open = false; }

  update() {
    const id = this.game.possessing;
    if (id == null) return this.hide();
    const m = this.game.minds.mindPanel(id);
    if (!m) return this.hide();
    this.show();
    const p = m.person;
    const wheelOn = this.game.minds.wheel?.id === id;

    const senses = Object.entries(p.lastSenses || {}).map(([k, v]) =>
      bar(SENSE_LABEL[k] || k, Math.max(-1, Math.min(1, v)), {min: -1, max: 1, tone: v < 0 ? 'cool' : 'warm', digits: 2})).join('');
    const drives = Object.entries(m.drives).map(([k, v]) =>
      bar(DRIVE_LABEL[k] || k, v, {tone: k === 'tension' ? 'hot' : 'teal'})).join('');
    const channels = ['forward', 'reverse', 'omega', 'tension', 'pump', 'arousal', 'arrest'].map(k =>
      bar(CHANNEL_LABEL[k] || k, m.channels[k] ?? 0, {tone: k === 'arrest' ? 'hot' : 'teal'})).join('');
    const circuit = Object.entries(m.circuit).map(([k, v]) =>
      bar(CIRCUIT_LABEL[k] || k, v, {min: 0.4, max: 1.6, tone: 'brain', digits: 3})).join('');
    const urges = Object.entries(m.urges).filter(([, v]) => v > 0.02)
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, v]) => bar(verb(k), v, {min: 0, max: 1.6, tone: k === 'take' ? 'hot' : 'teal'})).join('');
    const cells = m.top.map(c => `<li><b>${c.name}</b><span>${c.cls}</span><i>${c.rate.toFixed(1)} Hz</i></li>`).join('');
    const goods = Object.entries(m.inventory).filter(([, n]) => n > 0)
      .map(([k, n]) => `<span class="chip">${GOODS[k]?.icon || '📦'} ${GOODS[k]?.label || k} ×${n}</span>`).join('') || '<span class="chip">nothing</span>';
    const teaching = (m.teaching || []).slice(0, 5).map(t =>
      `<p class="news ${t.kind}">${t.kind === 'reward' ? 'dopamine' : 'octopamine'} · ${t.why}</p>`).join('') || '<p class="news">Nothing has been rewarded or punished yet today.</p>';
    const trust = m.trust.map(t => bar(t.name, t.value, {min: 0, max: 100, tone: t.value < 35 ? 'hot' : 'teal', digits: 0})).join('');

    this.el.innerHTML = `
      <div class="mindhead">
        <div><small>INSIDE THE MIND OF</small><h2>${m.name}</h2><em>${m.role} · ${m.work}</em></div>
        <button data-mind="leave" title="Leave this head (Esc)">leave ✕</button>
      </div>
      <p class="thought">“${m.thought}”</p>
      ${m.speech ? `<p class="said">saying out loud: “${m.speech}”</p>` : ''}
      <p class="summary">${m.summary} · ${m.doing} · their hours ${m.shift[0]}:00–${m.shift[1]}:00</p>

      <h3>What this body is sensing</h3>${senses}
      <h3>Drives</h3>${drives}
      <h3>Motor readout (from real muscle groups)</h3>${channels}
      <h3>Character, as learned wiring</h3>${circuit}
      <h3>Competing urges — the loudest one wins</h3>${urges || '<p class="news">No urge is loud right now.</p>'}

      <h3>Spike raster · ${TRACK.slice(0, 8).join(' ')}</h3>
      <canvas id="raster" width="520" height="120"></canvas>
      <div class="amines">
        ${bar('dopamine (ADE/CEP/PDE)', m.amines.da, {min: 0, max: 1.5, tone: 'warm'})}
        ${bar('octopamine (RIC)', m.amines.oa, {min: 0, max: 1.5, tone: 'hot'})}
        ${bar('serotonin (ADF/NSM/RIS)', m.amines.ht, {min: 0, max: 1.2, tone: 'cool'})}
      </div>

      <h3>loudest of ${BRAIN_INFO.neurons} neurons</h3>
      <ul class="cells">${cells}</ul>

      <h3>Carrying</h3><div class="chips">${goods}</div>
      <h3>Whom they trust</h3>${trust}
      <h3>Teaching signal</h3>${teaching}
      <h3>Recent memory</h3>${m.memories.slice(0, 4).map(r => `<p class="news">Day ${r.day}: ${r.text}</p>`).join('') || '<p class="news">Empty.</p>'}
      <h3>History</h3>
      <div class="hist">kept ${m.history.keeps} · broke ${m.history.betrayals} · gave ${m.history.gifts} · grudges ${m.history.grudges}
        · ${m.stats.changed}/${m.stats.connections} connections altered · ${m.stats.meanRate} Hz mean</div>

      <div class="mindactions">
        <button data-mind="reward">Praise · dopamine</button>
        <button data-mind="punish">Condemn · octopamine</button>
        <button data-mind="wheel" class="${wheelOn ? 'on' : ''}">${wheelOn ? 'release the motor loop' : 'take the motor loop'}</button>
      </div>
      ${wheelOn ? `<p class="hint">Your keys push on ${m.name}'s own command cells. Hold ${m.wheel ?? 100}% of their willpower.</p>` :
        '<p class="hint">Praise and condemn are teaching signals: they change which synapses get stronger.</p>'}
    `;
    this.drawRaster(m);
  }

  drawRaster(m) {
    const canvas = document.getElementById('raster');
    if (!canvas) return;
    if (canvas.width !== canvas.clientWidth * 2) { canvas.width = 1024; canvas.height = 240; }
    const ctx = canvas.getContext('2d');
    const brain = m.person.brain;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0f2a2b';
    ctx.fillRect(0, 0, w, h);
    const window = 3600;
    const rows = TRACK.map(name => ({name, i: CELL_INDEX.get(name)})).filter(r => r.i != null && r.i >= 0);
    const lane = (h - 22) / Math.max(1, rows.length);
    ctx.font = '700 18px system-ui';
    rows.forEach((r, idx) => {
      ctx.fillStyle = '#5d8f8c';
      ctx.fillText(r.name, 6, 20 + idx * lane);
      ctx.strokeStyle = '#1d3d3f';
      ctx.beginPath(); ctx.moveTo(96, 14 + idx * lane); ctx.lineTo(w, 14 + idx * lane); ctx.stroke();
    });
    const from = brain.clock - window;
    ctx.fillStyle = '#f4e2b0';
    for (let p = 0; p < brain.raster.length; p += 2) {
      const t = brain.raster[p], cell = brain.raster[p + 1];
      if (t < from) continue;
      const row = rows.findIndex(r => r.i === cell);
      if (row < 0) continue;
      const x = 96 + ((t - from) / window) * (w - 104);
      ctx.fillRect(x, 8 + row * lane, 3, Math.max(8, lane - 8));
    }
    ctx.strokeStyle = '#8fd6c6';
    ctx.beginPath(); ctx.moveTo(w - 2, 0); ctx.lineTo(w - 2, h); ctx.stroke();
  }

  handle(action, ui) {
    const id = this.game.possessing;
    if (id == null) return;
    const person = this.game.citizens.find(c => c.id === id);
    if (action === 'leave') { this.game.unpossess(); this.app.world.possess(null); this.hide(); ui.close(); return; }
    if (action === 'reward') ui.toast(this.game.talk(person, 'reward'));
    if (action === 'punish') ui.toast(this.game.talk(person, 'punish'));
    if (action === 'wheel') {
      if (this.game.minds.wheel?.id === id) { this.game.releaseWheel(); ui.toast(`You let go of ${person.name}'s motor loop.`); }
      else { this.game.takeWheel(); ui.toast(`You are steering ${person.name}. Their own urges resist.`); }
    }
    this.update();
  }
}

const verb = key => ({
  greet: 'say hello', offer: 'offer a trade', ask: 'ask for something', promise: 'make a promise',
  deliver: 'deliver what is owed', gossip: 'repeat a rumour', accuse: 'confront', shun: 'avoid',
  take: 'seize it', work: 'work', eat: 'eat', rest: 'rest', settle: 'settle a promise',
  flee: 'get away', roam: 'wander',
}[key] || key);
