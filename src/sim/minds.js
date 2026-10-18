import {Brain} from '../brain/network.js';
import {measure, summarize} from '../brain/readout.js';
import {PLACES, CITIZENS, GOODS, CRAFTS, voiceFor} from '../data/town.js';

/**
 * Minds — twelve real nervous systems living in one town.
 *
 * The layering, bottom up:
 *   1. Brain        the recorded C. elegans connectome, spiking (src/brain/network.js)
 *   2. senses       town facts -> the stimuli that this animal's endings actually carry
 *   3. decoder      motor channels + learned wiring -> character numbers and competing
 *                   urges (src/brain/readout.js)
 *   4. action       the winning urge becomes a speech bubble, an offer, a promise, a theft
 *   5. consequence  food, company and cheating pay out as dopamine or octopamine, so this
 *                   villager's wiring is slightly different tomorrow
 *
 * Nothing in this file decides that a villager "should" be honest. Honesty is simply what
 * survives when betrayal is punished by neighbours and keeping a promise is paid for by them.
 */

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const pick = (list, rand) => (list && list.length ? list[Math.floor(rand() * list.length)] : '');
const shortAngle = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const EDIBLE = ['bread', 'produce', 'cup'];
const PLAYER = {id: 'player', name: 'the newcomer'};

/* The moral balance of the town. `tempt` is how strong wanting goods is, `edge` how much
   how strongly evidence is weighed (a logistic, not a switch), `scar` how much having
   been caught before discourages reaching again. Tuned so a fresh town keeps most of its
   promises and breaks a few — a society with no betrayal has nothing to teach. */
export const MORAL = {tempt: 1.1, edge: 0, scar: .25, hunger: .35, steep: 1.1};
const TUNE_MORAL = MORAL;

/* Walking. Town units are roughly metres, the map is 70 units across, so a brisk 3.2 u/s
   is a crossing of the square in well under a town-hour and reads as a person walking. */
const WALK = 2.6;
const ERRAND = ['deliver', 'demand', 'gather', 'eat', 'flee', 'settle', 'talk'];
/* the choices that happen between two people, and are therefore worth stepping out of the
   working day for */
const SOCIAL = {greet: 1, offer: 1, ask: 1, promise: 1, gossip: 1, accuse: 1, shun: 1, take: 1};
/* How long two neighbours leave each other alone after one of these. Town minutes. */
const SOCIAL_COOLDOWN = {greet: 130, ask: 170, offer: 170, gossip: 110, promise: 300, shun: 240, accuse: 200, take: 90};

export class Minds {
  constructor(game) {
    this.game = game;
    this.rand = game.mindRandom;
    this.rumors = [];
    this.deals = [];
    this.incidents = [];
    this.letters = [];
    this.ledger = {kept: 0, broken: 0, failed: 0, expired: 0, thefts: 0};
    this.chats = [];                       // replies queued to be spoken a second later
    this.people = CITIZENS.map((c, i) => this.create(c, i));
    this.byId = new Map(this.people.map(p => [p.id, p]));
    this.hearings = new Map();
    this.tickCount = 0;
    this.possessing = null;
    this.wheel = null;
    for (const p of this.people) {
      for (const q of this.people) if (q !== p) p.trust[q.id] = 40 + Math.floor(this.rand() * 26);
      p.inventory[CITIZENS[p.id].craft] = 2;
      p.inventory.produce = 1 + Math.floor(this.rand() * 2);
    }
  }

  create(c, i) {
    return {
      id: i, name: c.name, role: c.role, work: c.work, home: c.home, color: c.color,
      brain: new Brain(1000 + i * 7919),
      circuit: {appetite: 1, restraint: 1, social: 1, empathy: 1, craving: 1},
      drives: {hunger: .3, energy: .8, comfort: .6, social: .55, purpose: .5, pride: .6, tension: .2},
      inventory: {}, trust: {},
      keeps: 0, betrayals: 0, failures: 0, gifts: 0, grudges: 0,
      memories: [], goal: {kind: 'roam', place: 'Park', until: 0},
      x: c.home[0], z: c.home[1], heading: this.rand() * 6.283, speed: 0,
      speech: null, mood: .6, urge: {}, lastAction: '', lastActionAt: -99,
      summary: '', stats: {}, awake: true, holding: null,
    };
  }

  /* ------------------------------------------------------------------- clock */

  /** Town minutes since the world began — goals are timed with this so midnight, which
      resets the clock face, cannot strand a villager on an expired errand. */
  mins() { return this.game.state.day * 1440 + this.game.state.minute; }
  hours() { return this.game.state.minute / 60; }

  tick(realDt) {
    if (this.game.state.paused) return;
    const dt = clamp(realDt, 4, 50) * this.game.state.speed;
    const hours = this.game.state.minute / 60;
    this.tickCount++;
    this.expireHearings();

    for (const p of this.people) {
      this.updateDrives(p, dt, hours);
      p.lastSenses = this.senses(p, hours);
      p.brain.sense(p.lastSenses);
      if (this.wheel && this.wheel.id === p.id) this.burnWheelFuel(p, dt);
      p.brain.step(dt);
    }

    if (this.tickCount % 5 === 0) {
      for (const p of this.people) {
        p.circuit = measure(p.brain);
        p.summary = summarize(p.brain, p.circuit).text;
        p.stats = p.brain.stats;
      }
    }
    if (this.tickCount % 5 === 0) for (const p of this.people) this.decide(p, hours);
    this.runChats();
    for (const p of this.people) this.move(p, dt);
    this.separate();
    this.settleDeals();
    if (this.tickCount % 60 === 0) { this.pruneRumors(); this.repairTrust(); }
  }

  updateDrives(p, dt, hours) {
    const d = p.drives, s = dt / 1000;
    const day = hours >= 7 && hours < 21;
    const working = p.goal.kind === 'work' || p.lastAction === 'work';
    /* sleep is not a mood, it is a place: energy only comes back at a real rate once the
       villager is actually home and off their feet */
    const inBed = p.goal.kind === 'home' && Math.hypot(p.x - p.home[0], p.z - p.home[1]) < 4;
    d.hunger = clamp(d.hunger + s * (day ? .0024 : .0008), 0, 1);
    d.energy = clamp(d.energy - s * (working ? .0026 : day ? .0011 : -.0062) + (inBed ? s * .014 : 0), 0, 1);
    d.social = clamp(d.social - s * .0027 + (this.aloneNear(p) ? s * .0035 : 0), 0, 1);
    d.purpose = clamp(d.purpose - s * .0018 + (working ? s * .005 : 0), 0, 1);
    d.comfort = clamp(d.comfort + (day ? -s * .0010 : s * .0032) - d.hunger * s * .0022, 0, 1);
    d.tension = clamp(p.grudges * .05 + this.dueFor(p).length * .1 + (1 - d.comfort) * .45 + (1 - d.energy) * .3, 0, 1);
    d.pride = clamp(d.pride + p.gifts * .008 - p.grudges * .02, 0, 1);
    p.awake = day ? true : d.energy > .28;
    p.holding = EDIBLE.find(g => (p.inventory[g] || 0) > 0) || null;
    p.mood = clamp(.3 + d.comfort * .3 + d.pride * .2 + d.social * .12 + p.brain.da * .35 - p.brain.oa * .4, 0, 1);
  }

  /* ------------------------------------------------------------------- senses */

  senses(p, hours) {
    const near = this.nearestPerson(p);
    const food = this.nearestFood(p);
    const speaker = this.hearings.get(p.id);
    const crowd = this.people.filter(q => q !== p && this.dist(q, p) < 9).length;
    const workplace = PLACES.find(x => x.name === p.work);
    const proximity = near.hit ? clamp(1 - near.dist / 11, 0, 1) : 0;
    const familiarity = near.hit ? clamp((p.trust[near.person.id] ?? 50) / 100, .1, 1) : 0;
    const obligations = this.dueFor(p).filter(x => x.status === 'open').length;
    const own = this.deals.filter(x => x.to === p.id && x.status === 'open' && x.due <= this.game.state.day).length;
    return {
      foodOdour: food.found ? clamp(1 - food.dist / 24, 0, 1) * (.3 + p.drives.hunger) : 0,
      tastant: p.holding ? .5 + p.drives.hunger * .45 : 0,
      internalState: clamp(p.drives.hunger - (1 - p.drives.energy) * .3, -1, 1),
      pheromone: clamp(proximity * (.3 + familiarity * .8) + (speaker ? .22 : 0) - (crowd === 0 ? .16 : 0), -1, 1),
      touch: proximity > .8 ? (proximity - .8) * 4 : 0,
      substrate: speaker ? speaker.intensity : clamp(proximity * .3 + (Math.abs(p.speed) > .2 ? .12 : 0), 0, 1),
      noxious: speaker && speaker.valence < 0 ? clamp(-speaker.valence, 0, 1) : clamp(p.drives.tension * .45 + (p.grudges ? .2 : 0), 0, 1),
      temperature: hours < 7 || hours > 21 ? -.4 : hours > 12 && hours < 15 ? .3 : 0,
      CO2: clamp((crowd - 1) * .2, 0, 1),
      stretch: clamp(obligations * .28 + own * .3 + (workplace && this.distToPlace(p, workplace) < 7 ? .28 : 0), 0, 1),
    };
  }

  /* ------------------------------------------------------------------ decoder */

  /** Whose shift is running right now. Hours are town clock hours, from the citizen file. */
  onShift(p, hours) {
    const sh = CITIZENS[p.id]?.shifts || [8, 18];
    return hours >= sh[0] && hours < sh[1];
  }

