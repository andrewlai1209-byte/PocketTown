import * as THREE from 'three';

const bark=new THREE.MeshStandardMaterial({color:0x725d49,roughness:.96});
const twig=new THREE.MeshStandardMaterial({color:0x80664c,roughness:.98});
const leafMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.96,side:THREE.DoubleSide});
const grassMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,side:THREE.DoubleSide});
const leafPalette=[0x6d925b,0x789d63,0x85a76b,0x91ad73,0x668553].map(c=>new THREE.Color(c));
const grassPalette=[0x879b71,0x8da276,0x9aa982,0x7d946e,0xa2ad86].map(c=>new THREE.Color(c));
const flowerPalette=[0xe9d7a5,0xf1e7ce,0xd99f91,0xe5c7b7].map(c=>new THREE.Color(c));

function seeded(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}

function leafGeometry(){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([
    0,0,0, -.34,.23,.015, 0,.23,.075, .34,.23,.015,
    -.24,.63,.015, 0,.63,.085, .24,.63,.015, 0,1,0
  ],3));
  g.setIndex([0,1,2,0,2,3,1,4,2,4,5,2,2,5,6,2,6,3,4,7,5,5,7,6]);
  g.computeVertexNormals();return g;
}
const LEAF_GEOMETRY=leafGeometry();

function tuftGeometry(){
  const vertices=[],indices=[];
  for(let blade=0;blade<3;blade++){
    const angle=blade*Math.PI/3,cos=Math.cos(angle),sin=Math.sin(angle),start=vertices.length/3;
    const local=[[-.055,0,0],[.055,0,0],[-.04,.18,.025],[.04,.18,.025],[0,.43,.1]];
    for(const [x,y,z] of local)vertices.push(x*cos+z*sin,y,-x*sin+z*cos);
    indices.push(start,start+2,start+3,start,start+3,start+1,start+2,start+4,start+3);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
const TUFT_GEOMETRY=tuftGeometry();

function flowerGeometry(){
  const vertices=[],indices=[];
  for(let petal=0;petal<5;petal++){
    const a=petal*Math.PI*2/5,start=vertices.length/3;
    for(const [x,z,y] of [[.025,0,.012],[.07,-.026,.025],[.12,0,.034],[.07,.026,.025]])vertices.push(x*Math.cos(a)-z*Math.sin(a),y,x*Math.sin(a)+z*Math.cos(a));
    indices.push(start,start+1,start+2,start,start+2,start+3);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
const FLOWER_GEOMETRY=flowerGeometry();
const FLOWER_CENTER_GEOMETRY=new THREE.SphereGeometry(.036,8,5);
const FLOWER_STEM_GEOMETRY=new THREE.CylinderGeometry(.012,.018,.25,5,1);

function beam(parent,a,b,radius){
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius*.58,radius,delta.length(),8,1),twig);
  mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}

export function addTree(parent,x,z,size=1,seed=1){
  const group=new THREE.Group();group.position.set(x,0,z);parent.add(group);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16,.28,2.45,10,2),bark);trunk.position.y=1.22;trunk.scale.setScalar(size);trunk.castShadow=true;trunk.receiveShadow=true;group.add(trunk);
  const rand=seeded(seed),branchCount=7;
  for(let i=0;i<branchCount;i++){
    const angle=i*Math.PI*2/branchCount+.23,reach=.55+rand()*.34;
    beam(group,[Math.cos(angle)*.1*size,1.45*size,Math.sin(angle)*.1*size],[Math.cos(angle)*reach*size,(2.48+rand()*.35)*size,Math.sin(angle)*reach*size],.075*size);
  }
  const count=152,leaves=new THREE.InstancedMesh(LEAF_GEOMETRY,leafMaterial,count),dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),normal=new THREE.Vector3();
  leaves.name='Distinct shadow-casting leaves';leaves.castShadow=true;leaves.receiveShadow=true;leaves.frustumCulled=false;
  for(let i=0;i<count;i++){
    const polar=Math.acos(2*rand()-1),azimuth=rand()*Math.PI*2,radius=Math.cbrt(.18+rand()*.82);
    const dx=Math.sin(polar)*Math.cos(azimuth),dy=Math.cos(polar),dz=Math.sin(polar)*Math.sin(azimuth);
    const px=dx*1.18*radius*size,py=3.12*size+dy*.96*radius*size,pz=dz*1.18*radius*size;
    normal.set(dx*.66+(rand()-.5)*.72,Math.max(.08,dy*.66+(rand()-.5)*.62),dz*.66+(rand()-.5)*.72).normalize();
    const q=new THREE.Quaternion().setFromUnitVectors(up,normal),twist=new THREE.Quaternion().setFromAxisAngle(up,rand()*Math.PI*2);q.multiply(twist);
    const scale=.86+rand()*.34;dummy.position.set(px,py,pz);dummy.quaternion.copy(q);dummy.scale.set(.26*scale*size,.46*scale*size,.72*scale*size);dummy.updateMatrix();leaves.setMatrixAt(i,dummy.matrix);
    const color=leafPalette[Math.floor(rand()*leafPalette.length)].clone().multiplyScalar(.96+rand()*.08);leaves.setColorAt(i,color);
  }
  leaves.instanceMatrix.needsUpdate=true;if(leaves.instanceColor)leaves.instanceColor.needsUpdate=true;group.add(leaves);
  return group;
}

