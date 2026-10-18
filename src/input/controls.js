import * as THREE from 'three';
import {PLACES} from '../data/town.js';

const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'];

export class Controls {
  constructor(app) {
    this.app = app;
    this.keys = new Set();
    this.pointer = null;
    this.dragging = null;
    this.touchMode = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.touchMove = {forward:0,side:0};
    const canvas = app.world.renderer.domElement;
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      this.pointer = {x: event.clientX, y: event.clientY};
      this.dragging = {x: event.clientX, y: event.clientY};
    });
    canvas.addEventListener('pointermove', event => {
      if (!this.dragging) return;
      const dx = event.clientX - this.dragging.x, dy = event.clientY - this.dragging.y;
      this.dragging = {x: event.clientX, y: event.clientY};
      if (app.game.possessing != null) app.world.lookAround(dx * 2.2, dy * 2.2);
    });
    canvas.addEventListener('pointercancel', () => { this.pointer = null; this.dragging = null; });
    canvas.addEventListener('pointerup', event => {
      const down = this.pointer;
      this.pointer = null;
      this.dragging = null;
      if (!app.active || !down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7) return;
      if (app.game.possessing != null) return;                 // inside a head, clicking does not teleport
      const hit = app.world.pick(event.clientX, event.clientY);
      if (!hit) return;
      const {kind, ref} = hit.object.userData;
      if (kind === 'ground') { app.world.moveTo(hit.point.x, hit.point.z); app.ui.close(); }
      else if (kind === 'citizen') app.ui.citizen(ref);
      else if (kind === 'place') app.ui.placePanel(ref);
    });
    addEventListener('keydown', event => {
      if (!app.active || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      const key = event.key.toLowerCase();
      if (MOVE_KEYS.includes(key)) { event.preventDefault(); this.keys.add(key); }
      if (key === 'e' && !event.repeat) this.interact();
      if (key === 'v' && !event.repeat) this.togglePossess();
      if (key === 'f' && !event.repeat) this.toggleWheel();
      if (key === 'r' && !event.repeat) this.teach('reward');
      if (key === 'c' && !event.repeat) this.teach('punish');
      if (key === 'escape') {
        if (app.game.possessing != null) { app.game.unpossess(); app.world.possess(null); app.ui.mind?.hide(); app.ui.close(); }
        else app.ui.close();
      }
    });
    addEventListener('keyup', event => this.keys.delete(event.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    this.makeTouchControls();
  }

  makeTouchControls() {
    this.touchControls=document.createElement('div');
    this.touchControls.id='sandbox-touch-controls';
    this.touchControls.hidden=true;
    this.touchControls.innerHTML='<div class="touch-stick" data-stick aria-label="Movement joystick"><div class="stick-base"><div class="stick-thumb"></div></div><small>MOVE</small></div><div class="touch-actions"><button data-touch="look" class="look-pad" aria-label="Drag to look">LOOK</button><div class="sandbox-touch-actions"><button data-touch="interact">TALK / SELECT</button><button data-touch="mind">ENTER / EXIT MIND</button><button data-touch="drive">DRIVE MOTOR LOOP</button><button data-touch="praise">PRAISE</button><button data-touch="condemn">CONDEMN</button></div></div>';
    document.getElementById('app').append(this.touchControls);
    this.touchControls.addEventListener('pointerdown',event=>{
      const stick=event.target.closest('[data-stick]');
      if(stick){event.preventDefault();this.touchStick={id:event.pointerId,element:stick};stick.setPointerCapture?.(event.pointerId);this.updateTouchStick(event);return;}
      const action=event.target.closest('[data-touch]')?.dataset.touch;
      if(action==='look'){this.touchLook={id:event.pointerId,x:event.clientX,y:event.clientY};event.target.setPointerCapture?.(event.pointerId);return;}
      if(action==='interact')this.interact();
      if(action==='mind')this.togglePossess();
      if(action==='drive')this.toggleWheel();
      if(action==='praise')this.teach('reward');
      if(action==='condemn')this.teach('punish');
    });
    this.touchControls.addEventListener('pointermove',event=>{
      if(this.touchStick?.id===event.pointerId)this.updateTouchStick(event);
      if(this.touchLook?.id!==event.pointerId)return;
      const dx=event.clientX-this.touchLook.x,dy=event.clientY-this.touchLook.y;
      this.touchLook.x=event.clientX;this.touchLook.y=event.clientY;this.rotateView(dx,dy);
    });
    const release=event=>{
      if(this.touchStick?.id===event.pointerId){this.touchStick.element.style.setProperty('--stick-x','0px');this.touchStick.element.style.setProperty('--stick-y','0px');this.touchStick=null;this.touchMove={forward:0,side:0};}
      if(this.touchLook?.id===event.pointerId)this.touchLook=null;
    };
    this.touchControls.addEventListener('pointerup',release);
    this.touchControls.addEventListener('pointercancel',release);
    this.touchControls.addEventListener('lostpointercapture',release);
  }

  setTouchControlsVisible(visible) {
    if(this.touchControls)this.touchControls.hidden=!this.touchMode||!visible;
  }

  updateTouchStick(event) {
    const stick=this.touchStick?.element;if(!stick)return;
    const rect=stick.querySelector('.stick-base').getBoundingClientRect(),radius=Math.max(24,rect.width*.34);
    const dx=event.clientX-(rect.left+rect.width/2),dy=event.clientY-(rect.top+rect.height/2),distance=Math.hypot(dx,dy),scale=distance>radius?radius/distance:1,x=dx*scale,y=dy*scale;
    stick.style.setProperty('--stick-x',x+'px');stick.style.setProperty('--stick-y',y+'px');this.touchMove={side:x/radius,forward:-y/radius};
  }

  rotateView(dx,dy) {
    const {world,game}=this.app;
    if(game.possessing!=null){world.lookAround(dx,dy);return;}
    const target=world.controls.target,offset=world.camera.position.clone().sub(target),spherical=new THREE.Spherical().setFromVector3(offset);
    spherical.theta-=dx*.006;spherical.phi=THREE.MathUtils.clamp(spherical.phi+dy*.006,.12,world.controls.maxPolarAngle||Math.PI*.48);
    world.camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(target));world.controls.update();
  }

  get vector() {
    let forward = Number(this.keys.has('w') || this.keys.has('arrowup')) - Number(this.keys.has('s') || this.keys.has('arrowdown')) + this.touchMove.forward;
    let side = Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft')) + this.touchMove.side;
    const magnitude=Math.hypot(forward,side);if(magnitude>1){forward/=magnitude;side/=magnitude;}
    return {forward, side};
  }

  update() {
    const {forward, side} = this.vector;
    if (!forward && !side) return;
    const {world, game} = this.app;
    if (game.possessing != null && game.minds.wheel) {
      /* the player's keys push on the villager's own command cells, using the direction
         the camera is actually pointing: in this scene forward is (-sin yaw, -cos yaw) */
      const yaw = world.camera.rotation.y;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = -fz, rz = fx;
      const norm = Math.hypot(forward, side);
      game.steer((fx * forward + rx * side) / norm, (fz * forward + rz * side) / norm);
      return;
    }
    if (game.possessing != null) return;                        // watching, not driving
    let fx = world.controls.target.x - world.camera.position.x;
    let fz = world.controls.target.z - world.camera.position.z;
    const length = Math.hypot(fx, fz) || 1;
    fx /= length; fz /= length;
    const norm = Math.hypot(forward, side);
    world.moveTo(world.player.position.x + (fx * forward - fz * side) * 1.6 / norm,
      world.player.position.z + (fz * forward + fx * side) * 1.6 / norm);
  }

  nearest() {
    const {game, world} = this.app;
    const from = game.possessing != null ? {x: game.citizens.find(c => c.id === game.possessing).x, z: game.citizens.find(c => c.id === game.possessing).z} : world.player.position;
    const people = game.citizens.map(c => ({kind: 'citizen', ref: c, x: c.x, z: c.z}));
    const places = PLACES.map(p => ({kind: 'place', ref: p, x: p.x, z: p.z + p.d / 2}));
    const candidates = people.concat(places);
    candidates.sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
    return candidates[0];
  }

  interact() {
    const {ui, game} = this.app;
    if (game.possessing != null) { ui.mind?.update(); return; }
    const nearest = this.nearest();
    if (!nearest || Math.hypot(nearest.x - this.app.world.player.position.x, nearest.z - this.app.world.player.position.z) > 9) {
      ui.toast('Move closer to a citizen or a building.');
      return;
    }
    nearest.kind === 'citizen' ? ui.citizen(nearest.ref) : ui.placePanel(nearest.ref);
  }

  togglePossess() {
    const {game, world, ui} = this.app;
    if (game.possessing != null) {
      game.unpossess();
      world.possess(null);
      ui.mind?.hide();
      ui.toast('You are yourself again.');
      return;
    }
    const nearest = this.nearest();
    if (!nearest || nearest.kind !== 'citizen') { ui.toast('Stand next to somebody first (V parasises them).'); return; }
    game.possess(nearest.ref.id);
    world.possess(nearest.ref);
    ui.mind?.update();
    ui.toast(`You are inside ${nearest.ref.name}. Keys now nudge their body, not you.`);
  }

  toggleWheel() {
    const {game, ui} = this.app;
    if (game.possessing == null) { ui.toast('Enter a mind first (V).'); return; }
    if (game.minds.wheel) { game.releaseWheel(); ui.toast('You release their motor loop.'); }
    else { game.takeWheel(); ui.toast('You push on their command cells. WASD now steers them.'); }
    ui.mind?.update();
  }

  teach(kind) {
    const {game, ui} = this.app;
    if (game.possessing == null) { ui.toast('Enter a mind (V) to praise or condemn from inside.'); return; }
    const person = game.citizens.find(c => c.id === game.possessing);
    ui.toast(game.talk(person, kind));
    ui.mind?.update();
  }
}