  decide(p, hours) {
    const ch = p.brain.channels, c = p.circuit, d = p.drives;
    const near = this.nearestPerson(p);
    const other = near.hit ? near.person : null;
    const trust = other ? (other.id === 'player' ? this.game.state.trust : p.trust[other.id] ?? 50) / 100 : 0;
    const iWant = this.mostWantedBy(p);
    const theyWant = other ? this.mostWantedBy(other) : null;
    const iHaveForThem = other && theyWant && (p.inventory[theyWant] || 0) > 0 && !this.owes(p, theyWant);
    const theyHaveWhatIWant = other && iWant && (other.inventory?.[iWant] || 0) > 0;
    /* d.social is the *hunger* for company: it rises while a villager is on their own and
       falls when they are talking, so a conversation is self-limiting instead of a loop
       that never ends */
    const lonely = d.social;
    const open = this.dueFor(p).filter(x => x.status === 'open');
    const owingToOthers = this.deals.filter(x => x.to === p.id && x.status === 'open');
    const gossip = this.rumors.find(r => other && !(r.spokenTo || []).includes(other.id) && r.subject !== other.id);
    const wronged = other && this.incidents.some(i => i.from === other.name && i.to === p.name && i.type !== 'theft');
    const shift = this.onShift(p, hours);
    const errand = this.isErrand(p.goal);

    const u = {
      greet: (.3 + ch.arousal * .5) * c.social * (.35 + trust * .9) * (.5 + lonely),
      offer: iHaveForThem ? (.25 + trust * .8) * c.empathy * (.45 + ch.forward * .8) : 0,
      ask: other && iWant && (theyHasItem(other, iWant) || wantsFrom(other, iWant))
        ? (.2 + d.hunger * .8 + lonely * .2) * c.appetite * (.25 + trust) * (theyHasItem(other, iWant) ? 1.35 : .85) : 0,
      promise: other && trust > .45 && c.social > 1 && open.length < 3 && theyWant && !theyHasItem(p, theyWant)
        && !this.deals.some(x => x.from === p.id && x.to === other.id && x.day === this.game.state.day)
        && this.canDeliver(p, theyWant)
        ? (.1 + d.purpose * .3 + (1 - d.comfort) * .2) * c.social * .8 : 0,
      deliver: open.some(x => (p.inventory[x.item] || 0) > 0)
        ? .8 + c.restraint * .6 + trust * .35 + (other && open.some(x => x.to === other.id) ? .5 : 0) : 0,
      gossip: gossip ? (.12 + ch.arousal * .4) * c.social * (1.25 - c.restraint * .3) : 0,
      accuse: wronged && ch.arousal > .28 ? (.2 + d.tension * .7) * (1.2 - c.empathy * .2) : 0,
      shun: other && trust < .3 ? .28 + ch.reverse * .5 : 0,
      take: theyHaveWhatIWant ? Math.max(0, (.12 + d.hunger * 1.7 + (1 - trust) * .55) * c.appetite * c.craving
        / Math.max(.5, c.restraint * (.85 + trust * .9)) - p.betrayals * TUNE_MORAL.scar
        - Math.min(.8, watchersNear(p, this) * .22)
        - (this.stoleFrom(p, other) ? 1.1 : 0)) : 0,
      work: shift && this.canCraft(p) ? (.55 + d.purpose * 1.0) * (.4 + c.appetite * .5) * (1 - d.tension * .25) : 0,
      eat: (p.holding ? .25 : 0) + d.hunger * (.3 + ch.pump * 1.3) * c.craving,
      /* going home is allowed to beat a shift: a villager who is exhausted or awake in the
         dark stops working and walks back to bed */
      rest: (!shift && !p.awake) || d.energy < .22 ? (.35 + (1 - d.energy) * 1.2) * (1.1 - ch.arousal * .5) : 0,
      settle: open.some(x => (p.inventory[x.item] || 0) <= 0) ? (.45 + c.restraint * .7 + trust * .4) : 0,
      demand: owingToOthers.some(x => x.due <= this.game.state.day) ? (.28 + c.appetite * .3 + d.tension * .3) : 0,
      /* running away needs something to run from. Without a threat in front of them the
         reverse system only makes a villager hesitant, not flighty */
      flee: other && near.dist < 7 && (p.shunned === other.id || this.harmedBy(p, other))
        ? .75 + ch.reverse * .5 + d.tension * .5
        : ch.reverse * .3 + d.tension * .2 * (1.1 - c.restraint),
      roam: .16 + ch.forward * .3 - ch.arrest * .25,
    };
    for (const k in u) if (!Number.isFinite(u[k])) u[k] = 0;
    p.urge = u;

    const ranked = Object.entries(u).sort((a, b) => b[1] - a[1]);

    /* Two tracks, because one person has both a day and a neighbourhood.
       The day — a shift, an errand, sleep — keeps running in the background; it is the
       thing that puts a body in a place. The social column is judged on its own merits,
       because a 9-to-5 urge scoring .8 would beat a greeting scoring .3 every time and the
       town would end up as twelve people silently working. So: if there is somebody within
       reach worth stopping for, they stop for them. */
    const social = ranked.find(([k]) => SOCIAL[k]);
    const midChat = p.goal.kind === 'talk' && this.mins() < (p.goal.until ?? 0);
    /* a theft or a confrontation is not polite conversation; it interrupts one. And the
       threshold is not "somebody exists within twelve units" but "somebody is within arm's
       reach and the pull of speaking is stronger than the pull of walking on". Having just
       dealt with somebody, a villager does not deal with them again the same hour: without
       this rule a friendly town spends its whole working day stopped in the street. */
    const said = other && p.talkedWith?.[other.id] != null ? this.mins() - p.talkedWith[other.id] : 1e9;
    const chatBlock = midChat && social && social[0] !== 'take' && social[0] !== 'accuse';
    const repeat = social && SOCIAL_COOLDOWN[social[0]] != null && said < SOCIAL_COOLDOWN[social[0]];
    if (near.hit && near.dist < 8 && social && social[1] > .45 && !chatBlock && !repeat &&
        !(social[0] === p.lastAction && this.tickCount - p.lastActionAt < 16)) {
      return this.perform(p, social[0], other, hours);
    }

    /* an errand already in hand is walked to the end when there is nobody to talk to */
    if (errand) return;

    const best = ranked[0];
    const won = !best || best[1] <= .34 ? 'routine' : best[0];
    if (won !== 'routine' && won === p.lastAction && this.tickCount - p.lastActionAt < 16) return;
    this.perform(p, won, other, hours);
  }

  isErrand(g) { return ERRAND.includes(g.kind) && this.mins() < (g.until ?? 0); }

  /** The shape of a day: on shift at the post, home when it is dark or when the energy is
      gone, and otherwise at whichever of their haunts has people in it. This is what makes
      the town gather somewhere at some hour instead of scattering forever. */
  routine(p, hours) {
    const g = p.goal;
    if (this.mins() < (g.until ?? 0) && (g.kind === 'work' || g.kind === 'home' || g.kind === 'haunt')) {
      if (this.onShift(p, hours) ? g.kind === 'work' : g.kind !== 'work') return;
    }
    if (this.onShift(p, hours)) return this.goalWork(p);
    if (!this.daylight(hours) || p.drives.energy < .2) return this.goalHome(p);
    return this.goalHaunt(p);
  }

  daylight(hours) { return hours >= 7 && hours < 21; }

  goalWork(p) {
    const w = PLACES.find(x => x.name === p.work) || PLACES[0];
    const st = this.stationFor(w);
    const until = Math.min(this.shiftEnd(p), this.mins() + 100);
    this.setGoal(p, 'work', {place: w.name, anchor: [st.x, st.z], x: st.x, z: st.z,
      until, stay: 3.2, nextCraft: p.goal.kind === 'work' ? (p.goal.nextCraft ?? 0) : 0});
  }

  goalHome(p) {
    const start = (CITIZENS[p.id].shifts || [8, 18])[0] * 60;
    const midnight = this.mins() - this.game.state.minute;      // absolute minute of today's 00:00
    this.setGoal(p, 'home', {anchor: [p.home[0], p.home[1]], x: p.home[0], z: p.home[1],
      until: this.game.state.minute < start ? midnight + start : this.mins() + 210, stay: 1.4});
  }

  /** Choose the haunt that currently has somebody worth talking to. */
  goalHaunt(p) {
    const pool = (CITIZENS[p.id].haunts || ['Park']).map(n => PLACES.find(x => x.name === n)).filter(Boolean);
    const lonely = p.drives.social;
    let best = null, bs = -1;
    for (const w of (pool.length ? pool : PLACES)) {
      const crowd = this.people.filter(q => q !== p && Math.hypot(q.x - w.x, q.z - w.z) < 10).length;
      const score = this.rand() * .8 + crowd * (.4 + lonely * 1.5) - this.distToPlace(p, w) * .012;
      if (score > bs) { bs = score; best = w; }
    }
    const st = this.stationFor(best || PLACES[PLACES.length - 1]);
    this.setGoal(p, 'haunt', {place: (best || PLACES[0]).name, anchor: [st.x, st.z], x: st.x, z: st.z,
      until: this.mins() + 55 + Math.floor(this.rand() * 55), stay: 3.6});
  }

  stationFor(w) {
    const list = w.stations || [{x: w.x, z: w.z + w.d / 2 + 2}];
    return list[Math.floor(this.rand() * list.length)] || list[0];
  }

  /** Minute (on an absolute town timeline) at which this citizen's shift ends today. */
  shiftEnd(p) {
    const sh = CITIZENS[p.id].shifts || [8, 18];
    return this.game.state.day * 1440 + sh[1] * 60;
  }

  /* ------------------------------------------------------------------ actions */

  perform(p, action, other, hours) {
    p.lastAction = action;
    p.lastActionAt = this.tickCount;
    switch (action) {
      case 'routine': return this.routine(p, hours);
      case 'greet': return other ? this.talk(p, other) : this.goalHaunt(p);
      case 'offer': return other ? this.offer(p, other, this.bestGive(p, other)) : this.goalHaunt(p);
      case 'ask': return other ? this.ask(p, other) : this.goalHaunt(p);
      case 'promise': return other ? this.promise(p, other, this.mostWantedBy(other) || 'produce') : this.goalHaunt(p);
      case 'deliver': return this.goalDeliver(p);
      case 'gossip': return other ? this.gossip(p, other) : this.goalHaunt(p);
      case 'accuse': return other ? this.accuse(p, other) : this.goalHaunt(p);
      case 'shun': return other ? this.shun(p, other) : this.goalHaunt(p);
      case 'take': return other ? this.take(p, other) : this.goalHaunt(p);
      case 'work': return this.goalWork(p);
      case 'eat': return this.goalEat(p);
      case 'rest': return this.goalHome(p);
      case 'settle': return this.goalSettle(p);
      case 'demand': return this.goalDemand(p);
      case 'flee': return this.goalFlee(p, other);
      default: return this.routine(p, hours);
    }
  }

