import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PLACES} from '../data/town.js';
import {apparelFor,fabricMaterial,residentModelUrl,surfaceMaterial,textureResidentModel} from './apparel.js';
import {addCurtainedWindow,addPebbleWalls,addTiledRoof,addTimberDoor,animateCurtains} from './buildings.js';
import {addGrassField,addTree} from './foliage.js';

const mat = (color, roughness = 1) => new THREE.MeshStandardMaterial({color, roughness});
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 12, 8),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 4),
};

function surfaceTexture(kind) {
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
  let seed=kind==='grass'?4871:kind==='stone'?1984:2947;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  if(kind==='stone'){
    g.fillStyle='#d1cab8';g.fillRect(0,0,256,256);
    for(let y=0;y<256;y+=32)for(let x=0;x<256;x+=48){const j=(rand()-.5)*14;g.fillStyle='rgb('+(196+j)+','+(186+j)+','+(165+j)+')';g.beginPath();g.roundRect(x+2+(y/32%2)*22,y+2,43,25,5);g.fill();g.strokeStyle='#a99f8a';g.lineWidth=2;g.stroke();}
    for(let i=0;i<700;i++){g.fillStyle='rgba(72,68,55,'+(rand()*.1)+')';g.fillRect(rand()*256,rand()*256,2+rand()*4,1+rand()*2);}
  }else{
    const base=kind==='grass'?[132,145,112]:kind==='roof'?[145,106,93]:[218,207,180];g.fillStyle='rgb('+base.join(',')+')';g.fillRect(0,0,256,256);
    if(kind==='grass'){
      // Low-contrast sage flecks keep the ground calm beneath the brighter individual blades.
      for(let i=0;i<1500;i++){const shade=rand()>.52?'rgba(226,218,177,':'rgba(72,99,68,';g.fillStyle=shade+(.025+rand()*.065)+')';const x=rand()*256,y=rand()*256;g.fillRect(x,y,1+rand()*3,1+rand()*2);}
    }else for(let i=0;i<2400;i++){const a=.025+rand()*.12;g.fillStyle='rgba('+(rand()>.5?255:35)+','+(rand()>.5?255:40)+','+(rand()>.5?240:30)+','+a+')';const x=rand()*256,y=rand()*256;g.fillRect(x,y,1+rand()*5,1+rand()*3);}
    if(kind==='roof')for(let y=0;y<256;y+=24){g.strokeStyle='rgba(71,48,43,.22)';g.lineWidth=2;g.beginPath();g.moveTo(0,y);g.lineTo(256,y);g.stroke();for(let x=(y/24%2)*22;x<256;x+=44){g.beginPath();g.moveTo(x,y);g.lineTo(x,y+24);g.stroke();}}
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);return t;
}
const WALL_MAP=surfaceTexture('wall'),ROOF_MAP=surfaceTexture('roof'),GRASS_MAP=surfaceTexture('grass'),STONE_MAP=surfaceTexture('stone');

const ITEM_GLYPH = {bread: '🍞', produce: '🥬', remedy: '🧴', tool: '🔧', cup: '☕', letter: '✉️', flower: '🌼', book: '📖', lesson: '✏️'};
function mesh(geo, color, parent, x, y, z, sx = 1, sy = 1, sz = 1) {
  const o = new THREE.Mesh(geo, typeof color === 'number' ? mat(color) : color);
  o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; o.receiveShadow = true;
  parent.add(o); return o;
}
function box(parent, color, x, y, z, w, h, d) { return mesh(G.box, color, parent, x, y, z, w, h, d); }

function radialGlowTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
  const gradient=ctx.createRadialGradient(64,64,2,64,64,62);gradient.addColorStop(0,'rgba(255,235,177,.72)');gradient.addColorStop(.28,'rgba(255,218,145,.36)');gradient.addColorStop(.68,'rgba(255,195,112,.10)');gradient.addColorStop(1,'rgba(255,181,96,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

function textSprite(text, {bg = '#ffffffee', fg = '#254352', size = 54, w = 512, h = 128, scale = [5.7, 1.42]} = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.beginPath(); g.roundRect(4, 10, w - 8, h - 20, 28); g.fill();
  g.strokeStyle = '#a7c9c1'; g.lineWidth = 5; g.stroke();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${size}px system-ui`;
  const words = String(text).split(' ');
  let line = '', lines = [];
  for (const word of words) {
    if (g.measureText(line + ' ' + word).width > w - 60 && line) { lines.push(line); line = word; }
    else line = line ? line + ' ' + word : word;
  }
  lines.push(line);
  lines = lines.slice(0, 3);
  const start = h / 2 - (lines.length - 1) * size * .58;
  lines.forEach((l, i) => g.fillText(l, w / 2, start + i * size * 1.16));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: t, depthTest: false, transparent: true}));
  sprite.scale.set(scale[0], scale[1], 1);
  return sprite;
}

function label(text, color = '#254352', size = 64, options = {}) {
  return textSprite(text || ' ', {bg: '#ffffffed', fg: color, size, ...options});
}

function personBody(citizen) {
  const person=typeof citizen==='object'?citizen:{name:'Mira',color:citizen},a=apparelFor(person.name),g=new THREE.Group();
  const skin=surfaceMaterial('Skin',a.skin,'skin',.72),hair=surfaceMaterial('Hair',a.hair,'hair',.84),coat=fabricMaterial('Coat',a.coat,a.pattern),shirt=fabricMaterial('Shirt',a.shirt,a.pattern),pants=fabricMaterial('Pants',a.pants,a.pattern),apron=fabricMaterial('Apron',a.apron,a.pattern),shoe=surfaceMaterial('Shoe',a.shoe,'leather',.78),trim=mat(a.trim,.68),fold=mat(new THREE.Color(a.coat).multiplyScalar(.68));
  const part=(name,geometry,material,x,y,z,sx=1,sy=1,sz=1)=>{const o=mesh(geometry,material,g,x,y,z,sx,sy,sz);o.name=name;return o;};
  const ball=(name,material,x,y,z,sx,sy,sz)=>part(name,G.sphere,material,x,y,z,sx,sy,sz);
  const line=(name,material,points,r=.012)=>{const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),m=part(name,new THREE.TubeGeometry(path,12,r,5,false),material,0,0,0);return m;};
  const torso=ball('Coat torso',coat,0,1.43,0,.37,.48,.25);
  ball('Shoulder structure',coat,0,1.72,0,.43,.19,.24);
  ball('Shirt collar',shirt,0,1.83,.035,.19,.12,.2);
  part('Coat front',new THREE.BoxGeometry(.48,.55,.045),coat,0,1.43,.233);
  line('Left lapel',trim,[[-.24,1.78,.26],[-.11,1.66,.29],[-.05,1.48,.29]],.018);
  line('Right lapel',shirt,[[.24,1.78,.26],[.1,1.66,.29],[.04,1.48,.29]],.018);
  for(let i=0;i<4;i++)ball('Button '+i,trim,.045,1.64-i*.13,.28,.022,.022,.012);
  // Cloth darts and elbow seams catch the key light, while leaving broad fabric surfaces readable.
  for(const side of [-1,1]){
    for(let i=0;i<3;i++)line('Jacket waist fold '+side+' '+i,fold,[[side*.19,1.2+i*.05,.2],[side*.27,1.22+i*.045,.244],[side*.34,1.24+i*.035,.2]],.009);
    const upper=part('Sleeve upper '+side,new THREE.CapsuleGeometry(.115,.31,6,12),coat,side*.43,1.48,0);upper.rotation.z=side*-.13;
    ball('Elbow '+side,coat,side*.46,1.23,0,.12,.13,.13);
    const lower=part('Sleeve lower '+side,new THREE.CapsuleGeometry(.095,.25,6,12),coat,side*.48,1.05,.02);lower.rotation.z=side*-.08;
    part('Cuff '+side,new THREE.CylinderGeometry(.11,.095,.075,16),trim,side*.48,.89,.02);
    ball('Hand '+side,skin,side*.48,.77,.04,.083,.12,.07);
    for(let f=0;f<4;f++)ball('Finger '+side+' '+f,skin,side*.48+(f-1.5)*.036,.69,.05,.02,.067,.023);
    ball('Thumb '+side,skin,side*.58,.75,.08,.03,.07,.03);
    for(let i=0;i<3;i++)line('Sleeve crease '+side+' '+i,fold,[[side*.38,1.27+i*.025,.105],[side*.46,1.26+i*.02,.13],[side*.53,1.28-i*.02,.1]],.007);
    part('Trouser thigh '+side,new THREE.CapsuleGeometry(.14,.36,6,12),pants,side*.16,.72,0);
    ball('Kneecap '+side,pants,side*.16,.48,.012,.145,.13,.15);
    part('Trouser calf '+side,new THREE.CapsuleGeometry(.11,.34,6,12),pants,side*.16,.3,0);
    for(let i=0;i<3;i++)line('Knee fold '+side+' '+i,fold,[[side*.23,.46+i*.035,.105],[side*.16,.48+i*.027,.145],[side*.09,.5+i*.02,.11]],.007);
    part('Boot sole '+side,new THREE.BoxGeometry(.28,.07,.45),shoe,side*.16,.065,.08);
    ball('Boot toe '+side,shoe,side*.16,.15,.12,.14,.11,.21);
    part('Boot shaft '+side,new THREE.CylinderGeometry(.11,.135,.22,16),shoe,side*.16,.255,-.05);
    for(let i=0;i<4;i++){
      const y=.18+i*.035,z=.15-i*.035;
      ball('Eyelet '+side+' '+i,trim,side*.16-.052,y,z,.012,.012,.009);ball('Eyelet '+side+' '+i+'b',trim,side*.16+.052,y,z,.012,.012,.009);
      line('Shoe lace '+side+' '+i,shirt,[[side*.16-.05,y,z+.01],[side*.16,y+.012,z+.02],[side*.16+.05,y+.035,z+.01]],.008);
    }
  }
  ball('Waist',shirt,0,1.03,0,.31,.12,.24);
  part('Trouser belt',new THREE.CylinderGeometry(.32,.32,.075,24),shoe,0,1.06,0);
  part('Apron front',new THREE.BoxGeometry(.38,.52,.035),apron,0,1.29,.292);
  part('Apron pocket',new THREE.BoxGeometry(.19,.14,.025),trim,.08,1.26,.321);
  line('Apron hem',trim,[[-.17,1.02,.319],[0,1.01,.325],[.17,1.02,.319]],.008);
  for(let i=0;i<4;i++)line('Apron fold '+i,fold,[[-.13+i*.065,1.07,.316],[-.12+i*.065,1.25,.318],[-.1+i*.065,1.45,.306]],.007);
  line('Apron strap L',apron,[[-.17,1.51,.28],[-.19,1.73,.2],[-.1,1.79,.13]],.027);
  line('Apron strap R',apron,[[.17,1.51,.28],[.19,1.73,.2],[.1,1.79,.13]],.027);
  // Proportioned neck, jaw, ears, layered hair and brows.
  part('Neck',new THREE.CylinderGeometry(.09,.115,.2,18),skin,0,1.91,.01);
  ball('Face',skin,0,2.18,.015,.315,.395,.285);ball('Jaw',skin,0,2.03,.07,.24,.17,.23);
  ball('Hair cap',hair,0,2.49,-.02,.33,.17,.3);
  for(let side of [-1,1]){
    ball('Side hair '+side,hair,side*.28,2.31,-.055,.095,.22,.23);
    ball('Ear '+side,skin,side*.315,2.15,.01,.065,.1,.06);
    ball('Eye socket '+side,fold,side*.12,2.2,.255,.07,.05,.028);
    ball('Eye white '+side,mat(0xfff4e7,.28),side*.12,2.205,.279,.05,.036,.022);
    ball('Iris '+side,mat(0x493b31,.28),side*.12,2.204,.299,.025,.028,.013);
    ball('Pupil '+side,mat(0x211c19,.22),side*.12,2.204,.309,.012,.018,.009);
    line('Eyebrow '+side,hair,[[side*.19,2.28,.27],[side*.12,2.295,.29],[side*.055,2.28,.275]],.012);
    ball('Cheek '+side,mat(new THREE.Color(a.skin).multiplyScalar(1.07),.88),side*.17,2.09,.25,.055,.03,.012);
  }
  ball('Nose',skin,0,2.13,.3,.045,.08,.05);
  line('Mouth',fold,[[-.07,2.025,.285],[-.035,2.03,.3],[0,2.024,.303],[.035,2.03,.3],[.07,2.025,.285]],.008);
  for(let i=0;i<5;i++)ball('Hair curl '+i,hair,-.2+i*.1,2.54,.04,.09,.08,.12);
  // Role silhouettes in fallback rendering; the exported GLB adds full fine details for each one.
  const style=a.accessory;
  if(style==='straw-hat'){part('Hat brim',new THREE.CylinderGeometry(.4,.4,.05,24),trim,0,2.57,0);part('Hat crown',new THREE.CylinderGeometry(.24,.28,.15,20),trim,0,2.65,0);}
  if(style==='mail-cap'){ball('Mail cap',coat,0,2.59,-.01,.31,.1,.26);part('Cap bill',new THREE.BoxGeometry(.42,.04,.22),coat,0,2.54,.17);}
  if(style==='headwrap'){ball('Baker head wrap',trim,0,2.53,-.04,.33,.09,.27);}
  if(style==='backpack'){part('Backpack',new THREE.BoxGeometry(.4,.48,.2),apron,0,1.35,-.27);}
  if(style==='mayor-sash')line('Civic sash',trim,[[-.29,1.76,.21],[-.12,1.52,.28],[.12,1.25,.26]],.035);
  if(style==='scarf')line('Scarf tail',trim,[[.18,1.77,.18],[.22,1.5,.24],[.18,1.26,.28]],.055);
  if(style==='stethoscope'){line('Stethoscope',trim,[[-.1,1.82,.24],[-.18,1.58,.25],[-.13,1.35,.3],[0,1.29,.31],[.13,1.35,.3],[.18,1.58,.25]],.014);}
  if(style==='glasses')for(let side of [-1,1]){const glass=part('Eyeglass rim '+side,new THREE.TorusGeometry(.065,.009,7,18),trim,side*.12,2.2,.306);glass.rotation.z=0;}
  g.userData.torso=torso;g.userData.profile=person.name;return g;
}

function house(parent, x, z, i, curtains) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  const colors=[0xdcc5ae,0xe2d3b8,0xd4cabc],roofs=[0xa78280,0x879eac,0x9d8f83],wall=colors[i%colors.length],width=5,depth=4.6,height=3.6;
  const facade=box(g,wall,0,height/2,0,width,height,depth);
  facade.material=new THREE.MeshStandardMaterial({color:new THREE.Color(wall).multiplyScalar(.78),map:WALL_MAP,roughness:.97});
  const frontOpenings=[{x:0,y:.95,width:1.05,height:1.95},{x:-1.4,y:2.25,width:.92,height:1.02},{x:1.4,y:2.25,width:.92,height:1.02}];
  const sideOpening=[{x:0,y:2.2,width:.85,height:.98}];
  addPebbleWalls(g,{width,height,depth,color:wall,seed:140+i*29,openings:{front:frontOpenings,right:sideOpening,left:sideOpening}});
  addTiledRoof(g,{width,depth,eaveY:height-.02,rise:1.95,color:roofs[i%roofs.length],seed:220+i*41});
  addTimberDoor(g,{x:0,y:.98,z:depth/2+.105,width:1.04,height:1.92});
  for(const side of [-1,1])addCurtainedWindow(g,{x:side*1.4,y:2.25,z:depth/2+.09,width:.92,height:1.02,yaw:0,seed:i*5+side+8},curtains);
  addCurtainedWindow(g,{x:width/2+.09,y:2.2,z:0,width:.85,height:.98,yaw:Math.PI/2,seed:i+31},curtains);
  addCurtainedWindow(g,{x:-width/2-.09,y:2.2,z:0,width:.85,height:.98,yaw:-Math.PI/2,seed:i+47},curtains);
  return g;
}

const SKY = {
  dawn: new THREE.Color(0xf4c9a1), day: new THREE.Color(0xb9dce2),
  dusk: new THREE.Color(0xe3a37b), night: new THREE.Color(0x2c3f5a),
};

export class World {
  constructor(container, game) {
    this.game = game;
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = SKY.day.clone();
    this.scene.fog = new THREE.Fog(SKY.day.clone(), 85, 150);
    this.camera = new THREE.PerspectiveCamera(52, 1, .1, 320);
    this.camera.position.set(48, 45, 54);
    this.renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'});
    this.touchDevice=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.touchDevice?1.45:2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 2);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * .48;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 110;
    this.controls.update();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pickables = [];
    this.bodies = [];
    this.bubbles = [];
    this.icons = [];
    this.possessing = null;
    this.look = {yaw: 0, pitch: 0};
    this.destination = null;
    this.time = 0;
    this.curtains=[];
    this.streetLights=[];
    this.build();
    this.modelTemplates=new Map();
    this.modelReady=this.loadResidentModels();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const p = this.renderer.domElement.parentElement;
    const w = p.clientWidth, h = p.clientHeight;
    /* an embedded preview can report an empty box while it is being laid out; feeding a zero
       or NaN aspect into the projection matrix would blank the whole scene */
    if (!(w > 0 && h > 0)) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  build() {
    this.ambient = new THREE.HemisphereLight(0xf5fbff, 0x739d7c, 1.45);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff2d2, 3);
    this.sun.position.set(-25, 50, -18);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.touchDevice?1024:2048,this.touchDevice?1024:2048);
    Object.assign(this.sun.shadow.camera, {left: -43, right: 43, top: 43, bottom: -43});
    this.sun.shadow.normalBias = .018;
    this.sun.shadow.bias = -.00008;
    this.sun.shadow.radius = this.touchDevice?2:3;
    this.scene.add(this.sun);

    const ground = box(this.scene, 0x9fc691, 0, -.55, 0, 75, 1, 75);
    ground.material = new THREE.MeshStandardMaterial({color:0xc3c7aa,map:GRASS_MAP,roughness:1});
    ground.userData = {kind: 'ground'};
    this.pickables.push(ground);
    for (let i = -3; i <= 3; i++) {
      const a = i * 8;
      box(this.scene, 0xc8d1cf, a, .03, 0, 2, .08, 72).material = new THREE.MeshStandardMaterial({color:0xd4d0c2,map:STONE_MAP,roughness:.95});
      box(this.scene, 0xc8d1cf, 0, .035, a, 72, .08, 2).material = new THREE.MeshStandardMaterial({color:0xd4d0c2,map:STONE_MAP,roughness:.95});
    }
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      const a = i * 8, b = j * 8;
      box(this.scene, 0xf5f0de, a, .085, b, 1, .012, .18);
      box(this.scene, 0xf5f0de, a, .085, b, .18, .012, 1);
    }
    const park = box(this.scene, 0x86c995, 1, .03, 9, 14, .08, 11);
    park.userData = {kind: 'ground'};
    this.pickables.push(park);
    mesh(G.cylinder, 0x8bc8d8, this.scene, 1, .15, 9, 2.4, .12, 1.8);
    for (let i = 0; i < 7; i++) addTree(this.scene, Math.cos(i * Math.PI * 2 / 7) * 6 + 1, Math.sin(i * Math.PI * 2 / 7) * 4 + 9, .8, 900+i*37);

    const glowMap=radialGlowTexture();
    for (const [x,z] of [[-9,-9],[9,-9],[-9,9],[9,9],[0,-25],[0,27]]) {
      const pole=new THREE.Group();pole.position.set(x,0,z);this.scene.add(pole);
      mesh(G.cylinder,mat(0x435b50),pole,0,2.4,0,.09,2.4,.09);
      mesh(G.cylinder,mat(0x536d60),pole,0,3.65,0,.38,.16,.38);
      const lamp=mesh(G.sphere,new THREE.MeshStandardMaterial({color:0xffe6b2,emissive:0xf0ad58,emissiveIntensity:.45}),pole,0,3.65,0,.22,.25,.22);
      const glow=new THREE.PointLight(0xffd49a,0,18,1.65);glow.position.set(0,3.6,0);pole.add(glow);
      const pool=new THREE.Mesh(new THREE.PlaneGeometry(9.5,9.5),new THREE.MeshBasicMaterial({map:glowMap,color:0xffd29a,transparent:true,opacity:0,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));
      pool.rotation.x=-Math.PI/2;pool.position.set(x,.018,z);pool.renderOrder=1;this.scene.add(pool);
      this.streetLights.push({glow,pool,lamp});
    }
    const homes = [[-28, -26], [-19, -26], [19, -26], [28, -26], [-28, 0], [28, 0], [-28, 29], [-19, 29], [19, 29], [28, 29]];
    homes.forEach(([x, z], i) => house(this.scene, x, z, i,this.curtains));
    for (let i = 0; i < 60; i++) {
      const x = Math.sin(i * 74.3) * 35, z = Math.cos(i * 17.7) * 35;
      if (Math.abs(x) < 31 && Math.abs(z) < 32) continue;
      addTree(this.scene, x, z, .7 + (i % 4) * .11, 1300+i*53);
    }

    for (const p of PLACES) {
      const group = new THREE.Group();
      group.position.set(p.x, 0, p.z);
      this.scene.add(group);
      if (p.type === 'park') {
        const sign = label(p.name); sign.position.set(0, 4.2, 0); group.add(sign);
        sign.userData = {kind: 'place', ref: p};
        this.pickables.push(sign);
        continue;
      }
      const facade=box(group, p.color, 0, p.h / 2, 0, p.w, p.h, p.d);
      facade.material = new THREE.MeshStandardMaterial({color:new THREE.Color(p.color).multiplyScalar(.78),map:WALL_MAP,roughness:.97});
      const frontOpenings=[{x:0,y:1.25,width:1.8,height:2.62},...[-1,1].map(side=>({x:side*p.w*.28,y:p.h*.54,width:1.52,height:1.72}))];
      const sideOpenings=[{x:0,y:p.h*.55,width:1.38,height:1.58}];
      addPebbleWalls(group,{width:p.w,height:p.h,depth:p.d,color:p.color,seed:p.x*211+p.z*37+302,openings:{front:frontOpenings,left:sideOpenings,right:sideOpenings}});
      addTiledRoof(group,{width:p.w,depth:p.d,eaveY:p.h-.02,rise:Math.max(1.8,Math.min(3,p.h*.34)),color:p.roof,seed:p.x*73+p.z*19+401});
      addTimberDoor(group,{x:0,y:1.25,z:p.d/2+.115,width:1.8,height:2.62});
      for (const side of [-1, 1]) addCurtainedWindow(group,{x:side*p.w*.28,y:p.h*.54,z:p.d/2+.09,width:1.52,height:1.72,seed:Math.round(p.x+side*13+p.z*3),yaw:0},this.curtains);
      addCurtainedWindow(group,{x:p.w/2+.09,y:p.h*.55,z:0,width:1.38,height:1.58,yaw:Math.PI/2,seed:p.x+41+p.z},this.curtains);
      addCurtainedWindow(group,{x:-p.w/2-.09,y:p.h*.55,z:0,width:1.38,height:1.58,yaw:-Math.PI/2,seed:p.x-57+p.z},this.curtains);
      // Timber corner posts and a carved lintel make the public facades readable at street level.
      for (const side of [-1, 1]) {
        box(group, 0xf0dfc1, side * (p.w / 2 - .2), p.h / 2, p.d / 2 + .16, .22, p.h, .19);
        box(group, 0xf4dfbf, side * p.w * .28, p.h * .54, p.d / 2 + .21, 1.48, .09, .08);
      }
      box(group, 0x765d46, 0, .18, p.d / 2 + .2, 1.85, .18, .16);
      for (let i = -2; i <= 2; i++) {
        const pebble = mesh(G.sphere, mat(i % 2 ? 0xb7a98b : 0xd0c2a4), group, i * .34, .11, p.d / 2 + .72 + Math.abs(i%2)*.14, .28, .045, .18);
        pebble.castShadow = false;
      }
      const sign = label(p.name);
      sign.position.set(0, p.h + 3.3, p.d / 2);
      group.add(sign);
      group.traverse(o => {
        if (o.isMesh) { o.userData = {kind: 'place', ref: p}; this.pickables.push(o); }
      });
    }

    addGrassField(this.scene,{homes,places:PLACES,seed:2031});

    for (const c of this.game.citizens) {
      const body = personBody(c);
      body.position.set(c.x, 0, c.z);
      const contactShadow=new THREE.Mesh(new THREE.CircleGeometry(.42,32),new THREE.MeshBasicMaterial({color:0x253126,transparent:true,opacity:.2,depthWrite:false}));
      contactShadow.name='Contact shadow';contactShadow.rotation.x=-Math.PI/2;contactShadow.position.y=-.036;contactShadow.scale.set(.85,1,1.18);contactShadow.castShadow=false;contactShadow.receiveShadow=false;contactShadow.userData.contactShadow=true;body.add(contactShadow);body.userData.contactShadow=contactShadow;
      this.scene.add(body);
      const tag = label(c.name, '#325064', 50);
      tag.scale.set(3.3, .85, 1);
      tag.position.y = 3.08;
      body.add(tag);
      const bubble = label('', '#2b4c5e', 40, {scale: [4.6, 1.5]});
      bubble.position.y = 3.85;
      bubble.visible = false;
      body.add(bubble);
      const item = label('', '#5d4a2f', 46, {bg: '#fff6dd', scale: [1.7, .9]});
      item.position.set(1.05, 1.85, 0);
      item.visible = false;
      body.add(item);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({map: haloTexture(), transparent: true, depthTest: false}));
      halo.scale.set(2.2, 2.2, 1);
      halo.position.y = 1.5;
      halo.visible = false;
      body.add(halo);
      body.traverse(o => {
        if (o.isMesh) { o.userData = {kind: 'citizen', ref: c}; this.pickables.push(o); }
      });
      this.bodies.push(body);
      this.bubbles.push(bubble);
      this.icons.push(item);
      body.userData.halo = halo;
      body.userData.tag = tag;
    }

    this.player = personBody({name:'Mira',color:0xf5a65d});
    this.player.position.set(this.game.playerPosition.x, 0, this.game.playerPosition.z);
    this.scene.add(this.player);
    const you = label('YOU', '#5e7050', 50);
    you.scale.set(2.2, .7, 1); you.position.y = 3.15;
    this.player.add(you);
  }

  async loadResidentModels(){
    const loader=new GLTFLoader(),results=await Promise.allSettled(this.game.citizens.map(async(c,i)=>{
      const gltf=await loader.loadAsync(residentModelUrl(c.name));
      const model=textureResidentModel(gltf.scene.clone(true),c.name);
      this.modelTemplates.set(c.name,gltf.scene);
      const body=this.bodies[i];
      for(const child of [...body.children])if(child.isMesh&&!child.userData.contactShadow)body.remove(child);
      this.pickables=this.pickables.filter(o=>o.userData?.ref!==c);
      model.traverse(o=>{if(o.isMesh){o.userData={kind:'citizen',ref:c};this.pickables.push(o);}});
      body.add(model);body.userData.glb=model;body.userData.torso=model.getObjectByName('Tailored coat')||model.getObjectByName('Coat');
      body.userData.limbs={
        arms:{L:model.getObjectByName('Arm pivot L'),R:model.getObjectByName('Arm pivot R')},
        legs:{L:model.getObjectByName('Leg pivot L'),R:model.getObjectByName('Leg pivot R')},
        feet:{L:model.getObjectByName('Foot pivot L'),R:model.getObjectByName('Foot pivot R')}
      };
      body.userData.tag.position.y=3.08;
      this.bubbles[i].position.y=3.85;
      return c.name;
    }));
    const loaded=results.filter(x=>x.status==='fulfilled').length;
    this.modelStatus=loaded===this.game.citizens.length?loaded+' individually detailed resident GLBs loaded':loaded+' of '+this.game.citizens.length+' resident GLBs loaded; procedural characters cover missing models';
    return results;
  }

  pick(x, y) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    return hits.find(h => h.object.userData?.kind) || null;
  }

  moveTo(x, z) {
    if (this.possessing != null) return;
    this.destination = new THREE.Vector3(clamp(x, -35, 35), 0, clamp(z, -35, 35));
  }

  possess(person) {
    this.possessing = person ? person.id : null;
    this.look = {yaw: 0, pitch: 0};
    this.controls.enabled = !person;
    this.container.classList.toggle('inside', !!person);
    if (!person) {
      this.camera.fov = 52;
      this.camera.rotation.set(0, 0, 0);
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(40, 38, 46);
      this.controls.target.set(this.game.playerPosition.x, 1, this.game.playerPosition.z);
      this.controls.update();
    }
    this.camera.updateProjectionMatrix();
  }

  lookAround(dx, dy) {
    if (this.possessing == null) return;
    this.look.yaw -= dx * .004;
    this.look.pitch = clamp(this.look.pitch - dy * .003, -.55, .5);
  }

  updateSky(hour) {
    const t = hour;
    let sky, sunStrength, ambient;
    if (t < 5.5 || t > 21) { sky = SKY.night; sunStrength = .25; ambient = .5; }
    else if (t < 8) { const k = (t - 5.5) / 2.5; sky = SKY.dawn.clone().lerp(SKY.day, k); sunStrength = .8 + k * 2; ambient = .9 + k; }
    else if (t > 18) { const k = clamp((t - 18) / 3, 0, 1); sky = SKY.day.clone().lerp(SKY.dusk, k); sunStrength = 2.9 - k * 2.4; ambient = 2 - k; }
    else { sky = SKY.day; sunStrength = 3.2; ambient = 1.45; }
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.sun.intensity = sunStrength;
    this.ambient.intensity = ambient;
    const nightLevel=t<5.5?1:t<8?1-(t-5.5)/2.5:t<18?0:t<21?(t-18)/3:1;
    for(const {glow,pool,lamp} of this.streetLights){
      glow.intensity=nightLevel*7.2;
      pool.material.opacity=nightLevel*.31;
      lamp.material.emissiveIntensity=.42+nightLevel*2.5;
    }
    const angle = (t / 24) * Math.PI * 2 - Math.PI / 2;
    this.sun.position.set(Math.cos(angle) * 55, Math.max(8, Math.sin(angle) * 55 + 25), -20);
  }

  update(dt) {
    const state = this.game.state;
    const hour = state.minute / 60;
    // Wall-clock animation also advances during story mode, which renders the world with dt=0.
    this.time = performance.now();
    this.updateSky(hour);
    animateCurtains(this.curtains,this.time);

    this.game.citizens.forEach((c, i) => {
      const body = this.bodies[i];
      const stride = this.time * (.006 + Math.min(.004, Math.abs(c.speed) * .0015)) + i * 1.73;
      const gait = clamp(Math.abs(c.speed) / .24, 0, 1);
      body.position.set(c.x, Math.abs(Math.sin(stride * 2)) * .035 * gait, c.z);
      const limbs=body.userData.limbs;
      if(limbs){
        for(const [side,key] of [['L',0],['R',Math.PI]]){
          const step=Math.sin(stride+key),leg=limbs.legs[side],arm=limbs.arms[side],foot=limbs.feet[side];
          if(leg)leg.rotation.x=step*.34*gait;
          if(arm)arm.rotation.x=-step*.28*gait;
          if(foot)foot.rotation.x=(-step*.34*.52+Math.max(0,step)*.14)*gait;
        }
      }
      if(body.userData.contactShadow)body.userData.contactShadow.position.y=-body.position.y-.036;
      body.rotation.y = c.heading;
      const torso = body.userData.torso;
      if (torso) {
        const tint = new THREE.Color(apparelFor(c.name).coat);
        if (c.mood < .35) tint.lerp(new THREE.Color(0x5d6b7d), .35);
        else if (c.brain.da > .5) tint.lerp(new THREE.Color(0xf6d488), .22);
        torso.material.color.copy(tint);
      }
      const halo = body.userData.halo;
      const buzz = clamp(c.brain.channels.arousal * (.4 + c.brain.da + c.brain.oa) * 1.3, 0, 1);
      halo.visible = buzz > .12 || c.id === this.possessing;
      if (halo.visible) {
        halo.material.opacity = .18 + buzz * .5;
        halo.scale.setScalar(2 + buzz * 1.5);
        halo.material.color.set(c.brain.oa > c.brain.da ? 0xff8f7a : 0x9de3c9);
      }
      const bubble = this.bubbles[i];
      const speaking = c.speech && c.speech.until > performance.now();
      if (speaking) {
        if (bubble.userData.text !== c.speech.text) {
          bubble.material.map?.dispose();
          bubble.material.dispose();
          const next = textSprite(c.speech.text, {bg: '#ffffffe6', fg: '#24414f', size: 38, scale: [5, 1.6]});
          bubble.material = next.material;
          bubble.userData.text = c.speech.text;
        }
        bubble.visible = true;
        bubble.scale.set(5, 1.6, 1);
      } else bubble.visible = false;

      const icon = this.icons[i];
      const held = Object.keys(c.inventory).find(k => c.inventory[k] > 0);
      if (held) {
        const glyph = `${ITEM_GLYPH[held] || '📦'}${c.inventory[held]}`;
        if (icon.userData.text !== glyph) {
          icon.material.map?.dispose();
          icon.material.dispose();
          const next = textSprite(glyph, {bg: '#fff6ddee', fg: '#5b4a2b', size: 62, w: 256, h: 128, scale: [1.5, .75]});
          icon.material = next.material;
          icon.userData.text = glyph;
        }
        icon.visible = true;
      } else icon.visible = false;
    });

    if (this.possessing != null) {
      const c = this.game.citizens.find(x => x.id === this.possessing);
      if (c) {
        const bob = Math.sin(this.time * .009) * .035 * clamp(Math.abs(c.speed) / .24, 0, 1);
        this.camera.position.set(c.x + Math.sin(c.heading) * .25, 2.5 + bob, c.z + Math.cos(c.heading) * .25);
        this.camera.rotation.order = 'YXZ';
        const goLeft = c.brain.channels.roll * .35;
        this.camera.rotation.y = c.heading + this.look.yaw + goLeft * .1;
        this.camera.rotation.x = this.look.pitch - .04;
        this.camera.fov = 62 + c.brain.channels.arousal * 8;
        this.camera.updateProjectionMatrix();
        this.player.visible = false;
      }
    } else {
      this.player.visible = true;
      if (this.destination) {
        const d = this.destination.clone().sub(this.player.position);
        d.y = 0;
        if (d.length() < .25) this.destination = null;
        else {
          const speed = Math.min(d.length(), dt * .012);
          this.player.rotation.y = Math.atan2(d.x, d.z);
          this.player.position.add(d.normalize().multiplyScalar(speed));
        }
      }
      this.game.playerPosition.x = this.player.position.x;
      this.game.playerPosition.z = this.player.position.z;
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }
}

let haloCache = null;
function haloTexture() {
  if (haloCache) return haloCache;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,.95)');
  grad.addColorStop(.55, 'rgba(160,230,210,.35)');
  grad.addColorStop(1, 'rgba(160,230,210,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  haloCache = new THREE.CanvasTexture(c);
  return haloCache;
}