export function addGrassField(parent,{homes=[],places=[],seed=2031}){
  const rand=seeded(seed),placements=[],flowers=[];
  const buildings=homes.map(([x,z])=>({x,z,w:5.8,d:5.3,pad:.35})).concat(places.filter(p=>p.type!=='park').map(p=>({x:p.x,z:p.z,w:p.w,d:p.d,pad:.65})));
  const park=places.find(p=>p.type==='park');
  for(let gx=-36;gx<=36;gx+=.62)for(let gz=-36;gz<=36;gz+=.62){
    const x=gx+(rand()-.5)*.58,z=gz+(rand()-.5)*.58;
    // Keep the planted blades out of paving, building footprints, the pond, and tree trunks.
    if(Math.abs(x/8-Math.round(x/8))<.16||Math.abs(z/8-Math.round(z/8))<.16)continue;
    if(buildings.some(b=>Math.abs(x-b.x)<b.w/2+b.pad&&Math.abs(z-b.z)<b.d/2+b.pad))continue;
    if(park&&Math.abs(x-park.x)<2.55&&Math.abs(z-park.z)<1.95)continue;
    if(rand()<.15)continue;
    const onPark=park&&Math.abs(x-park.x)<park.w/2&&Math.abs(z-park.z)<park.d/2;
    const y=onPark ? .076 : -.046;
    placements.push({x,y,z,scale:.72+rand()*.62,turn:rand()*Math.PI,color:grassPalette[Math.floor(rand()*grassPalette.length)]});
    if(rand()<.035)flowers.push({x,y,z,scale:.8+rand()*.65,color:flowerPalette[Math.floor(rand()*flowerPalette.length)],turn:rand()*Math.PI*2});
  }
  const grass=new THREE.InstancedMesh(TUFT_GEOMETRY,grassMaterial,placements.length),dummy=new THREE.Object3D();
  grass.name='Individual shadow-casting grass blades';grass.castShadow=true;grass.receiveShadow=true;grass.frustumCulled=false;
  placements.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=p.turn;dummy.scale.setScalar(p.scale);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);grass.setColorAt(i,p.color);});
  grass.instanceMatrix.needsUpdate=true;if(grass.instanceColor)grass.instanceColor.needsUpdate=true;parent.add(grass);
  if(flowers.length){
    const petals=new THREE.InstancedMesh(FLOWER_GEOMETRY,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.82,side:THREE.DoubleSide}),flowers.length);
    const centers=new THREE.InstancedMesh(FLOWER_CENTER_GEOMETRY,new THREE.MeshStandardMaterial({color:0xd9a746,roughness:.75}),flowers.length);
    const stems=new THREE.InstancedMesh(FLOWER_STEM_GEOMETRY,new THREE.MeshStandardMaterial({color:0x70865d,roughness:.95}),flowers.length);
    for(const [i,flower] of flowers.entries()){
      dummy.position.set(flower.x,flower.y+.27*flower.scale,flower.z);dummy.rotation.set(0,flower.turn,0);dummy.scale.setScalar(flower.scale);dummy.updateMatrix();petals.setMatrixAt(i,dummy.matrix);centers.setMatrixAt(i,dummy.matrix);petals.setColorAt(i,flower.color);
      dummy.position.y=flower.y+.125*flower.scale;dummy.scale.set(flower.scale,flower.scale,flower.scale);dummy.updateMatrix();stems.setMatrixAt(i,dummy.matrix);
    }
    for(const mesh of [petals,centers,stems]){mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;parent.add(mesh);}
    petals.name='Wildflower petals';centers.name='Wildflower centers';stems.name='Wildflower stems';
  }
  return grass;
}
