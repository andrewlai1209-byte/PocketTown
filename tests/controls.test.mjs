import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Controls} from '../src/input/controls.js';

function controls(){
  const instance=Object.create(Controls.prototype);
  instance.keys=new Set();
  instance.touchMove={forward:0,side:0};
  return instance;
}

test('touch joystick preserves analog speed and clamps diagonal movement',()=>{
  const input=controls();input.touchMove={forward:.35,side:.2};
  assert.deepEqual(input.vector,{forward:.35,side:.2});
  input.touchMove={forward:1,side:1};
  assert.ok(Math.abs(Math.hypot(input.vector.forward,input.vector.side)-1)<1e-9);
});

test('keyboard movement combines safely with joystick movement',()=>{
  const input=controls();input.keys.add('w');input.touchMove={forward:.4,side:.8};
  const result=input.vector;
  assert.ok(result.forward>0&&result.side>0);
  assert.ok(Math.hypot(result.forward,result.side)<=1);
});

test('independent touch look rotates the sandbox orbit camera and resident viewpoint',()=>{
  const input=controls(),camera={position:new THREE.Vector3(0,4,10)},target=new THREE.Vector3(),controlsApi={target,maxPolarAngle:Math.PI*.48,update(){this.updated=true;}},world={camera,controls:controlsApi,lookAround(dx,dy){this.lastLook=[dx,dy];}},game={possessing:null};
  input.app={world,game};input.rotateView(30,12);
  assert.equal(controlsApi.updated,true);
  assert.notDeepEqual(camera.position,new THREE.Vector3(0,4,10));
  game.possessing='Mira';input.rotateView(4,-3);
  assert.deepEqual(world.lastLook,[4,-3]);
});
