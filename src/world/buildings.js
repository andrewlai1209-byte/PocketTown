import * as THREE from 'three';

// Shared, locally authored building detail. Repeated pieces are instanced so the town
// keeps individual geometry and real shadow edges without thousands of draw calls.
const TILE_W = .72;
const TILE_L = .84;
const COURSE = .80;
const shingleShape = new THREE.Shape();
const r = .055, hw = TILE_W / 2, hl = TILE_L / 2;
shingleShape.moveTo(-hw + r, -hl);
shingleShape.lineTo(hw - r, -hl); shingleShape.quadraticCurveTo(hw, -hl, hw, -hl + r);
shingleShape.lineTo(hw, hl - r); shingleShape.quadraticCurveTo(hw, hl, hw - r, hl);
shingleShape.lineTo(-hw + r, hl); shingleShape.quadraticCurveTo(-hw, hl, -hw, hl - r);
shingleShape.lineTo(-hw, -hl + r); shingleShape.quadraticCurveTo(-hw, -hl, -hw + r, -hl);
const SHINGLE = new THREE.ExtrudeGeometry(shingleShape, {depth:.075, bevelEnabled:true, bevelSegments:2, bevelSize:.018, bevelThickness:.012, curveSegments:3});
SHINGLE.translate(0, 0, -.0375);
const ROOF_FACE = new THREE.PlaneGeometry(1, 1);
const cobbleShape=new THREE.Shape();
cobbleShape.moveTo(-.9,-.22);cobbleShape.lineTo(-.73,-.72);cobbleShape.lineTo(-.18,-.9);cobbleShape.lineTo(.38,-.78);cobbleShape.lineTo(.87,-.49);cobbleShape.lineTo(.94,.12);cobbleShape.lineTo(.62,.72);cobbleShape.lineTo(.05,.88);cobbleShape.lineTo(-.55,.74);cobbleShape.lineTo(-.93,.35);cobbleShape.closePath();
const STONE=new THREE.ExtrudeGeometry(cobbleShape,{depth:.2,bevelEnabled:true,bevelSegments:2,bevelSize:.09,bevelThickness:.055,curveSegments:2});
STONE.translate(0,0,-.1);
const roofMaterials = new Map();
const stoneMaterial = new THREE.MeshStandardMaterial({color:0xffffff, roughness:.96, flatShading:true});
const woodMaterials = [0x684533,0x78513a,0x855d40,0x5c3e31].map(color=>new THREE.MeshStandardMaterial({color,roughness:.94}));
const frameMaterial = new THREE.MeshStandardMaterial({color:0xf0dfbf,roughness:.86});
const glassMaterial = new THREE.MeshPhysicalMaterial({color:0xb8dedb,roughness:.2,metalness:.04,transparent:true,opacity:.32,depthWrite:false,side:THREE.DoubleSide});
const curtainMaterials = [0xf1e6d3,0xd9e5dc,0xe5cfc0,0xd7d9e8].map(color=>new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide}));
const darkInside = new THREE.MeshStandardMaterial({color:0x211f22,roughness:1});