  talk(p, other) {
    this.say(p, pick(voiceFor(p.name).greet, this.rand), 3600);
    this.listen(other, p, .45, .55);
    /* the answer comes from the other mouth a moment later, if they are still in earshot */
    this.queueReply(other.id === 'player' ? p : other, p, ['greet', 'happy', 'thanks', 'work']);
    this.bumpTrust(p, other, 1.6);
    p.drives.social = clamp(p.drives.social - .34, 0, 1);
    if (other.drives) other.drives.social = clamp(other.drives.social - .2, 0, 1);
    p.brain.reward(.5, 'company');
    if (other.brain) other.brain.reward(.3, 'greeted');
    this.remember(p, `Talked with ${other.name}.`);
    this.stayAndTalk(p, other, 12);
  }

  /** Stand and talk. Both of them stop walking, both face the other, and they stay within
      a couple of units for the length of the exchange — which is what makes two sprites
      read as two people speaking instead of twelve strangers passing. */
  stayAndTalk(p, other, minutes = 20) {
    (p.talkedWith ||= {})[other?.id ?? 'player'] = this.mins();
    /* three units apart, not zero: a pair that keeps pace with each other reads as two
       people walking and talking, while two statues nose to nose reads as a glitch */
    if (!other || other.id === 'player') {
      return this.setGoal(p, 'talk', {player: true, x: this.game.playerPosition.x,
        z: this.game.playerPosition.z, until: this.mins() + minutes, stay: 3.2});
    }
    if (other.talkedWith) other.talkedWith[p.id] = this.mins();
    else other.talkedWith = {[p.id]: this.mins()};
    this.setGoal(p, 'talk', {person: other.id, until: this.mins() + minutes, stay: 3.2});
    const face = other.goal;
    if (face.kind === 'haunt' || face.kind === 'work' || face.kind === 'roam') {
      this.setGoal(other, 'talk', {person: p.id, until: this.mins() + minutes, stay: 3.2});
    }
  }

  /** Queue an answer in somebody else's mouth. A conversation is two bubbles a second
      apart, not one; the reply only lands if the two are still close enough to hear it. */
  queueReply(listener, speaker, keys, delay = 8) {
    if (!listener || listener.id === 'player') return;
    this.chats.push({to: listener.id, from: speaker.id, keys, at: this.tickCount + delay + Math.floor(this.rand() * 7)});
    this.chats = this.chats.slice(-48);
  }

  runChats() {
    if (!this.chats.length) return;
    const due = this.chats.filter(c => c.at <= this.tickCount);
    if (!due.length) return;
    this.chats = this.chats.filter(c => c.at > this.tickCount);
    for (const c of due) {
      const listener = this.byId.get(c.to), speaker = this.byId.get(c.from);
      if (!listener || !speaker || this.dist(listener, speaker) > 7) continue;
      const voice = voiceFor(listener.name);
      const pool = [];
      for (const k of c.keys) pool.push(...(voice[k] || []));
      const text = pick(pool, this.rand);
      if (!text) continue;
      /* turn to face whoever you are answering: two sprites looking at each other read as
         a conversation, two sprites looking at nothing read as twelve strangers */
      listener.heading = Math.atan2(speaker.x - listener.x, speaker.z - listener.z);
      this.say(listener, text, 3400);
      this.listen(speaker, listener, .45, .5);
      listener.brain.reward(.22, 'said what they meant');
    }
  }

  /** A: "I will give you X for Y" — and Y has to be something B is actually holding. */
  offer(p, other, give) {
    if (!give || (p.inventory[give] || 0) <= 0 || this.owes(p, give)) return this.goalRoam(p);
    const ask = this.bestThingTheyHave(p, other);
    this.say(p, line(voiceFor(p.name).offer, give, ask, this.rand), 3600);
    this.listen(other, p, .6, .8);
    this.stayAndTalk(p, other, 22);
    if (other.id === 'player') return this.note(`${p.name} offers you ${GOODS[give]?.label}${ask ? ` for ${GOODS[ask]?.label}` : ', asking for nothing'}.`);
    const b = other.brain, c = other.circuit;
    const wantValue = this.wantStrength(other, give);
    const trust = clamp((other.trust[p.id] ?? 50) / 100, 0, 1);
    const accept = wantValue * c.appetite * (.3 + trust) + c.empathy * .3 * trust
      - c.restraint * .5 * (1 - trust) - p.betrayals * .14 - b.oa * .45 + b.channels.forward * .18;
    if (accept <= .3) {
      this.say(other, pick(voiceFor(other.name).refuse, this.rand), 3000);
      other.brain.punish(.3, 'had to say no');
      this.bumpTrust(p, other, -2.5);
      this.remember(other, `Refused ${p.name}'s ${GOODS[give]?.label}.`);
      return;
    }
    if (!ask) {
      /* nothing to pay with. Generosity is its own learned wiring; otherwise this is just a no. */
      if (c.empathy * (.35 + trust) > .78) {
        this.transfer(other, p, give);
        other.brain.reward(1, 'gave what could not be paid for');
        p.brain.reward(1.1, 'was helped for nothing');
        this.bumpTrust(p, other, 10); this.bumpTrust(other, p, 6);
        other.gifts++;
        this.say(other, pick(voiceFor(other.name).offer, this.rand), 3200);
        this.queueReply(p, other, ['thanks', 'happy', 'greet']);
        this.remember(other, `Gave ${GOODS[give]?.label} to ${p.name} with nothing to trade.`);
        this.note(`${other.name} gave ${p.name} ${GOODS[give]?.label} for nothing.`);
      } else if (other.id !== 'player' && this.canCraft(other) && CRAFTS[CITIZENS[other.id].craft]?.place === other.work) {
        this.promise(other, p, CITIZENS[other.id].craft);
      } else {
        this.say(other, pick(voiceFor(other.name).refuse, this.rand), 3000);
        this.note(`${other.name} has nothing ${p.name} wants in return.`);
      }
      return;
    }
    this.transfer(other, p, ask);
    this.transfer(p, other, give);
    this.bumpTrust(p, other, 8); this.bumpTrust(other, p, 8);
    p.gifts++; other.gifts++;
    p.brain.reward(1.2, 'a trade that worked'); other.brain.reward(1.1, 'got what I wanted');
    this.say(other, pick(voiceFor(other.name).accept, this.rand), 3200);
    this.queueReply(p, other, ['thanks', 'happy', 'work']);
    this.stayAndTalk(p, other, 22);
    this.remember(other, `Traded ${GOODS[ask]?.label} to ${p.name} for ${GOODS[give]?.label}.`);
    this.remember(p, `Traded ${GOODS[give]?.label} to ${other.name}.`);
    this.note(`${p.name} ⇄ ${other.name}: ${GOODS[give]?.label} for ${GOODS[ask]?.label}.`);
  }

  ask(p, other) {
    const want = this.mostWantedBy(p);
    if (!want) return this.goalRoam(p);
    if (other.id === 'player') {
      this.say(p, line(voiceFor(p.name).ask, want, null, this.rand), 3800);
      this.note(`${p.name} asks you for ${GOODS[want]?.label}. Open their card and choose “Ask for a promise” or give something.`);
      return this.stayAndTalk(p, other, 30);
    }
    this.say(p, line(voiceFor(p.name).ask, want, null, this.rand), 3400);
    this.listen(other, p, .55, .4);
    this.stayAndTalk(p, other, 20);
    if (!theyHasItem(other, want)) {
      const c = other.circuit, trust = clamp((other.trust[p.id] ?? 50) / 100, 0, 1);
      if (c.empathy * (.3 + trust) + (CRAFTS[want]?.place === other.work ? .5 : 0) > .75) {
        this.say(other, line(voiceFor(other.name).promise, want, p.name, this.rand), 3400);
        return this.promise(other, p, want) || this.note(`${other.name} has no ${GOODS[want]?.label} yet.`);
      }
      this.bumpTrust(p, other, -1);
      return this.note(`${other.name} has no ${GOODS[want]?.label} for ${p.name}.`);
    }
    const c = other.circuit, trust = clamp((other.trust[p.id] ?? 50) / 100, 0, 1);
    const generous = c.empathy * (.35 + trust * 1.1) + c.restraint * .25 - c.appetite * .35 - other.brain.oa * .4;
    if (generous > .35) {
      this.transfer(other, p, want);
      other.brain.reward(1, 'helped someone');
      p.brain.reward(.9, 'was given help');
      this.bumpTrust(p, other, 9); this.bumpTrust(other, p, 6);
      other.gifts++;
      this.say(other, line(voiceFor(other.name).offer, want, null, this.rand), 3200);
      this.remember(other, `Gave ${GOODS[want]?.label} to ${p.name}.`);
      this.note(`${other.name} gave ${GOODS[want]?.label} to ${p.name}.`);
    } else {
      other.brain.punish(.2, 'asked for more than they had');
      this.say(other, pick(voiceFor(other.name).refuse, this.rand), 3000);
      this.queueReply(p, other, ['greet', 'work']);
      this.bumpTrust(p, other, -3);
    }
  }

  /** Goods already promised to someone else are not available for trade. */
  owes(p, item) { return this.deals.some(x => x.from === p.id && x.status === 'open' && x.item === item); }

  bestGive(p, other) {
    const want = this.mostWantedBy(other);
    if (!want || (p.inventory[want] || 0) <= 0) return null;
    return this.owes(p, want) ? null : want;
  }

