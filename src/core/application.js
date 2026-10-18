import {Story} from '../story/story.js';
import {ABOUT_PANEL} from '../ui/about.js';
import {readStory,importStory} from '../story/state.js';
import {Game} from '../sim/game.js';
import {World} from '../world/scene.js';
import {UI} from '../ui/ui.js';
import {MindPanel} from '../ui/mind.js';
import {Controls} from '../input/controls.js';

/**
 * The application loop, on purpose driven by two clocks.
 *
 * requestAnimationFrame is the right way to paint, and it is the wrong way to keep a town
 * alive: an embedded preview, a background tab, or a window that is occluded reports itself
 * as hidden and then never hands back a frame — and a simulation that only advances when it
 * is being looked at looks exactly like a town whose people refuse to move. So a timer owns
 * the simulation, and both drivers share one wall-clock cursor (`lastAdvance`), which means
 * whichever one wakes first consumes the elapsed time and the other sees none: the town can
 * never run twice as fast, and it can never stop because one of them is asleep.
 */
export class Application {
  constructor() {
    this.game = new Game();
    this.world = new World(document.getElementById('scene'), this.game);
    this.ui = new UI(this.game, this.world);
    this.mind = new MindPanel(this);
    this.ui.mind = this.mind;
    this.input = new Controls(this);
    this.active = false;
    this.story = new Story(this);
    const now = performance.now();
    this.lastFrame = now;                 // last paint
    this.lastAdvance = now;               // last time the town was advanced, by either driver
    this.hudElapsed = 0;
    this.mindElapsed = 0;
    this.saveElapsed = 0;
    this.showHome = () => {this.active=false;this.input.setTouchControlsVisible(false);document.getElementById('start').style.display='block';document.getElementById('continue-story').disabled=!readStory();this.ui.close();};
    document.getElementById('landing-about').innerHTML=ABOUT_PANEL;
    document.getElementById('play').onclick=()=>{document.getElementById('start').style.display='none';this.active=true;this.input.setTouchControlsVisible(true);this.lastAdvance=performance.now();};
    document.getElementById('new-story').onclick=()=>{if(readStory())document.getElementById('replace-story').hidden=false;else this.story.start(false);};
    document.getElementById('confirm-new').onclick=()=>{document.getElementById('replace-story').hidden=true;this.story.start(false);};
    document.getElementById('cancel-new').onclick=()=>document.getElementById('replace-story').hidden=true;
    document.getElementById('continue-story').onclick=()=>this.story.start(true);
    document.getElementById('home').onclick=()=>{this.game.save();this.showHome();};
    document.getElementById('about').onclick=()=>{this.game.save();this.showHome();document.getElementById('landing-about').scrollIntoView();};
    document.getElementById('import-story').onclick=()=>document.getElementById('save-file').click();
    document.getElementById('save-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1000000)throw new Error('This save file is too large.');const text=await file.text();JSON.parse(text);this.pendingImport=text;document.getElementById('import-confirm').hidden=false;}catch(error){document.getElementById('save-message').textContent=error.message;}e.target.value='';};
    document.getElementById('confirm-import').onclick=()=>{try{importStory(this.pendingImport);document.getElementById('import-confirm').hidden=true;this.showHome();document.getElementById('save-message').textContent='Story imported. Choose Continue story.';}catch(error){document.getElementById('save-message').textContent=error.message;}};
    document.getElementById('cancel-import').onclick=()=>document.getElementById('import-confirm').hidden=true;
    this.showHome();addEventListener('pagehide',()=>this.story.save());
    addEventListener('pagehide', () => {if(!this.story.running)this.game.save();});
    document.addEventListener('visibilitychange', () => {
      const t = performance.now();
      this.lastFrame = t;
      this.lastAdvance = t;               // returning to the page must not fast-forward a day
      if (document.hidden) {this.story.save();if(!this.story.running)this.game.save();}
    });
    this.frame = this.frame.bind(this);
    this.pump = this.pump.bind(this);
    globalThis.pocketTown = this;                 // inspection hook for tests and debugging
  }

  start() {
    document.documentElement.dataset.ready = 'true';
    requestAnimationFrame(this.frame);
    setInterval(this.pump, 50);
  }

  /** Advance the town by real elapsed milliseconds, in bounded steps so the nervous systems
      never receive a time slice big enough to make them integrate past their own dynamics.
      The catch-up is deliberately capped at 150 ms per wake: a page that is already struggling
      should run its town a little slower than the clock, not spend every remaining frame
      trying to get even and end up motionless. */
  advance(dt) {
    if (!this.active || this.game.state.paused || dt <= 0) return;
    let left = Math.min(150, dt);
    while (left > 0) {
      const slice = Math.min(50, left);
      left -= slice;
      this.game.tick(slice);
    }
  }

  pump() {
    const now = performance.now();
    const dt = now - this.lastAdvance;
    this.lastAdvance = now;
    if (dt > 0) this.advance(dt);
    /* paint from the timer too, but only when the frame loop has gone quiet — an embedded
       or occluded page may never get a frame, and a town nobody redraws is a frozen town.
       Four paints a second is enough to read a walk, and cheap enough to leave the town's
       own time step alone. */
    if (now - this.lastFrame > 240) {
      this.lastFrame = now;
      this.render(Math.min(240, dt));
    }
  }

  frame(now) {
    const dt = now - this.lastAdvance;
    this.lastAdvance = now;
    if (dt > 0) this.advance(dt);
    this.lastFrame = now;
    this.render(Math.min(50, dt));
    requestAnimationFrame(this.frame);
  }

  render(dt) {
    if(this.story.running){this.story.update(dt);return;}
    if (this.active) this.input.update();
    /* nothing to draw into while the host reports an empty box */
    const surface = this.world.container;
    if (surface.clientWidth > 0 && surface.clientHeight > 0) this.world.update(this.game.state.paused ? 0 : dt);
    this.hudElapsed += dt;
    this.mindElapsed += dt;
    this.saveElapsed += dt;
    if (this.hudElapsed >= 250) {
      this.ui.stats();
      this.hudElapsed = 0;
    }
    if (this.game.possessing != null && this.mindElapsed >= 160) {
      this.mind.update();
      this.mindElapsed = 0;
    }
    if (this.active && this.saveElapsed >= 15000) {
      this.game.save();
      this.saveElapsed = 0;
    }
  }
}