function random(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function materialForRoof(base){
  const key=new THREE.Color(base).getHexString();
  if(!roofMaterials.has(key)){
    const c=new THREE.Color(base);
    roofMaterials.set(key,[c.clone().lerp(new THREE.Color(0xffe8c8),.06),c.clone().multiplyScalar(.93),c.clone().lerp(new THREE.Color(0xffffff),.11),c.clone().multiplyScalar(.87)].map(color=>new THREE.MeshStandardMaterial({color,roughness:.9,metalness:.01})));
  }
  return roofMaterials.get(key);
}

export function addTiledRoof(parent,{width,depth,eaveY,rise,color,seed=1}){
  const half=depth/2+.38,slope=Math.hypot(half,rise),angle=Math.atan2(rise,half),span=width+.7;
  const base=new THREE.MeshStandardMaterial({color:new THREE.Color(color).multiplyScalar(.42),roughness:1,side:THREE.DoubleSide});
  const palettes=materialForRoof(color),rand=random(seed),batches=palettes.map(()=>[]);
  for(const side of [-1,1]){
    const pitch=-Math.PI/2+side*angle;
    const plane=new THREE.Mesh(ROOF_FACE,base);plane.name='Shadowed roof underlay';
    plane.position.set(0,eaveY+rise/2,side*half/2);plane.rotation.x=pitch;plane.scale.set(span,slope,1);plane.castShadow=false;plane.receiveShadow=true;parent.add(plane);
    const rows=Math.ceil(slope/COURSE),cols=Math.ceil(span/(TILE_W+.055));
    for(let row=0;row<rows;row++){
      const distance=(row+.5)*COURSE;
      if(distance>slope-.19)continue;
      const offset=(row%2)*((TILE_W+.055)/2);
      for(let col=0;col<cols;col++){
        const x=-span/2+(col+.5)*(TILE_W+.055)+offset;
        if(x<-span/2+TILE_W*.36||x>span/2-TILE_W*.36)continue;
        const jitter=(rand()-.5)*.025;
        const y=eaveY+Math.sin(angle)*distance+Math.cos(angle)*.052;
        const z=side*(half-Math.cos(angle)*distance+Math.sin(angle)*.052);
        const choice=Math.floor(rand()*palettes.length);
        batches[choice].push({x:x+jitter,y,z,side,pitch,turn:(rand()-.5)*.025,scale:.97+rand()*.06});
      }
    }
  }
  batches.forEach((tiles,index)=>{
    if(!tiles.length)return;
    const instanced=new THREE.InstancedMesh(SHINGLE,palettes[index],tiles.length),dummy=new THREE.Object3D();
    instanced.name='Individually spaced roof tiles';instanced.castShadow=true;instanced.receiveShadow=true;instanced.frustumCulled=false;
    tiles.forEach((tile,i)=>{dummy.position.set(tile.x,tile.y,tile.z);dummy.rotation.set(tile.pitch,0,tile.turn);dummy.scale.set(tile.scale,tile.scale,1);dummy.updateMatrix();instanced.setMatrixAt(i,dummy.matrix);});
    instanced.instanceMatrix.needsUpdate=true;parent.add(instanced);
  });
  // Separate, short ridge caps cover the join between the two tiled roof planes.
  const count=Math.ceil(span/.72),capsule=new THREE.CapsuleGeometry(.145,.48,3,8),caps=new THREE.InstancedMesh(capsule,palettes[0],count),dummy=new THREE.Object3D();
  caps.name='Individual ridge caps';caps.castShadow=true;caps.receiveShadow=true;caps.frustumCulled=false;
  for(let i=0;i<count;i++){dummy.position.set(-span/2+(i+.5)*span/count,eaveY+rise+.085,0);dummy.rotation.set(0,0,Math.PI/2);dummy.updateMatrix();caps.setMatrixAt(i,dummy.matrix);}
  caps.instanceMatrix.needsUpdate=true;parent.add(caps);
}

function wallMesh(parent,{width,height,depth,color,seed,openings={}}){
  const rand=random(seed),geometry=STONE,base=new THREE.Color(color),faces=[
    {key:'front',span:width,position:(u,y)=>[u,y,depth/2+.045],yaw:0},
    {key:'back',span:width,position:(u,y)=>[u,y,-depth/2-.045],yaw:Math.PI},
    {key:'right',span:depth,position:(u,y)=>[width/2+.045,y,u],yaw:Math.PI/2},
    {key:'left',span:depth,position:(u,y)=>[-width/2-.045,y,u],yaw:-Math.PI/2}
  ];
  for(const face of faces){
    const cols=Math.ceil(face.span/.49),rows=Math.ceil(height/.36),cellW=face.span/cols,cellH=height/rows,placements=[];
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const stagger=(row%2)*cellW*.48;
      const u=THREE.MathUtils.clamp(-face.span/2+(col+.5)*cellW+stagger+(rand()-.5)*cellW*.28,-face.span/2+cellW*.28,face.span/2-cellW*.28);
      const y=(row+.5)*cellH+(rand()-.5)*cellH*.22;
      if((openings[face.key]||[]).some(hole=>Math.abs(u-hole.x)<hole.width/2+.04&&Math.abs(y-hole.y)<hole.height/2+.04))continue;
      placements.push({u,y,sx:cellW*(.445+rand()*.035),sy:cellH*(.445+rand()*.035),sz:.028+rand()*.03,rx:(rand()-.5)*.28,ry:(rand()-.5)*.25,rz:(rand()-.5)*.28,tone:.035+rand()*.105});
    }
    if(!placements.length)continue;
    const instanced=new THREE.InstancedMesh(geometry,stoneMaterial,placements.length),dummy=new THREE.Object3D();
    instanced.name='Raised cobble wall stones';instanced.castShadow=true;instanced.receiveShadow=true;instanced.frustumCulled=false;
    placements.forEach((p,i)=>{
      const [x,y,z]=face.position(p.u,p.y);dummy.position.set(x,y,z);dummy.rotation.set(p.rx,face.yaw+p.ry,p.rz);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();instanced.setMatrixAt(i,dummy.matrix);
      const c=base.clone().lerp(new THREE.Color(0xfff2d9),p.tone);c.multiplyScalar(.94+rand()*.1);instanced.setColorAt(i,c);
    });
    instanced.instanceMatrix.needsUpdate=true;if(instanced.instanceColor)instanced.instanceColor.needsUpdate=true;parent.add(instanced);
  }
}

export function addPebbleWalls(parent,options){wallMesh(parent,options);}