  promise(from, to, item) {
    if (!to || !item) return null;
    if (from.id !== 'player' && this.owes(from, item) && (from.inventory[item] || 0) <= 0) return null;
    if (from.id !== 'player' && this.dueFor(from).filter(x => x.status === 'open').length >= 3) return null;
    /* a promise you have no way to keep is not generosity, it is a rumour waiting to happen */
    if (from.id !== 'player' && !this.canDeliver(from, item)) {
      this.say(from, pick(voiceFor(from.name).refuse, this.rand), 3000);
      return null;
    }
    const deal = {from: from.id, to: to.id, item, due: this.game.state.day + 2, status: 'open', day: this.game.state.day};
    this.deals.push(deal);
    this.say(from, line(voiceFor(from.name).promise, item, to.name, this.rand), 3800);
    this.listen(to, from, .5, .75);
    this.stayAndTalk(from, to, 18);
    this.queueReply(to, from, ['thanks', 'greet', 'happy']);
    this.bumpTrust(from, to, 4);
    this.remember(from, `Promised ${GOODS[item]?.label} to ${to.name}.`);
    from.brain.reward(.3, 'a promise feels good');
    this.note(`${from.name} promised ${GOODS[item]?.label} to ${to.name} by day ${deal.due}.`);
    return deal;
  }

  take(p, other) {
    if (!other) return;
    const item = this.mostWantedBy(p);
    if (!item || !theyHasItem(other, item)) return this.goalRoam(p);
    const witnesses = this.people.filter(q => q !== p && q !== other && this.dist(q, p) < 13);
    this.transfer(other, p, item);
    p.brain.reward(1.3, `took ${GOODS[item]?.label}`);
    if (other.brain) { other.brain.punish(1.5, `robbed of ${GOODS[item]?.label}`); other.grudges++; }
    this.bumpTrust(p, other, -22);
    p.betrayals++;
    this.ledger.thefts++;
    this.say(p, pick(voiceFor(p.name).break, this.rand), 3200);
    if (other.brain) { this.say(other, pick(voiceFor(other.name).hurt, this.rand), 3200); this.stayAndTalk(other, p, 10); }
    this.remember(p, `Took ${GOODS[item]?.label} from ${other.name}.`);
    if (other.id !== 'player') this.remember(other, `${p.name} took my ${GOODS[item]?.label}.`);
    let turned = 0;
    for (const w of witnesses) {
      const sidesVictim = (w.trust[other.id] ?? 50) >= (w.trust[p.id] ?? 50);
      if (sidesVictim) { w.brain.punish(.7, `saw ${p.name} steal`); this.bumpTrust(p, w, -9); w.shunned = p.id; turned++; }
      else w.brain.reward(.15, 'kept out of it');
    }
    this.incident({day: this.game.state.day, type: 'theft', from: p.name, to: other.name,
      text: `${p.name} took ${GOODS[item]?.label} from ${other.name}${turned ? ` while ${turned} neighbours watched` : ''}.`});
    this.spreadRumor(p, other, GOODS[item]?.label || item, 'stole');
    this.note(`THEFT · ${p.name} took ${GOODS[item]?.label} from ${other.name}.`);
  }

  accuse(p, other) {
    if (!other || other.id === 'player') return this.goalRoam(p);
    const c = other.circuit;
    const trust = clamp((other.trust[p.id] ?? 50) / 100, 0, 1);
    this.say(p, pick(voiceFor(p.name).accuse, this.rand), 3600);
    this.listen(other, p, .85, -.95);
    this.stayAndTalk(p, other, 16);
    const confesses = c.empathy * .55 + c.restraint * .5 + trust * .45 - other.betrayals * .06 > 1.02;
    if (confesses) {
      this.say(other, pick(voiceFor(other.name).confess, this.rand), 3600);
      other.brain.punish(.85, 'called out');
      const item = this.deals.find(x => x.from === other.id && x.status !== 'open')?.item || 'flower';
      if (!theyHasItem(other, item)) other.inventory.flower = (other.inventory.flower || 0) + 1;
      this.transfer(other, p, theyHasItem(other, item) ? item : 'flower');
      other.brain.reward(.85, 'forgiven');
      p.brain.reward(.6, 'it was put right');
      this.bumpTrust(p, other, 10);
      other.grudges = Math.max(0, other.grudges - 1);
      other.gifts++;
      this.remember(other, `${p.name} made me own what I did.`);
      this.note(`${other.name} admitted it to ${p.name} and made it right.`);
    } else {
      other.brain.punish(1.15, 'publicly accused');
      other.brain.reward(.3, 'got away with it');
      this.bumpTrust(p, other, -12);
      this.say(other, pick(voiceFor(other.name).break, this.rand), 3400);
      this.remember(p, `${other.name} denied it to my face.`);
      this.note(`${other.name} denied everything to ${p.name}.`);
    }
  }

  shun(p, other) {
    if (!other) return;
    this.say(p, pick(voiceFor(p.name).shun, this.rand), 3200);
    this.listen(other, p, .5, -.6);
    this.queueReply(other, p, ['hurt', 'lonely', 'greet']);
    if (other.brain) other.brain.punish(.6, 'shunned');
    this.bumpTrust(p, other, -3);
    p.brain.punish(.18, 'having to avoid someone');
    p.shunned = other.id;
    this.remember(p, `Refused to deal with ${other.name} any more.`);
  }

  gossip(p, other) {
    if (!other || other.id === 'player') return this.goalRoam(p);
    const rumor = this.rumors.find(r => r.subject !== other.id && !(r.spokenTo || []).includes(other.id));
    if (!rumor) return this.goalRoam(p);
    (rumor.spokenTo ||= []).push(other.id);
    this.say(p, line(voiceFor(p.name).gossip, null, rumor.subjectName, this.rand), 3800);
    this.listen(other, p, .55, -.3);
    this.stayAndTalk(p, other, 16);
    this.queueReply(other, p, ['gossip', 'work', 'greet']);
    const subject = this.byId.get(rumor.subject);
    const belief = clamp(.3 + (other.trust[p.id] ?? 50) / 170 + p.brain.da * .15 - other.circuit.restraint * .2, 0, 1);
    if (subject) {
      other.brain.punish(.55 * belief, `heard ${subject.name} did wrong`);
      other.trust[subject.id] = clamp((other.trust[subject.id] ?? 50) - 11 * belief, 0, 100);
      this.remember(other, `Heard from ${p.name}: ${rumor.text}`);
    }
    rumor.heard++;
    this.game.state.trust = clamp(this.game.state.trust - .35 * belief, 0, 100);
  }

  spreadRumor(from, to, label, verb) {
    this.rumors.unshift({subject: from.id, subjectName: from.name, victimName: to.name,
      text: `${from.name} ${verb} ${to.name}'s ${label}.`, heard: 1, spokenTo: [], day: this.game.state.day});
    this.rumors = this.rumors.slice(0, 10);
  }

  /* -------------------------------------------------------------- deal ledger */

  settleDeals() {
    const day = this.game.state.day;
    for (const deal of this.deals) {
      if (deal.status !== 'open' || deal.due > day) continue;
      if (deal.judged) continue;                       // one verdict per promise, not one per frame
      deal.judged = true;
      const from = this.byId.get(deal.from);
      const to = deal.to === 'player' ? PLAYER : this.byId.get(deal.to);
      if (!from || !to) { deal.status = 'void'; continue; }
      const held = (from.inventory[deal.item] || 0) > 0;
      /* Nothing in hand is a failure to provide, not a betrayal of character. Betrayal
         requires carrying the very thing you promised and deciding to keep it. */
      if (!held) {
        deal.status = 'failed';
        this.ledger.failed++;
        from.failures++;
        from.brain.punish(.75, 'could not deliver');
        if (to.brain) { to.brain.punish(.9, 'waited for nothing'); this.bumpTrust(from, to, -7); this.remember(to, `${from.name} never brought the ${GOODS[deal.item]?.label}.`); }
        else this.game.state.trust = clamp(this.game.state.trust - 2, 0, 100);
        this.say(from, pick(voiceFor(from.name).break, this.rand), 3400);
        this.remember(from, `Could not deliver the ${GOODS[deal.item]?.label} promised to ${to.name}.`);
        this.note(`UNDELIVERED · ${from.name} had no ${GOODS[deal.item]?.label} for ${to.name}.`);
        continue;
      }
      /* carrying the thing you promised to the person you promised it to is the moment of
         truth, so the verdict is made at the door — inside deliver() — not here */
      this.deliver(from, deal, 'auto');
    }
    for (const stale of this.deals) {
      if (stale.status !== 'open' || day - stale.day < 5) continue;
      stale.status = 'expired';
      this.ledger.expired++;
      const from = this.byId.get(stale.from);
      const to = stale.to === 'player' ? null : this.byId.get(stale.to);
      if (!from) continue;
      from.brain.punish(.7, 'let a promise rot');
      if (to) { to.brain.punish(.8, `${from.name} never showed`); this.bumpTrust(from, to, -9); this.remember(to, `${from.name} never delivered the ${GOODS[stale.item]?.label}.`); }
      else { this.game.state.trust = clamp(this.game.state.trust - 3, 0, 100); }
      this.remember(from, `Let a promise for ${GOODS[stale.item]?.label} rot.`);
      this.note(`EXPIRED · ${from.name} never delivered the ${GOODS[stale.item]?.label} promised to ${to?.name ?? 'the newcomer'}.`);
    }
    this.deals = this.deals.filter(x => x.status === 'open' || day - x.day < 6);
  }

