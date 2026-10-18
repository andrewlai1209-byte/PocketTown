import {PLACES, CITIZENS, GOODS, CRAFTS} from '../data/town.js';
import {Minds} from './minds.js';
import {loadState, saveState} from '../services/storage.js';

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fresh = () => ({
  day: 1, minute: 480, money: 85, food: 90, energy: 95, mood: 80,
  trust: 50, reputation: 0, supplies: 12, speed: 1, paused: false,
  bag: {bread: 2, produce: 2}, friendships: {}, shifts: {}, log: [], minds: null,
});

export class Game {
  constructor() {
    this.state = fresh();
    this.mindRandom = mulberry32(20261017);
    this.acc = 0;
    this.listeners = [];
    this.playerPosition = {x: 0, z: 6};
    this.possessing = null;
    this.load();
    this.minds = new Minds(this);
    this.citizens = this.minds.people;
    if (this.state.minds) this.minds.restore(this.state.minds);
  }

  /* ------------------------------------------------------------ infrastructure */

  onChange(fn) { this.listeners.push(fn); }
  emit() { for (const fn of this.listeners) fn(this.state); }
  clockNow() { return performance.now(); }
  time() {
    const m = Math.floor(this.state.minute);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  notice(message) {
    this.state.log.unshift(`Day ${this.state.day}, ${this.time()} — ${message}`);
    this.state.log = this.state.log.slice(0, 26);
    this.emit();
  }

  /* -------------------------------------------------------------------- clock */

  tick(realDt) {
    if (this.state.paused) return;
    this.acc += realDt * 0.004 * this.state.speed;
    while (this.acc >= 1) {
      this.acc--;
      this.state.minute++;
      if (this.state.minute >= 1440) this.newDay();
      if (this.state.minute % 20 === 0) this.playerNeeds();
    }
    this.minds.tick(realDt);
  }

  newDay() {
    const s = this.state;
    s.minute = 0; s.day++;
    s.energy = clamp(s.energy + 34, 0, 100);
    s.food = clamp(s.food - 9, 0, 100);
    s.mood = clamp(s.mood - 2, 0, 100);
    s.supplies = clamp(s.supplies - 1, 0, 99);
    if (s.day % 7 === 1) { s.money = Math.max(0, s.money - 20); this.notice('Weekly living costs: $20.'); }
    const report = this.minds.townReport();
    this.notice(`Day ${s.day} begins · ${report.openDeals} promise(s) fall due today · town fairness ${report.fairness}%.`);
    this.save();
  }

  playerNeeds() {
    const s = this.state, hours = s.minute / 60;
    const awake = hours >= 7 && hours < 22;
    s.food = clamp(s.food - (awake ? .55 : .2), 0, 100);
    s.energy = clamp(s.energy + (awake ? -.35 : 1.3), 0, 100);
    if (s.food < 18) s.mood = clamp(s.mood - 1.4, 0, 100);
    if (s.energy < 15) s.mood = clamp(s.mood - .8, 0, 100);
  }

  /* ------------------------------------------------------------------ player */

  eatFromBag(good) {
    const s = this.state;
    if ((s.bag[good] || 0) <= 0) return {error: `You have no ${GOODS[good]?.label || good}.`};
    s.bag[good]--;
    const def = GOODS[good] || {food: .2};
    s.food = clamp(s.food + def.food * 110, 0, 100);
    s.mood = clamp(s.mood + (def.comfort || .05) * 90, 0, 100);
    this.notice(`You ate the ${def.label}. Food +${Math.round(def.food * 110)}.`);
    return {ok: true};
  }

  talk(person, intent = 'greet') {
    const line = this.minds.playerTalk(person, intent);
    this.save();
    return line;
  }

  nearestPersonTo(x, z) {
    let best = null, bd = Infinity;
    for (const p of this.citizens) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return {person: best, dist: bd};
  }

  /* possession: slip inside a villager's own nervous system */
  possess(id) {
    const p = this.citizens.find(x => x.id === id);
    if (!p) return null;
    this.possessing = id;
    this.minds.enter(id);
    this.notice(`You slip into ${p.name}'s head. ${CITIZENS[p.id].persona}`);
    return p;
  }

  unpossess() {
    if (this.possessing == null) return;
    const p = this.citizens.find(x => x.id === this.possessing);
    this.minds.exit();
    this.possessing = null;
    if (p) this.notice(`You leave ${p.name}'s head and take your own hands back.`);
  }

  takeWheel() { if (this.possessing != null) this.minds.takeWheel(this.possessing); }
  releaseWheel() { this.minds.releaseWheel(); }
  steer(x, z) { this.minds.steer(x, z); }

  /* --------------------------------------------------------------- town places */

  service(place) {
    const s = this.state;
    const cost = {bakery: 8, clinic: 24, school: 15, cafe: 6, market: 12, library: 0}[place.type];
    switch (place.type) {
      case 'bakery': return this.buy(cost, 'bread', 'Mira hands you a paper-wrapped loaf.');
      case 'market': return this.buy(cost, 'produce', 'June weighs produce into your hands.');
      case 'cafe': return this.buy(cost, 'cup', 'Leo pours, and asks nothing about your day.');
      case 'clinic': return this.buy(cost, 'remedy', 'Noah gives you a dose and a warning.');
      case 'library': {
        if ((s.bag.book || 0) > 0) return this.eatFromBag('book') && {ok: true};
        s.reputation += 2; s.mood = clamp(s.mood + 8, 0, 100);
        this.notice('You read in the library. Mood +8, reputation +2.');
        return {ok: true};
      }
      case 'school': {
        if (s.money < 15) return {error: 'A class costs $15.'};
        s.money -= 15; s.reputation += 4;
        s.bag.lesson = (s.bag.lesson || 0) + 1;
        this.notice('You sat Ada’s class. Lesson in your bag, reputation +4.');
        return {ok: true};
      }
      case 'farm': {
        if (s.energy < 12) return {error: 'You are too tired for the rows.'};
        s.energy = clamp(s.energy - 12, 0, 100); s.supplies = clamp(s.supplies + 2, 0, 99); s.reputation += 2;
        s.bag.produce = (s.bag.produce || 0) + 1;
        this.notice('You harvested with Ivy. Town stores +2, produce +1.');
        return {ok: true};
      }
      case 'workshop': {
        if ((s.bag.produce || 0) < 1) return {error: 'Finn needs raw produce to work with.'};
        if (s.energy < 10) return {error: 'The lathe needs both hands awake.'};
        s.bag.produce--; s.energy = clamp(s.energy - 10, 0, 100);
        s.bag.tool = (s.bag.tool || 0) + 1;
        this.notice('Finn teaches you one pass of the lathe. Tool +1.');
        return {ok: true};
      }
      case 'park': {
        s.mood = clamp(s.mood + 10, 0, 100);
        s.bag.flower = (s.bag.flower || 0) + 1;
        this.notice('You pick a flower by the pond. Mood +10.');
        return {ok: true};
      }
      default: return {ok: true};
    }
  }

  buy(cost, good, flavour) {
    const s = this.state;
    if (s.money < cost) return {error: `You need $${cost}. You have $${s.money}.`};
    s.money -= cost;
    s.bag[good] = (s.bag[good] || 0) + 1;
    this.notice(`${flavour} ${GOODS[good]?.label} +1 (−$${cost}).`);
    return {ok: true};
  }

  sell(good) {
    const s = this.state;
    if ((s.bag[good] || 0) <= 0) return {error: `You have no ${GOODS[good]?.label}.`};
    const value = Math.round(6 + (GOODS[good]?.food || 0) * 22 + (GOODS[good]?.knowledge || 0) * 16 + (GOODS[good]?.work || 0) * 12);
    s.bag[good]--; s.money += value; s.reputation += 1;
    this.notice(`June took your ${GOODS[good]?.label} for $${value}.`);
    return {ok: true};
  }

  work(place) {
    const s = this.state;
    const hours = s.minute / 60;
    if (s.energy < 15) return {error: 'You need at least 15 energy to work.'};
    if (hours < 8 || hours >= 18) return {error: 'Shifts run from 08:00 to 18:00.'};
    s.money += 18; s.energy = clamp(s.energy - 15, 0, 100); s.food = clamp(s.food - 5, 0, 100);
    s.reputation += 1; s.supplies = clamp(s.supplies + 1, 0, 99);
    s.shifts[place.name] = (s.shifts[place.name] || 0) + 1;
    this.notice(`You worked a shift at ${place.name}. Earned $18, town stores +1.`);
    return {ok: true};
  }

  volunteer() {
    const s = this.state;
    if (s.energy < 10) return {error: 'You need at least 10 energy.'};
    s.energy = clamp(s.energy - 10, 0, 100);
    s.trust = clamp(s.trust + 5, 0, 100);
    s.reputation += 3;
    for (const p of this.citizens) if (Math.hypot(p.x - this.playerPosition.x, p.z - this.playerPosition.z) < 14) {
      p.brain.reward(.9, 'the newcomer helped');
      p.drives.comfort = clamp(p.drives.comfort + .08, 0, 1);
      this.bumpFriend(p.name, 6);
    }
    this.notice('You helped the town with something unglamorous. Trust +5.');
    return {ok: true};
  }

  give(person, good) {
    const s = this.state;
    if ((s.bag[good] || 0) <= 0) return {error: `You have no ${GOODS[good]?.label}.`};
    s.bag[good]--;
    person.inventory[good] = (person.inventory[good] || 0) + 1;
    person.brain.reward(1.5, `the newcomer gave me ${GOODS[good]?.label}`);
    this.bumpFriend(person.name, 10);
    this.minds.remember(person, `The newcomer gave me ${GOODS[good]?.label}.`);
    this.notice(`You handed ${person.name} the ${GOODS[good]?.label}. Their dopamine cells fire for you.`);
    return {ok: true};
  }

  bumpFriend(name, delta) {
    this.state.friendships[name] = clamp((this.state.friendships[name] ?? 40) + delta, 0, 100);
  }

  /* ------------------------------------------------------------------- saving */

  save() {
    this.state.minds = this.minds.serialize();
    return saveState(this.state);
  }

  load() { this.state = loadState(fresh()); }

  get report() { return this.minds.townReport(); }
}

export {PLACES, CITIZENS, GOODS, CRAFTS};