export function addTimberDoor(parent,{x=0,y,z,width,height}){
  const frame=.105,plankCount=Math.max(4,Math.floor(width/.24)),plankW=(width-frame*2)/plankCount,gap=.018;
  const backing=new THREE.Mesh(new THREE.BoxGeometry(width,height,.06),darkInside);backing.position.set(x,y,z-.018);backing.name='Dim doorway behind timber slits';parent.add(backing);
  const jambL=new THREE.Mesh(new THREE.BoxGeometry(frame,height+.12,.13),woodMaterials[0]),jambR=jambL.clone();
  jambL.position.set(x-width/2+frame/2,y,z+.055);jambR.position.set(x+width/2-frame/2,y,z+.055);parent.add(jambL,jambR);
  const railTop=new THREE.Mesh(new THREE.BoxGeometry(width,.13,.14),woodMaterials[2]);railTop.position.set(x,y+height/2-.035,z+.055);parent.add(railTop);
  const railBottom=railTop.clone();railBottom.position.y=y-height/2+.035;parent.add(railBottom);
  for(let i=0;i<plankCount;i++){
    const plankWOpen=plankW-gap;
    const plank=new THREE.Mesh(new THREE.BoxGeometry(plankWOpen,height-.22,.085),woodMaterials[(i+1)%woodMaterials.length]);
    plank.position.set(x-width/2+frame+i*plankW+plankW/2,y,z+.04+(i%2)*.004);plank.castShadow=true;plank.receiveShadow=true;plank.name='Separated door plank';parent.add(plank);
    // A shallow raised grain line makes the board readable while the dark seams stay narrow.
    const grain=new THREE.Mesh(new THREE.BoxGeometry(.009,height*.48,.009),woodMaterials[(i+2)%woodMaterials.length]);
    grain.position.set(plank.position.x+(i%2?-.035:.035),y,z+.087);parent.add(grain);
  }
  const latch=new THREE.Mesh(new THREE.SphereGeometry(.045,10,8),new THREE.MeshStandardMaterial({color:0xc89a59,metalness:.45,roughness:.45}));latch.position.set(x+width*.31,y-.04,z+.115);parent.add(latch);
}

export function addCurtainedWindow(parent,{x,y,z,width,height,yaw=0,seed=1},registry){
  const rig=new THREE.Group();rig.position.set(x,y,z);rig.rotation.y=yaw;rig.name='Curtained window';parent.add(rig);
  const addBox=(w,h,d,px,py,pz,material)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(px,py,pz);m.castShadow=true;m.receiveShadow=true;rig.add(m);return m;};
  addBox(width,height,.055,0,0,-.015,darkInside);
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(width-.12,height-.12),glassMaterial);glass.position.z=.065;glass.name='Softly glazed window';rig.add(glass);
  const frame=.095;
  addBox(frame,height+.15,.12,-width/2,0,.105,frameMaterial);addBox(frame,height+.15,.12,width/2,0,.105,frameMaterial);
  addBox(width+.1,frame,.12,0,height/2,.105,frameMaterial);addBox(width+.1,frame,.12,0,-height/2,.105,frameMaterial);
  addBox(.055,height-.09,.12,0,0,.11,frameMaterial);
  addBox(width-.09,.055,.12,0,0,.11,frameMaterial);
  // Two soft panels hang behind the glass; their top edge stays fixed as wind moves the hem.
  const panelW=width*.43,panelH=height*.91,mat=curtainMaterials[Math.abs(seed)%curtainMaterials.length];
  for(const side of [-1,1]){
    const geometry=new THREE.PlaneGeometry(panelW,panelH,10,12),mesh=new THREE.Mesh(geometry,mat);
    mesh.position.set(side*width*.285,-height*.025,.036);mesh.name='Wind-driven curtain';mesh.castShadow=true;mesh.receiveShadow=true;rig.add(mesh);
    registry.push({geometry,base:geometry.attributes.position.array.slice(),yaw,phase:seed*.73+side*1.2,side,panelW,panelH});
  }
  return rig;
}

export function animateCurtains(registry,time){
  const angle=.75+Math.sin(time*.00012)*.9,gust=.62+.38*Math.sin(time*.0011),wx=Math.cos(angle),wz=Math.sin(angle);
  for(const curtain of registry){
    const tangent=wx*Math.cos(curtain.yaw)-wz*Math.sin(curtain.yaw);
    const normal=wx*Math.sin(curtain.yaw)+wz*Math.cos(curtain.yaw);
    const attr=curtain.geometry.attributes.position,phase=time*.0024+curtain.phase;
    for(let i=0;i<attr.count;i++){
      const x=curtain.base[i*3],y=curtain.base[i*3+1],u=(x/curtain.panelW+.5),v=(y/curtain.panelH+.5),free=1-v;
      const pleat=Math.sin(u*Math.PI*12+phase+v*2.4);
      attr.setXYZ(i,x+tangent*gust*Math.sin(phase+v*3+curtain.side)*.075*free, y, curtain.base[i*3+2]+normal*gust*pleat*.11*free+pleat*.028*free);
    }
    attr.needsUpdate=true;curtain.geometry.computeVertexNormals();
  }
}