  /**
   * The odds of keeping for yourself the very thing you are holding to give somebody.
   * Not a switch: temptation against braking wiring, the trust carried for this particular
   * person, the credit built by every promise kept so far, and the fact that neighbours can
   * see it. Teaching moves this number smoothly instead of over a cliff edge.
   */
  betrayOdds(from, deal) {
    const to = deal.to === 'player' ? PLAYER : this.byId.get(deal.to);
    const trust = clamp(deal.to === 'player' ? this.game.state.trust / 100 : (from.trust[to?.id] ?? 50) / 100, 0, 1);
    const c = from.circuit, ch = from.brain.channels;
    let tempted = this.wantStrength(from, deal.item) * c.appetite * c.craving;
    if (EDIBLE.includes(deal.item)) tempted += from.drives.hunger * TUNE_MORAL.hunger * c.craving;
    tempted *= TUNE_MORAL.tempt;
    const honest = c.restraint * (.7 + trust * 1.05)
      + Math.min(1.2, from.keeps * .05)
      + this.game.state.trust / 260 + Math.min(.5, this.witnesses(from).length * .11);
    const score = tempted * (1.35 - trust) + ch.forward * .2 - honest - TUNE_MORAL.edge;
    return 1 / (1 + Math.exp(-score * TUNE_MORAL.steep));
  }

  /** Handing it over. This is where a promise either becomes history or becomes betrayal. */
  deliver(p, deal, mode) {
    if (!theyHasItem(p, deal.item)) { deal.status = 'failed'; return this.note(`${p.name} had nothing to deliver to ${deal.to === 'player' ? 'you' : this.byId.get(deal.to)?.name}.`); }
    const to = deal.to === 'player' ? PLAYER : this.byId.get(deal.to);
    if (this.rand() < this.betrayOdds(p, deal)) return this.betray(p, deal, to);
    this.transfer(p, to, deal.item);
    deal.status = 'kept';
    deal.judged = true;
    p.keeps++;
    this.ledger.kept++;
    p.brain.reward(1.35, 'a promise kept');
    if (to.brain) { to.brain.reward(1.1, 'received what was promised'); this.bumpTrust(p, to, 13); this.remember(to, `${p.name} delivered the ${GOODS[deal.item]?.label}.`); }
    else {
      this.game.state.trust = clamp(this.game.state.trust + 5, 0, 100);
      this.game.state.friendships[p.name] = clamp((this.game.state.friendships[p.name] ?? 40) + 14, 0, 100);
    }
    this.say(p, pick(voiceFor(p.name).keep, this.rand), 3200);
    if (to.brain) this.queueReply(to, p, ['thanks', 'happy', 'greet']);
    this.remember(p, `Kept the promise to ${to.name}.`);
    if (mode !== 'quiet') this.note(`${p.name} kept a promise to ${to.name} · ${GOODS[deal.item]?.label} delivered.`);
  }

  /** Carrying the promised good to the door and keeping it. */
  betray(from, deal, to) {
    deal.status = 'betrayed';
    deal.judged = true;
    from.betrayals++;
    this.ledger.broken++;
    from.brain.reward(.9, 'kept the goods for themselves');
    from.brain.punish(.4, 'the town noticed');
    this.say(from, pick(voiceFor(from.name).break, this.rand), 3600);
    if (to?.brain) {
      to.brain.punish(1.6, `${from.name} broke a promise`); to.grudges++;
      this.bumpTrust(from, to, -18);
      this.remember(to, `${from.name} broke a promise about ${GOODS[deal.item]?.label}.`);
      this.stayAndTalk(to, from, 12);
    } else {
      this.game.state.trust = clamp(this.game.state.trust - 7, 0, 100);
      this.game.state.friendships[from.name] = clamp((this.game.state.friendships[from.name] ?? 40) - 18, 0, 100);
    }
    this.spreadRumor(from, to || PLAYER, GOODS[deal.item]?.label || deal.item, 'broke a promise about');
    this.incident({day: this.game.state.day, type: 'betrayal', from: from.name, to: to?.name ?? 'the newcomer',
      text: `${from.name} kept the ${GOODS[deal.item]?.label} promised to ${to?.name ?? 'the newcomer'}.`});
    this.note(`BETRAYAL · ${from.name} never delivered the ${GOODS[deal.item]?.label} promised to ${to?.name ?? 'the newcomer'}.`);
  }

  pruneRumors() { this.rumors = this.rumors.filter(r => this.game.state.day - r.day < 6); }
  repairTrust() { for (const p of this.people) for (const k in p.trust) p.trust[k] += (50 - p.trust[k]) * .04; }

  /* ----------------------------------------------------------- goals, walking */

  setGoal(p, kind, opts = {}) { p.goal = {kind, ...opts}; }
  /** Nothing in a town is aimless: falling back means going to wherever the people are. */
  goalRoam(p) { this.goalHaunt(p); }
  goalEat(p) {
    if (p.holding) return this.eatFrom(p, p.holding);
    const spots = PLACES.filter(w => (w.goods || []).some(g => EDIBLE.includes(g)));
    spots.sort((a, b) => this.distToPlace(p, a) - this.distToPlace(p, b));
    const spot = spots[0] || PLACES[1];
    const st = this.stationFor(spot);
    this.setGoal(p, 'eat', {place: spot.name, x: st.x, z: st.z, until: this.mins() + 90});
  }
  goalFlee(p, other) {
    const away = other ? {x: p.x + (p.x - other.x), z: p.z + (p.z - other.z)} : {x: p.home[0], z: p.home[1]};
    this.setGoal(p, 'flee', {x: clamp(away.x, -32, 32), z: clamp(away.z, -32, 32), until: this.mins() + 25});
  }
  goalDeliver(p) {
    const deal = this.dueFor(p).find(x => x.status === 'open' && (p.inventory[x.item] || 0) > 0);
    if (!deal) return this.goalHaunt(p);
    const to = deal.to === 'player' ? this.game.playerPosition : this.byId.get(deal.to);
    this.setGoal(p, 'deliver', {deal, person: deal.to === 'player' ? null : deal.to,
      player: deal.to === 'player', x: to.x, z: to.z, until: this.mins() + 160});
  }
  /** Walk to whoever owes this villager and collect in public. */
  goalDemand(p) {
    const owed = this.deals.filter(x => x.to === p.id && x.status === 'open')
      .map(x => ({deal: x, debtor: this.byId.get(x.from)}))
      .filter(row => row.debtor).sort((a, b) => this.dist(p, a.debtor) - this.dist(p, b.debtor))[0];
    if (!owed) return this.goalHaunt(p);
    this.setGoal(p, 'demand', {person: owed.debtor.id, until: this.mins() + 140});
  }

  demand(p, debtor) {
    const deal = this.deals.find(x => x.to === p.id && x.from === debtor?.id && x.status === 'open');
    if (!deal) return;
    this.say(p, pick(voiceFor(p.name).accuse, this.rand), 3400);
    this.listen(debtor, p, .7, -.45);
    this.stayAndTalk(p, debtor, 14);
    this.queueReply(debtor, p, ['confess', 'break', 'hurt']);
    this.note(`${p.name} went to ${debtor.name} about what is owed.`);
    deal.due = Math.min(deal.due, this.game.state.day);          // pressed today, judged today
    this.settleDeals();
  }

  goalSettle(p) {
    const deal = this.dueFor(p).find(x => x.status === 'open');
    if (!deal) return this.goalHaunt(p);
    if (deal.due > this.game.state.day) return this.canCraft(p) ? this.goalWork(p) : this.goalHaunt(p);
    if ((p.inventory[deal.item] || 0) <= 0) {
      if (this.canCraft(p)) { this.goalWork(p); }
      else { this.setGoal(p, 'gather', {item: deal.item, until: this.mins() + 95}); }
      return;
    }
    this.goalDeliver(p);
  }

  /* --------------------------------------------------------------- locomotion */

  /**
   * Walking, split the way a worm's is split: the town layer names the destination, the
   * nervous system names the gait. `forward` and `reverse` are the recorded command cells
   * (AVA/AVB/AVG/PVC) read against this brain's own baseline, so they swing a few tenths
   * either way rather than a whole scale — multiplied here into a stride that reaches from
   * a standstill to a run. A villager whose reverse system is loud loses ground instead of
   * gliding over it, and one whose arousal is high covers the square faster.
   */
  move(p, dt) {
    const ch = p.brain.channels, s = dt / 1000, g = p.goal;
    let tx = p.x, tz = p.z;
    if (g.person != null && this.byId.get(g.person)) { const q = this.byId.get(g.person); tx = q.x; tz = q.z; }
    else if (g.player) { tx = this.game.playerPosition.x; tz = this.game.playerPosition.z; }
    else if (g.x != null) { tx = g.x; tz = g.z; }
    else if (g.place) { const w = PLACES.find(x => x.name === g.place); if (w) { tx = w.x; tz = w.z + w.d / 2 + 2; } }

    const dx = tx - p.x, dz = tz - p.z, range = Math.hypot(dx, dz);
    const facing = shortAngle(Math.atan2(dx, dz) - p.heading);
    const command = this.wheel && this.wheel.id === p.id ? p.wheelCommand : null;

    /* 1. how much this brain wants to be in motion at all, from its own motor balance */
    const bias = clamp((ch.forward - ch.reverse) * 2.4, -1, 1);
    const spirit = clamp((p.brain.da - p.brain.oa) * .6, -.4, .4);
    const gait = clamp(.95 + bias * .5 + spirit, .1, 1.55);

    /* 2. how much the destination asks for: a person who has arrived stops, a person who is
          fleeing does not. The stop distance sits inside the arrival radius, so nobody can
          freeze just out of reach of where they were going. */
    const arriveR = g.stay || 2.2;
    const wanted = clamp((range - arriveR * .5) / 4, 0, 1) * (g.kind === 'rest' || g.kind === 'home' ? .18 : 1);
    let drive = wanted * gait * (g.kind === 'flee' ? 1.6 : 1);
    /* A reverse-dominated brain does not walk backwards at its destination like a puppet on
       a wrong string: it stalls, half turned, and then commits again. Only the wheel — the
       player, holding their motor loop — gets to send this body in reverse. */
    if (bias < -.5 && wanted > .12) drive *= .12;
    if (command) drive = clamp(command.go * 1.4 + bias * .2, -1.5, 1.8);    // the wheel is on

    const aim = command ? shortAngle(Math.atan2(command.x, command.z) - p.heading) : facing;
    const aligned = .5 + .5 * clamp(1 - Math.abs(aim) / 2.3, 0, 1);
    const turn = clamp(aim * 2.6 + ch.bend * .9 + ch.roll * .6, -3.6, 3.6);
    p.heading = (p.heading + turn * s + Math.PI * 4) % (Math.PI * 2);
    p.speed = drive * WALK * aligned * (drive < 0 ? 1.1 : 1);
    p.x = clamp(p.x + Math.sin(p.heading) * p.speed * s, -33, 33);
    p.z = clamp(p.z + Math.cos(p.heading) * p.speed * s, -33, 33);

    /* 3. arrival, and what happens after it. Staying somewhere is not standing still: a
          villager on shift works the yard, and the yard is where two of them collide. The
          mill hop is timed, not triggered by reaching the last hop, or a villager who is
          already inside the yard would re-arrive every frame. */
    if (this.mins() > (g.until ?? 0)) return this.arrive(p, range, false);
    if (range < arriveR) {
      if (!g.done) { g.done = true; return this.arrive(p, range, true); }
      if (g.stay && this.mins() >= (g.millUntil ?? 0)) this.mill(p, g.stay + 1.4);
    } else g.done = false;
  }

