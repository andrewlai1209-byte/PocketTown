import {PLACES, GOODS, CITIZENS, TRAITS} from '../data/town.js';
import {BRAIN_INFO} from '../brain/network.js';
import {ABOUT_PANEL} from './about.js';

const pct = v => `${Math.round(v * 100)}%`;

export class UI {
  constructor(game, world) {
    this.game = game;
    this.world = world;
    this.panel = document.getElementById('panel');
    this.toastBox = document.getElementById('toast');
    this.selected = null;
    game.onChange(() => this.stats());
    this.stats();
    document.getElementById('pause').onclick = () => {
      game.state.paused = !game.state.paused;
      this.stats();
      this.toast(game.state.paused ? 'The town holds its breath.' : 'Time starts again.');
    };
    document.getElementById('speed').onclick = () => {
      game.state.speed = game.state.speed === 1 ? 2 : game.state.speed === 2 ? 4 : 1;
      this.stats();
    };
    document.getElementById('fullscreen').onclick = () =>
      document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    document.getElementById('society').onclick = () => this.report();
    document.getElementById('minds').onclick = () => this.brainInfo();
    document.getElementById('about').onclick = () => this.about();
    this.panel.onclick = event => this.onPanelClick(event);
  }

  onPanelClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const {action, person, place, good, intent} = button.dataset;
    const p = person != null ? this.game.citizens.find(c => c.id === +person) : null;
    const spot = place ? PLACES.find(x => x.name === place) : null;
    if (action === 'close') return this.close();
    if (action === 'report') return this.report();
    if (action === 'brains') return this.brainInfo();
    if (action === 'possess') { this.game.possess(+person); this.world.possess(p); this.mind?.update(); this.close(); return; }
    if (action === 'intent') {
      const line = this.game.talk(p, intent);
      this.toast(typeof line === 'string' ? line : (line?.error || 'Nothing happens.'));
      this.citizen(p);
      return;
    }
    if (action === 'gift') {
      const result = this.game.give(p, good);
      if (result.error) this.toast(result.error); else { this.toast(`${p.name}: “${this.game.talk(p, 'greet')}”`); this.citizen(p); }
      return;
    }
    if (action === 'service') { const r = this.game.service(spot); if (r?.error) this.toast(r.error); this.placePanel(spot); return; }
    if (action === 'work') { const r = this.game.work(spot); if (r?.error) this.toast(r.error); else this.toast(this.game.state.log[0].split('— ')[1]); this.placePanel(spot); return; }
    if (action === 'sell') { const r = this.game.sell(good); if (r.error) this.toast(r.error); else this.toast(this.game.state.log[0].split('— ')[1]); this.placePanel(spot); return; }
    if (action === 'eat') { const r = this.game.eatFromBag(good); if (r.error) this.toast(r.error); this.stats(); return; }
    if (action === 'volunteer') { const r = this.game.volunteer(); if (r.error) this.toast(r.error); this.report(); return; }
  }

  stats() {
    const s = this.game.state;
    const inside = this.game.possessing != null ? this.game.citizens.find(c => c.id === this.game.possessing) : null;
    document.getElementById('stats').innerHTML =
      `<span>DAY ${s.day}<small>${this.game.time()}</small></span>
       <span>💰 $${s.money}<small>CASH</small></span>
       <span>🍞 ${Math.round(s.food)}<small>FOOD</small></span>
       <span>⚡ ${Math.round(s.energy)}<small>ENERGY</small></span>
       <span>😊 ${Math.round(s.mood)}<small>MOOD</small></span>
       <span>🤝 ${Math.round(s.trust)}<small>TOWN TRUST</small></span>
       ${inside ? `<span class="inside">🧠 ${inside.name}'S HEAD</span>` : ''}`;
    document.getElementById('pause').textContent = s.paused ? '▶' : '⏸';
    document.getElementById('speed').textContent = s.speed + '×';
  }

  toast(message) {
    if (!message) return;
    this.toastBox.textContent = message;
    this.toastBox.classList.add('show');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.toastBox.classList.remove('show'), 3600);
  }

  open(html) {
    this.panel.innerHTML = `<button class="close" data-action="close">✕</button>${html}`;
    this.panel.classList.remove('hidden');
    this.panel.classList.toggle('about', html.includes('about-section'));
  }

  close() {
    if (this.game.possessing != null) return;      // the mind panel owns the screen while inside
    this.selected = null;
    this.panel.classList.add('hidden');
    this.panel.classList.remove('about');
  }

  /* ------------------------------------------------------------- citizen card */

  citizen(c) {
    if (!c) return;
    this.selected = c;
    const mind = this.game.minds.mindPanel(c.id);
    const friend = this.game.state.friendships[c.name] ?? 40;
    const def = CITIZENS[c.id];
    const bag = Object.entries(this.game.state.bag || {}).filter(([, n]) => n > 0);
    const urgeLine = Object.entries(mind.urges).filter(([, v]) => v > .04).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${k} ${pct(v / 1.6)}`).join(' · ') || 'quiet';
    this.open(`
      <div class="eyebrow">AUTONOMOUS CITIZEN · ${def.role.toUpperCase()}</div>
      <h2>${def.name}</h2>
      <p class="quote">${mind.speech ? `“${mind.speech}”` : '“…”'}</p>
      <p class="persona">${def.persona}</p>
      <div class="item"><span>Temperament label</span><b>${TRAITS[def.name]}</b></div>
      <div class="item"><span>Craft</span><b>${def.craft} at ${def.work}</b></div>
      <div class="item"><span>Known for</span><b>${def.knownFor}</b></div>
      <div class="item"><span>Right now</span><b>${mind.doing}</b></div>
      <div class="item"><span>Hours</span><b>${mind.shift[0]}:00 – ${mind.shift[1]}:00</b></div>
      <div class="item"><span>Their urge</span><b>${urgeLine}</b></div>
      <div class="item"><span>Feeling</span><b>${pct(mind.person.mood)}</b></div>
      <div class="bar"><i style="width:${(mind.person.mood * 100).toFixed(0)}%"></i></div>
      <div class="item"><span>Friendship with you</span><b>${Math.round(friend)}/100</b></div>
      <div class="bar"><i style="width:${friend}%"></i></div>
      <div class="item"><span>Promises kept / broken</span><b>${mind.history.keeps} / ${mind.history.betrayals}</b></div>
      <div class="item"><span>Altered synapses</span><b>${mind.stats.changed} of ${mind.stats.connections}</b></div>
      <div class="chips">${Object.entries(mind.inventory).filter(([, n]) => n > 0).map(([k, n]) => `<span class="chip">${GOODS[k]?.icon} ${GOODS[k]?.label} ×${n}</span>`).join('') || '<span class="chip">carrying nothing</span>'}</div>

      <button class="primary" data-action="possess" data-person="${c.id}">Enter their mind</button>
      <h3>Talk</h3>
      <div class="choices">
        <button data-action="intent" data-person="${c.id}" data-intent="greet">Say hello</button>
        <button data-action="intent" data-person="${c.id}" data-intent="ask">Ask for something</button>
        <button data-action="intent" data-person="${c.id}" data-intent="promise">Ask for a promise</button>
        <button data-action="intent" data-person="${c.id}" data-intent="accuse">Confront a betrayal</button>
        <button data-action="intent" data-person="${c.id}" data-intent="reward">Praise their choice</button>
        <button data-action="intent" data-person="${c.id}" data-intent="punish">Condemn their choice</button>
      </div>
      <h3>Give from your bag</h3>
      ${bag.length ? `<div class="choices">${bag.map(([k, n]) =>
        `<button data-action="gift" data-person="${c.id}" data-good="${k}">${GOODS[k]?.icon} ${GOODS[k]?.label} ×${n}</button>`).join('')}</div>`
        : '<p class="news">Your bag is empty. Buy something at the Market or Bakery.</p>'}
      <h3>Their memory</h3>
      ${mind.memories.slice(0, 4).map(m => `<p class="news">Day ${m.day}: ${m.text}</p>`).join('') || '<p class="news">Nothing yet.</p>'}
    `);
  }

  /* ------------------------------------------------------------ place details */

  placePanel(p) {
    if (!p) return;
    this.selected = p;
    const workers = this.game.citizens.filter(c => c.work === p.name);
    const service = {bakery: 'Buy bread · $8', clinic: 'Get a remedy · $24', school: 'Sit a class · $15', cafe: 'Buy a warm cup · $6',
      market: 'Buy produce · $12', farm: 'Help harvest', workshop: 'Have Finn teach a pass', library: 'Read a while', civic: 'Town report', park: 'Pick a flower by the pond'}[p.type];
    const bag = Object.entries(this.game.state.bag || {}).filter(([, n]) => n > 0);
    this.open(`
      <div class="eyebrow">${p.type.toUpperCase()}</div>
      <h2>${p.icon} ${p.name}</h2>
      <p>${p.description}</p>
      <h3>Who works here</h3>
      ${workers.length ? workers.map(c => `<div class="item"><span>${c.name}</span><b>${c.role} · mood ${pct(c.mood)}</b></div>`).join('') : '<p>A public place.</p>'}
      <h3>Do something</h3>
      <button class="primary" data-action="${p.type === 'civic' ? 'report' : 'service'}" data-place="${p.name}">${service}</button>
      ${['bakery', 'farm', 'market', 'workshop', 'cafe', 'library'].includes(p.type) ? `<button data-action="work" data-place="${p.name}">Work a shift · earn $18</button>` : ''}
      ${p.type === 'market' && bag.length ? `<h3>Sell from your bag</h3><div class="choices">${bag.map(([k, n]) =>
        `<button data-action="sell" data-place="${p.name}" data-good="${k}">${GOODS[k]?.icon} ${GOODS[k]?.label} ×${n}</button>`).join('')}</div>` : ''}
      ${bag.some(([, n]) => n > 0) ? `<h3>Eat from your bag</h3><div class="choices">${bag.filter(([k]) => GOODS[k]?.food > 0).map(([k, n]) =>
        `<button data-action="eat" data-good="${k}">${GOODS[k]?.icon} ${GOODS[k]?.label} ×${n}</button>`).join('')}</div>` : ''}
      <div class="item"><span>Town stores</span><b>${Math.round(this.game.state.supplies)} goods</b></div>
    `);
  }

  /* ---------------------------------------------------------- society report */

  report() {
    const s = this.game.state, r = this.game.report;
    const open = this.game.minds.deals.filter(d => d.status === 'open');
    const rows = this.game.citizens.map(c => {
      const m = this.game.minds.mindPanel(c.id);
      const total = m.history.keeps + m.history.betrayals;
      return `<div class="society-row">
        <b>${m.name}</b><span>${m.history.keeps} kept · ${m.history.betrayals} broke</span>
        <i class="track"><b style="width:${total ? Math.round(m.history.keeps / total * 100) : 50}%"></b></i>
        <em>reach ${m.circuit.appetite.toFixed(2)} · brake ${m.circuit.restraint.toFixed(2)} · social ${m.circuit.social.toFixed(2)}</em>
      </div>`;
    }).join('');
    this.open(`
      <div class="eyebrow">A LIVING SOCIETY</div>
      <h2>Community Report</h2>
      <div class="item"><span>Citizens, each a real connectome</span><b>${r.people}</b></div>
      <div class="item"><span>Town trust</span><b>${Math.round(s.trust)}/100</b></div>
      <div class="item"><span>Shared stores</span><b>${Math.round(s.supplies)}</b></div>
      <div class="item"><span>Your reputation</span><b>${s.reputation}</b></div>
      <div class="item"><span>Promises kept / broken / unmet / still owed</span><b>${r.ledger.kept} / ${r.ledger.broken} / ${r.ledger.failed} / ${open.length}</b></div>
      <div class="item"><span>Goods taken by force</span><b>${r.stolen}</b></div>
      <div class="item"><span>Town morality</span><b>${r.fairness === null ? 'not tested yet' : r.fairness + '%'}</b></div>
      <div class="item"><span>Connections altered by teaching</span><b>${r.learned.toLocaleString()}</b></div>
      <button class="primary" data-action="volunteer">Volunteer · energy −10, everyone nearby is rewarded</button>
      <h3>Open promises (${open.length})</h3>
      ${open.slice(0, 6).map(d => `<p class="news">Day ${d.day}: ${this.game.citizens[d.from].name} owes ${GOODS[d.item]?.label || d.item} to ${d.to === 'player' ? 'you' : this.game.citizens[d.to].name}, due day ${d.due}.</p>`).join('') || '<p class="news">Nobody is owed anything.</p>'}
      <h3>Incidents</h3>
      ${r.incidents.length ? r.incidents.map(i => `<p class="news ${i.type}">Day ${i.day} · ${i.text}</p>`).join('') : '<p class="news">No betrayals or thefts recorded yet.</p>'}
      <h3>Rumours travelling</h3>
      ${this.game.minds.rumors.length ? this.game.minds.rumors.map(x => `<p class="news">${x.text} (heard ${x.heard}×)</p>`).join('') : '<p class="news">The town has nothing to say about anyone.</p>'}
      <h3>Each mind's ledger</h3>
      ${rows}
      <h3>Town log</h3>
      ${s.log.slice(0, 10).map(line => `<p class="news">${line}</p>`).join('')}
    `);
  }

  brainInfo() {
    const meta = BRAIN_INFO.meta;
    this.open(`
      <div class="eyebrow">WHAT IS RUNNING IN THEIR HEADS</div>
      <h2>The OpenWorm nervous system</h2>
      <p>Every citizen is driven by the recorded hermaphrodite connectome, compiled straight out of the
      OpenWorm c302 repository: ${meta.cells} cells, ${meta.neurons} neurons, ${meta.effectors} muscles,
      ${meta.edges} connections (${meta.chemical} chemical, ${meta.gapJunctions} electrical gap junctions).</p>
      <h3>Where the numbers come from</h3>
      <div class="item"><span>Wiring, weights, types</span><b>herm_full_edgelist.csv</b></div>
      <div class="item"><span>Cell class, fast transmitters, receptor genes</span><b>owmeta_cache.json</b></div>
      <div class="item"><span>Neuropeptides (how widely a spike is credited)</span><b>Bentley et al. 2016</b></div>
      <div class="item"><span>Dopamine cells (reward)</span><b>${BRAIN_INFO.amineCells.dopamine.join(', ')}</b></div>
      <div class="item"><span>Octopamine cells (punishment)</span><b>${BRAIN_INFO.amineCells.octopamine.join(', ')}</b></div>
      <div class="item"><span>Serotonin cells</span><b>${BRAIN_INFO.amineCells.serotonin.join(', ')}</b></div>
      <h3>Honest limits</h3>
      <p class="news">The wiring diagram is real. The neuron model is a single-compartment
      integrate-and-fire approximation with adaptation, not the multi-compartment Hodgkin-Huxley
      cells c302 generates for NEURON — that is what lets twelve of them run in a browser at once.
      Language is not in a worm's nervous system: the brain decides whether a villager approaches,
      freezes, takes, or speaks, and which words they use comes from their own authored voice.</p>
      <h3>Stimulus channels wired to sensory cells</h3>
      <p class="news">${BRAIN_INFO.stimulusChannels.map(c => `${c.key} (${c.cells} cells)`).join(' · ')}</p>
      <button class="primary" data-action="report">Back to the town</button>
    `);
  }

  about() {
    this.open(ABOUT_PANEL);
  }
}