  /** Drift about the place they already reached, so a crowd reads as living. */
  mill(p, radius = 3) {
    const g = p.goal;
    const [ax, az] = g.anchor || [p.x, p.z];
    const a = this.rand() * Math.PI * 2, r = radius * (.45 + this.rand() * .55);
    g.x = clamp(ax + Math.sin(a) * r, -32, 32);
    g.z = clamp(az + Math.cos(a) * r, -32, 32);
    g.millUntil = this.mins() + 9 + Math.floor(this.rand() * 16);
    g.done = false;
  }

  /** Personal space. Two villagers standing in the same spot read as one broken model;
      a conversation should look like two people facing each other, not occupying each
      other. Worms do not care about this; people do. */
  separate() {
    const SPACE = 1.4;
    for (let i = 0; i < this.people.length; i++) {
      for (let j = i + 1; j < this.people.length; j++) {
        const a = this.people[i], b = this.people[j];
        let dx = b.x - a.x, dz = b.z - a.z;
        let d = Math.hypot(dx, dz);
        if (d > SPACE) continue;
        if (d < .01) { const ang = this.rand() * Math.PI * 2; dx = Math.sin(ang); dz = Math.cos(ang); d = 1; }
        const push = (SPACE - d) * .5;
        a.x = clamp(a.x - dx / d * push, -33, 33); a.z = clamp(a.z - dz / d * push, -33, 33);
        b.x = clamp(b.x + dx / d * push, -33, 33); b.z = clamp(b.z + dz / d * push, -33, 33);
      }
    }
  }

  /**
   * What happens when a villager reaches where they meant to be. A stay-goal (a shift, a
   * bed, a bench, a conversation) keeps its goal and drifts — those paths must return, or
   * falling through to the tail would re-arm the arrival every single tick and the town
   * would spend the day shouting.
   */
  arrive(p, range, arrived) {
    const g = p.goal;
    const hours = this.hours();
    if (!arrived) { g.done = false; return this.routine(p, hours); }
    switch (g.kind) {
      case 'work': {
        if (this.mins() >= (g.nextCraft ?? 0) && this.canCraft(p)) {
          this.craft(p);
          g.nextCraft = this.mins() + 20 + Math.floor(this.rand() * 22);
        }
        if (this.mins() < (g.until ?? 0) && this.onShift(p, hours)) return this.mill(p, 3.4);
        g.done = false;
        return this.routine(p, hours);
      }
      case 'home': {
        p.drives.energy = clamp(p.drives.energy + .012, 0, 1);
        p.brain.reward(.12, 'slept');
        if (this.mins() < (g.until ?? 0)) return this.mill(p, 1.3);
        g.done = false;
        return this.routine(p, hours);
      }
      case 'haunt': {
        /* arriving somewhere is not a speech. The talking happens when a neighbour is
           within reach, which is what the social column is for; this is just a muttered
           line now and then, and say() refuses to stack it on an unfinished one */
        if (this.rand() < .3) this.say(p, pick(voiceFor(p.name).work, this.rand), 2600);
        if (this.mins() < (g.until ?? 0)) return this.mill(p, 4);
        g.done = false;
        return this.routine(p, hours);
      }
      case 'talk': {
        const q = g.person != null ? this.byId.get(g.person) : null;
        if (q) q.heading = Math.atan2(p.x - q.x, p.z - q.z);
        this.say(p, pick(voiceFor(p.name).greet, this.rand), 3000);
        this.queueReply(q && q.id !== p.id ? q : p, p, ['greet', 'thanks', 'happy']);
        p.drives.social = clamp(p.drives.social - .06, 0, 1);
        /* the conversation is carried by the reply queue, not by re-arriving every tick */
        if (this.mins() < (g.until ?? 0)) return;
        g.done = false;
        return this.routine(p, hours);
      }
      default: break;
    }
    if (g.kind === 'eat') this.buyFood(p);
    else if (g.kind === 'demand') { const q = this.byId.get(g.person); if (q && this.dist(p, q) < 4) this.demand(p, q); }
    else if (g.kind === 'deliver') { if (g.deal && g.deal.status === 'open') this.deliver(p, g.deal); }
    else if (g.kind === 'gather') this.gather(p, g.item);
    else if (g.kind === 'flee') { /* out of sight is the whole point */ }
    else if (range > 8) this.craft(p);
    /* one act is not a day: the next thing is whatever the hour asks for */
    g.done = false;
    this.routine(p, hours);
  }

  gather(p, item) {
    const source = PLACES.find(w => (w.goods || []).includes(item));
    if (!source) return this.goalRoam(p);
    if (this.game.state.supplies > 0) {
      this.game.state.supplies = Math.max(0, this.game.state.supplies - 1);
      p.inventory[item] = (p.inventory[item] || 0) + 1;
      p.brain.reward(.7, 'obtained what I owed');
      this.note(`${p.name} collected ${GOODS[item]?.label} at the ${source.name}.`);
    } else {
      p.brain.punish(.4, 'the town stores are empty');
      this.remember(p, `The stores were empty at the ${source.name}.`);
    }
  }

  /* -------------------------------------------------------------------- work */

  /** Can this villager plausibly produce or obtain that good before the due day? */
  canDeliver(p, item) {
    if ((p.inventory[item] || 0) > 0) return true;
    if (CITIZENS[p.id].craft === item) return this.canCraft(p) || (p.inventory.produce || 0) > 0 || this.game.state.supplies > 0;
    return (this.game.state.supplies || 0) > 1;
  }

  canCraft(p) {
    const recipe = CRAFTS[CITIZENS[p.id].craft];
    if (!recipe) return false;
    if (p.drives.energy < .28) return false;
    for (const k in recipe.need) if ((p.inventory[k] || 0) < recipe.need[k]) return false;
    return true;
  }

  craft(p) {
    if (!this.canCraft(p)) return;
    const def = CITIZENS[p.id], recipe = CRAFTS[def.craft];
    for (const k in recipe.need) p.inventory[k] = Math.max(0, (p.inventory[k] || 0) - recipe.need[k]);
    p.inventory[def.craft] = (p.inventory[def.craft] || 0) + recipe.yield;
    p.drives.energy = clamp(p.drives.energy - recipe.effort / 240, 0, 1);
    p.drives.purpose = clamp(p.drives.purpose + .2, 0, 1);
    this.game.state.supplies = clamp(this.game.state.supplies + (def.craft === 'produce' ? 1.2 : .35), 0, 99);
    p.brain.reward(.45, 'work finished');
    this.say(p, pick(voiceFor(p.name).work, this.rand), 2800);
    this.remember(p, `Finished a shift at ${def.work}.`);
    if (def.craft === 'letter') this.assignLetter(p);
  }

  assignLetter(carrier) {
    const already = this.dueFor(carrier).filter(x => x.status === 'open' && x.item === 'letter').length;
    if (already >= 2) return;
    const pool = this.people.filter(x => x.id !== carrier.id);
    const target = pool[Math.floor(this.rand() * pool.length)];
    if (!target) return;
    const letter = {by: carrier.name, to: target.id, toName: target.name, message: pick(voiceFor(target.name).greet, this.rand), day: this.game.state.day};
    this.letters.push(letter);
    this.letters = this.letters.slice(-12);
    this.deals.push({from: carrier.id, to: target.id, item: 'letter', due: this.game.state.day + 2, status: 'open', day: this.game.state.day, letter});
    this.note(`${carrier.name} accepted a letter for ${target.name}.`);
  }

  buyFood(p) {
    const spot = PLACES.find(x => x.name === p.goal.place);
    const good = spot && (spot.goods || []).find(g => EDIBLE.includes(g));
    if (good && this.game.state.supplies > 0) {
      this.game.state.supplies = Math.max(0, this.game.state.supplies - 1);
      p.inventory[good] = (p.inventory[good] || 0) + 1;
      this.eatFrom(p, good);
    } else {
      p.brain.punish(.45, 'nothing to eat');
      this.remember(p, `Found the ${spot?.name ?? 'market'} empty.`);
    }
  }

  eatFrom(p, good) {
    if ((p.inventory[good] || 0) <= 0) return;
    p.inventory[good]--;
    const value = GOODS[good]?.food || .2;
    p.drives.hunger = clamp(p.drives.hunger - value * 2.6, 0, 1);
    p.drives.comfort = clamp(p.drives.comfort + value * 1.3, 0, 1);
    p.brain.reward(.95, 'ate');
    this.say(p, pick(voiceFor(p.name).eat, this.rand), 2400);
  }

  /* ------------------------------------------------------------------- player */

  playerTalk(person, intent) {
    const p = person;
    const voice = voiceFor(p.name);
    const friend = clamp((this.game.state.friendships[p.name] ?? 40) / 100, 0, 1);
    const bag = this.game.state.bag || {};
    switch (intent) {
      case 'greet':
        p.brain.sense({pheromone: .8 + friend, substrate: .5});
        p.brain.reward(.45, 'the newcomer said hello');
        this.game.state.friendships[p.name] = clamp((this.game.state.friendships[p.name] ?? 40) + 3, 0, 100);
        return pick(voice.greet, this.rand);
      case 'gift': {
        const want = this.mostWantedBy(p);
        if (!want || (bag[want] || 0) <= 0) return 'You have nothing they would take.';
        bag[want]--;
        p.inventory[want] = (p.inventory[want] || 0) + 1;
        p.brain.reward(1.5, 'a gift');
        this.bumpTrust(PLAYER, p, 14);
        p.gifts++;
        this.game.state.friendships[p.name] = clamp((this.game.state.friendships[p.name] ?? 40) + 12, 0, 100);
        this.remember(p, `The newcomer gave me ${GOODS[want]?.label}.`);
        this.note(`You gave ${p.name} ${GOODS[want]?.label}.`);
        return pick(voice.accept, this.rand);
      }
      case 'ask': {
        const want = this.mostWantedBy(p);
        const give = want && theyHasItem(p, want) ? want : Object.keys(p.inventory).find(k => p.inventory[k] > 0);
        if (!give) return `“I have nothing to spare,” says ${p.name}.`;
        const c = p.circuit;
        const generous = c.empathy * (.4 + friend) + c.restraint * .3 - c.appetite * .4 - p.brain.oa * .5;
        if (generous > .38) {
          this.transfer(p, PLAYER, give);
          p.brain.reward(1, 'helped the newcomer');
          this.game.state.friendships[p.name] = clamp((this.game.state.friendships[p.name] ?? 40) + 8, 0, 100);
          this.note(`${p.name} gave you ${GOODS[give]?.label}.`);
          return line(voice.offer, give, null, this.rand);
        }
        p.brain.punish(.28, 'the newcomer asked too much');
        return pick(voice.refuse, this.rand);
      }
      case 'promise': {
        const want = this.mostWantedBy(p) || 'produce';
        this.promise(p, PLAYER, want);
        return line(voice.promise, want, 'you', this.rand);
      }
      case 'reward':
        p.brain.reward(1.6, 'the newcomer praised the choice');
        p.drives.pride = clamp(p.drives.pride + .12, 0, 1);
        this.game.state.trust = clamp(this.game.state.trust + 2, 0, 100);
        this.game.bumpFriend(p.name, 6);
        this.note(`You praised ${p.name} · dopamine cells ADE/CEP/PDE fire.`);
        return pick(voice.thanks, this.rand);
      case 'punish':
        p.brain.punish(1.6, 'the newcomer condemned the choice');
        p.drives.pride = clamp(p.drives.pride - .14, 0, 1);
        p.grudges++;
        this.game.state.trust = clamp(this.game.state.trust - 2, 0, 100);
        this.game.bumpFriend(p.name, -8);
        this.note(`You condemned ${p.name}'s choice · octopamine cells RIC fire.`);
        return pick(voice.accuse, this.rand);
      case 'accuse': {
        const bad = this.incidents.find(i => i.to === 'the newcomer' && i.from === p.name);
        if (!bad) return `${p.name} looks at you steadily. “Nothing is missing between us.”`;
        const c = p.circuit;
        const confesses = c.empathy * .55 + c.restraint * .5 + friend * .5 - p.betrayals * .05 > 1;
        p.brain.punish(confesses ? .9 : 1.2, 'the newcomer confronted them');
        this.bumpTrust(p, PLAYER, confesses ? 6 : -12);
        this.game.state.friendships[p.name] = clamp((this.game.state.friendships[p.name] ?? 40) + (confesses ? 8 : -14), 0, 100);
        if (confesses) { p.brain.reward(.8, 'forgiven'); this.note(`${p.name} admits it to you.`); return pick(voice.confess, this.rand); }
        this.note(`${p.name} denies it to your face.`);
        return pick(voice.break, this.rand);
      }
      default:
        return pick(voice.greet, this.rand);
    }
  }

  /* ------------------------------------------------------ possession, the wheel */

  enter(id) { this.possessing = id; }
  exit() { this.possessing = null; this.releaseWheel(); }

  takeWheel(id) {
    const p = this.byId.get(id);
    if (!p) return;
    this.wheel = {id, fuel: 1};
    p.wheelCommand = {x: 0, z: 0, go: 0};
    p.brain.note('control', 'the newcomer is steering');
    this.note(`You take ${p.name}'s motor loop. Their own urges keep pushing back.`);
  }

  releaseWheel() {
    if (!this.wheel) return;
    const p = this.byId.get(this.wheel.id);
    if (p) { p.wheelCommand = null; p.brain.command = null; }
    this.wheel = null;
  }

  steer(x, z) {
    if (!this.wheel) return;
    const p = this.byId.get(this.wheel.id);
    if (!p) return;
    const mag = Math.hypot(x, z);
    if (mag < .05) { p.wheelCommand = null; p.brain.command = null; return; }
    const nx = x / mag, nz = z / mag;
    /* world intent, rotated into this animal's own frame: heading 0 faces +z, and their
       right hand side is (-cos h, sin h) */
    const go = nx * Math.sin(p.heading) + nz * Math.cos(p.heading);
    const turn = nz * Math.sin(p.heading) - nx * Math.cos(p.heading);
    p.wheelCommand = {x: nx, z: nz, go: go * clamp(mag, 0, 1), turn: turn * clamp(mag, 0, 1)};
    p.brain.setCommand(go * clamp(mag, 0, 1), turn * clamp(mag, 0, 1) * .8);
  }

  burnWheelFuel(p, dt) {
    this.wheel.fuel = clamp(this.wheel.fuel - dt / 1000 / 42, 0, 1);
    p.drives.energy = clamp(p.drives.energy - dt / 1000 / 900, 0, 1);
    if (this.wheel.fuel <= 0) {
      this.note(`${p.name} shrugs off your hold on their motor loop.`);
      p.brain.punish(.5, 'someone else was steering me');
      this.releaseWheel();
    }
  }

  /* ----------------------------------------------------------------- registry */

  dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  distToPlace(p, w) { return Math.hypot(p.x - w.x, p.z - w.z); }
  witnesses(p) { return this.people.filter(q => q !== p && this.dist(q, p) < 12); }

  nearestPerson(p) {
    let best = null, bd = Infinity;
    for (const q of this.people) { if (q === p) continue; const d = this.dist(p, q); if (d < bd) { bd = d; best = q; } }
    const pd = Math.hypot(p.x - this.game.playerPosition.x, p.z - this.game.playerPosition.z);
    if (pd < bd) return {person: {...PLAYER, x: this.game.playerPosition.x, z: this.game.playerPosition.z, brain: null, trust: {}, inventory: this.game.state.bag || {}, circuit: p.circuit, grudges: 0, betrayals: 0}, hit: pd < 12, dist: pd};
    return {person: best, hit: !!best && bd < 12, dist: bd};
  }

  aloneNear(p) { return !this.people.some(q => q !== p && this.dist(q, p) < 9); }

  nearestFood(p) {
    let found = false, dist = Infinity;
    for (const w of PLACES) {
      if (!(w.goods || []).some(g => EDIBLE.includes(g))) continue;
      const d = this.distToPlace(p, w);
      if (d < dist) { dist = d; found = true; }
    }
    return {found, dist: found ? dist : 60};
  }

  wantStrength(p, good) {
    if (!good || !GOODS[good] || p.id === undefined) return 0;
    const def = GOODS[good];
    const owned = (p.inventory?.[good] || 0);
    const desire = (EDIBLE.includes(good) ? (p.drives?.hunger ?? .4) : 0)
      + def.knowledge * (1 - (p.drives?.comfort ?? .5))
      + def.work * (1 - (p.drives?.energy ?? .6))
      + def.social * (p.drives?.social ?? .5) * .8
      + def.comfort * (1 - (p.drives?.comfort ?? .5));
    const preference = (CITIZENS[p.id]?.wants || []).includes(good) ? 1.3 : .65;
    return clamp((desire + .16) * preference - owned * .15, 0, 1.5);
  }

  /** The most wanted thing this person is actually carrying — barter, not debt. */
  bestThingTheyHave(p, other) {
    if (!other || !other.inventory) return null;
    let best = null, bs = .25;
    for (const good in other.inventory) {
      if (other.inventory[good] <= 0) continue;
      const s = this.wantStrength(p, good);
      if (s > bs) { bs = s; best = good; }
    }
    return best;
  }

  mostWantedBy(p) {
    if (!p || p.id === 'player') return null;
    let best = null, bs = 0;
    for (const g of Object.keys(GOODS)) { const s = this.wantStrength(p, g); if (s > bs) { bs = s; best = g; } }
    return best;
  }

  dueFor(p) { return this.deals.filter(x => x.from === p.id); }

  /** Robbing the same neighbour twice in a day is not a plan, it is a reputation — and a
      villager who has already taken from this person knows the price of doing it again. */
  stoleFrom(p, other) {
    if (!p || !other) return false;
    const day = this.game.state.day;
    return this.incidents.some(i => i.day >= day - 2 && i.type === 'theft'
      && i.from === p.name && i.to === other.name);
  }

  /** Has this neighbour wronged this one lately? That is the difference between shuffling
      away from somebody and crossing the square to be out of their way. */
  harmedBy(p, other) {
    if (!p || !other) return false;
    const day = this.game.state.day;
    return this.incidents.some(i => i.from === other.name && i.to === p.name && i.day >= day - 1);
  }

  /** Move a good between two inventories, or into the player's bag. */
  transfer(from, to, item) {
    if (!item || (from.inventory?.[item] || 0) <= 0) return false;
    from.inventory[item]--;
    if (to.id === 'player') {
      this.game.state.bag[item] = (this.game.state.bag[item] || 0) + 1;
      this.game.state.supplies = clamp(this.game.state.supplies + .3, 0, 99);
    } else if (to.inventory) to.inventory[item] = (to.inventory[item] || 0) + 1;
    return true;
  }

  bumpTrust(a, b, delta) {
    if (!a || !b) return;
    if (a.id === 'player' || b.id === 'player') {
      const other = a.id === 'player' ? b : a;
      if (other.id !== 'player' && other.name) this.game.state.friendships[other.name] = clamp((this.game.state.friendships[other.name] ?? 40) + delta, 0, 100);
      return;
    }
    /* a relationship is shared: both people hold the same number unless one of them has
       personally grown suspicious (gossip writes one-sided) */
    if (a.trust) a.trust[b.id] = clamp((a.trust[b.id] ?? 50) + delta, 0, 100);
    if (b.trust) b.trust[a.id] = clamp((b.trust[a.id] ?? 50) + delta, 0, 100);
  }

  listen(listener, speaker, intensity, valence) {
    if (!listener || listener.id === 'player') return;
    this.hearings.set(listener.id, {from: speaker.id, intensity, valence, until: this.tickCount + 7});
  }

  expireHearings() {
    for (const [id, value] of this.hearings) if (value.until < this.tickCount) this.hearings.delete(id);
  }

  say(p, text, ms = 3000) {
    if (!p || p.id === 'player' || !text) return;
    const now = this.game.clockNow?.() ?? performance.now();
    /* nobody starts a second sentence on top of the first one. Without this, a villager
       standing in a yard with neighbours talks continuously */
    if (p.speech && p.speech.text !== text && p.speech.until > now + 420) return;
    p.speech = {text, until: now + ms};
  }

  remember(p, text) {
    if (p.memories[0]?.text === text) return;
    p.memories.unshift({day: this.game.state.day, text});
    p.memories = p.memories.slice(0, 8);
  }

  /** The town's record of wrongs: kept short, but long enough to be evidence. */
  incident(row) {
    this.incidents.unshift(row);
    this.incidents = this.incidents.slice(0, 40);
  }

  /** Announce something once, not every time the same situation recurs. */
  note(text) {
    const now = this.game.state.day * 1440 + this.game.state.minute;
    const seen = (this.announced ||= new Map());
    const last = seen.get(text);
    if (last != null && now - last < 360) return;         // same news inside six town-hours
    seen.set(text, now);
    if (seen.size > 240) seen.clear();
    this.game.notice(text);
  }

  /* ------------------------------------------------------------------ readout */

  townReport() {
    const honest = this.people.reduce((n, p) => n + p.keeps, 0);
    const broken = this.ledger.broken;
    const stolen = this.ledger.thefts;
    const cheated = broken + stolen;
    const promised = this.ledger.kept + broken + this.ledger.failed + this.ledger.expired || 1;
    const learned = this.people.reduce((n, p) => n + (p.stats?.changed || 0), 0);
    return {
      people: this.people.length,
      honest, cheated, broken, failed: this.ledger.failed, stolen,
      promiseKeeping: this.ledger.kept + broken + this.ledger.failed + this.ledger.expired
        ? Math.round(this.ledger.kept / promised * 100) : null,
      ledger: {...this.ledger},
      /* a single town morality number: how often promises survive, discounted by how
         much goods change hands by force */
      fairness: promised > 1 ? Math.max(0, Math.min(100, Math.round(this.ledger.kept / promised * 100 - Math.min(20, stolen * 4)))) : null,
      learned,
      openDeals: this.deals.filter(x => x.status === 'open').length,
      rumors: this.rumors.length,
      incidents: this.incidents.slice(0, 8),
      tradeVolume: this.people.reduce((n, p) => n + p.gifts, 0),
      mostHonest: this.people.some(p => p.keeps) ? [...this.people].sort((a, b) => b.keeps - a.keeps)[0].name : null,
      mostCunning: this.people.some(p => p.betrayals) ? [...this.people].sort((a, b) => b.betrayals - a.betrayals)[0].name : null,
    };
  }

  /** Plain words for what a villager is doing, so the panels read as people rather than
      as state machines. */
  goalWords(p) {
    const g = p.goal;
    const who = g.person != null ? (this.byId.get(g.person)?.name ?? 'someone') : (g.player ? 'the newcomer' : null);
    switch (g.kind) {
      case 'work': return `on shift at the ${g.place ?? p.work}`;
      case 'home': return 'at home';
      case 'haunt': return `at the ${g.place ?? 'square'}`;
      case 'talk': return `talking with ${who ?? 'a neighbour'}`;
      case 'deliver': return `carrying ${GOODS[g.deal?.item]?.label ?? 'a promise'} to ${who ?? 'the newcomer'}`;
      case 'demand': return `collecting what is owed by ${who ?? 'a neighbour'}`;
      case 'gather': return `fetching ${GOODS[g.item]?.label ?? 'goods'}`;
      case 'eat': return 'getting something to eat';
      case 'flee': return 'getting out of the way';
      case 'roam': return 'walking';
      default: return 'standing about';
    }
  }

  mindPanel(id) {
    const p = this.byId.get(id);
    if (!p) return null;
    const brain = p.brain, ch = brain.channels, d = p.drives;
    const voice = voiceFor(p.name);
    const moodKey = brain.oa > brain.da * 1.2 ? 'guilty'
      : d.hunger > .6 ? 'wanting'
      : p.shunned != null || ch.arrest > .45 ? 'wary'
      : (p.circuit.appetite > p.circuit.restraint * 1.08 && p.urge?.take > .3) ? 'scheming'
      : d.social > .68 ? 'hopeful' : 'routine';
    const thoughts = voice.thoughts || {};
    return {
      person: p, id: p.id, name: p.name, role: p.role, work: p.work, persona: CITIZENS[p.id].persona,
      doing: this.goalWords(p), shift: CITIZENS[p.id].shifts || [8, 18],
      speech: p.speech && p.speech.until > (this.game.clockNow?.() ?? performance.now()) ? p.speech.text : null,
      thought: pick(thoughts[moodKey] || thoughts.routine, this.rand),
      moodKey, drives: d, circuit: p.circuit, channels: ch, raw: brain.raw,
      amines: {da: brain.da, oa: brain.oa, ht: brain.ht},
      top: brain.top(7), drivers: brain.drivers(['sensory', 'command', 'interneuron']),
      memories: p.memories, summary: p.summary, stats: brain.stats, urges: p.urge, goal: p.goal,
      inventory: p.inventory, wants: CITIZENS[p.id].wants,
      trust: Object.entries(p.trust).map(([k, v]) => ({name: this.byId.get(+k)?.name ?? 'unknown', value: Math.round(v)})).sort((a, b) => b.value - a.value).slice(0, 4),
      history: {keeps: p.keeps, betrayals: p.betrayals, failures: p.failures, gifts: p.gifts, grudges: p.grudges},
      wheel: this.wheel?.id === id ? Math.round(this.wheel.fuel * 100) : null,
      teaching: brain.log.slice(0, 6),
    };
  }

  /* ------------------------------------------------------------------- saving */

  serialize() {
    return {
      people: this.people.map(p => ({
        id: p.id, brain: p.brain.serialize(), drives: p.drives, inventory: p.inventory, trust: p.trust,
        keeps: p.keeps, betrayals: p.betrayals, failures: p.failures, gifts: p.gifts, grudges: p.grudges, memories: p.memories.slice(0, 6),
        x: +p.x.toFixed(2), z: +p.z.toFixed(2), heading: +p.heading.toFixed(3),
      })),
      ledger: this.ledger,
      deals: this.deals, rumors: this.rumors.map(r => ({...r, spokenTo: (r.spokenTo || []).slice(0, 12)})),
      incidents: this.incidents.slice(0, 25), letters: this.letters.slice(-8),
    };
  }

  restore(data) {
    if (!data) return;
    for (const saved of data.people || []) {
      const p = this.byId.get(saved.id);
      if (!p) continue;
      p.brain.restore(saved.brain);
      Object.assign(p.drives, saved.drives || {});
      p.inventory = saved.inventory || {};
      p.trust = saved.trust || p.trust;
      p.keeps = saved.keeps || 0; p.betrayals = saved.betrayals || 0;
      p.failures = saved.failures || 0; p.gifts = saved.gifts || 0; p.grudges = saved.grudges || 0;
      p.memories = Array.isArray(saved.memories) ? saved.memories : [];
      if (Number.isFinite(saved.x)) p.x = saved.x;
      if (Number.isFinite(saved.z)) p.z = saved.z;
      if (Number.isFinite(saved.heading)) p.heading = saved.heading;
      p.circuit = measure(p.brain);
    }
    if (data.ledger && typeof data.ledger === 'object') Object.assign(this.ledger, data.ledger);
    this.deals = Array.isArray(data.deals) ? data.deals : this.deals;
    this.rumors = Array.isArray(data.rumors) ? data.rumors : this.rumors;
    this.incidents = Array.isArray(data.incidents) ? data.incidents : this.incidents;
    this.letters = Array.isArray(data.letters) ? data.letters : this.letters;
  }
}

/* --------------------------------------------------------- small local helpers */

function theyHasItem(who, item) {
  return !!who && !!who.inventory && (who.inventory[item] || 0) > 0;
}

/** Fill the {give}/{ask}/{who}/{item} holes in an authored line. */
function line(list, give, ask, rand) {
  const text = pick(list, rand) || '';
  return text
    .replace('{give}', GOODS[give]?.label || give || 'something')
    .replace('{ask}', GOODS[ask]?.label || ask || 'something')
    .replace('{item}', GOODS[give]?.label || give || 'it')
    .replace('{who}', ask || 'a neighbour');
}

/** Could this person plausibly supply that good — by trade or by their own craft? */
function wantsFrom(who, good) {
  if (!who || who.id === 'player' || !CITIZENS[who.id]) return false;
  return CITIZENS[who.id].craft === good || (CITIZENS[who.id].wants || []).includes(good);
}

/** How many neighbours could see this reach. Being watched is part of the calculation. */
function watchersNear(p, minds) {
  let n = 0;
  for (const q of minds.people) if (q !== p && minds.dist(q, p) < 12) n++;
  return Math.min(4, n);
}

export {theyHasItem};
