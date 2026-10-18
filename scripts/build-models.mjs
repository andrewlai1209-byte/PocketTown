import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {CITIZENS} from '../src/data/town.js';
import {apparelFor} from '../src/data/apparel.js';

// The models are authored from small, named meshes so every resident can have tailored
// clothing, accessory details and material variation while retaining a shared human scale.
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(b=>{this.result=b;this.onloadend?.();});}};
const output='public/models/villagers';
await mkdir(output,{recursive:true});
const hex=n=>new T.Color(n);
const fabric=(name,color,roughness=.88,metalness=0)=>new T.MeshStandardMaterial({name,color,roughness,metalness});
const sphere=new T.SphereGeometry(1,24,16);
function makeResident(person){
  const a=apparelFor(person.name),root=new T.Group();root.name=person.name+' · '+person.role;
  root.scale.setScalar(a.height);
  const materials={
    Skin:fabric('Skin',a.skin,.94),Hair:fabric('Hair',a.hair,.94),Coat:fabric('Coat',a.coat,.9),
    Shirt:fabric('Shirt',a.shirt,.92),Pants:fabric('Pants',a.pants,.93),Shoe:fabric('Shoe',a.shoe,.78),
    Trim:fabric('Trim',a.trim,.78),Apron:fabric('Apron',a.apron,.96),Metal:fabric('Metal',0xb59a69,.32,.62),
    EyeWhite:fabric('EyeWhite',0xfff3dc,.72),Iris:fabric('Iris',person.name==='Ada'?0x638778:0x493b31,.72),
    Mouth:fabric('Mouth',0x754844,.92),Fold:fabric('Fold',new T.Color(a.coat).multiplyScalar(.76),.97),
    Highlight:fabric('Highlight',new T.Color(a.coat).lerp(new T.Color(0xffffff),.27),.9),
    Blush:fabric('Blush',new T.Color(a.skin).lerp(new T.Color(0xee928b),.48),.98)
  };
  const add=(name,geo,material,x=0,y=0,z=0,sx=1,sy=1,sz=1,rotY=0)=>{const m=new T.Mesh(geo,materials[material]||materials.Trim);m.name=name;m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.y=rotY;m.castShadow=true;m.receiveShadow=true;root.add(m);return m;};
  const ellipsoid=(name,material,pos,scale)=>add(name,sphere,material,...pos,...scale);
  const cylinder=(name,material,rTop,rBottom,height,pos,radial=16)=>{const m=add(name,new T.CylinderGeometry(rTop,rBottom,height,radial,2),material,...pos);return m;};
  const tube=(name,material,points,r=.012,segments=16)=>{const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));return add(name,new T.TubeGeometry(curve,segments,r,6,false),material);};
  const lathe=(name,material,points,pos)=>add(name,new T.LatheGeometry(points.map(([r,y])=>new T.Vector2(r,y)),24),material,...pos);
  const roundBox=(name,material,size,pos,r=.035)=>{const shape=new T.Shape();shape.moveTo(-size[0]/2+r,-size[1]/2);shape.lineTo(size[0]/2-r,-size[1]/2);shape.quadraticCurveTo(size[0]/2,-size[1]/2,size[0]/2,-size[1]/2+r);shape.lineTo(size[0]/2,size[1]/2-r);shape.quadraticCurveTo(size[0]/2,size[1]/2,size[0]/2-r,size[1]/2);shape.lineTo(-size[0]/2+r,size[1]/2);shape.quadraticCurveTo(-size[0]/2,size[1]/2,-size[0]/2,size[1]/2-r);shape.lineTo(-size[0]/2,-size[1]/2+r);shape.quadraticCurveTo(-size[0]/2,-size[1]/2,-size[0]/2+r,-size[1]/2);const geo=new T.ExtrudeGeometry(shape,{depth:size[2],bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.012,bevelThickness:.012});return add(name,geo,material,...pos);}

  // Shoes, soles and separate laces: the front of every character faces +Z.
  for(const side of [-1,1]){
    const x=side*.155;
    roundBox('Sole '+side,'Shoe',[.3,.07,.48],[x,.065,.08],.05);
    ellipsoid('Leather toe '+side,'Shoe',[x,.155,.105],[.145,.12,.225]);
    cylinder('Boot shaft '+side,'Shoe',.112,.138,.28,[x,.255,-.055],16);
    for(let i=0;i<4;i++){
      const yy=.195+i*.037,zz=.154-i*.035;
      ellipsoid('Lace eyelet '+side+' '+i,'Metal',[x-.055,yy,zz],[.012,.012,.009]);
      ellipsoid('Lace eyelet '+side+' '+i+'b','Metal',[x+.055,yy,zz],[.012,.012,.009]);
      tube('Crossed boot lace '+side+' '+i,'Shirt',[[x-.052,yy,zz+.009],[x,yy+.012,zz+.018],[x+.052,yy+.037,zz+.009]],.009,8);
    }
    tube('Boot welt '+side,'Trim',[[x-.14,.102,-.09],[x-.14,.105,.2],[x,.11,.29],[x+.14,.105,.2],[x+.14,.102,-.09]],.009,20);

    // Lower leg, articulated knee and upper trouser leg have visibly different volume.
    lathe('Trousers calf '+side,'Pants',[[.105,-.36],[.12,-.32],[.115,-.2],[.13,-.04],[.125,.03],[.11,.1]],[x,.54,0]);
    ellipsoid('Knee joint '+side,'Pants',[x,.67,0],[.145,.15,.135]);
    lathe('Trousers thigh '+side,'Pants',[[.125,-.03],[.145,.08],[.15,.22],[.17,.39],[.18,.45]],[x,.74,0]);
    // Folded cloth at knee, shin and seat; two shades make each crease catch sunlight.
    for(let f=0;f<3;f++){
      const y=.49+f*.045,z=.128-Math.abs(f-1)*.018;
      tube('Trouser knee crease '+side+' '+f,'Fold',[[x-.09,y-.025,z-.015],[x,y,z],[x+.085,y+.018,z-.018]],.009,10);
    }
    tube('Trouser hem seam '+side,'Trim',[[x-.09,.19,.075],[x-.06,.18,.12],[x+.06,.18,.12],[x+.09,.19,.075]],.008,12);

    // Hips and shoulder movement are joined by skin-tone elbow and wrist joints.
    ellipsoid('Shoulder '+side,'Coat',[side*.37,1.68,0],[.22,.2,.23]);
    const upper=cylinder('Sleeve upper '+side,'Coat',.115,.145,.38,[side*.42,1.48,0],18);upper.rotation.z=side*-.12;
    ellipsoid('Elbow joint '+side,'Fold',[side*.44,1.28,.01],[.125,.12,.13]);
    const forearm=cylinder('Sleeve forearm '+side,'Coat',.09,.12,.31,[side*.46,1.08,.02],18);forearm.rotation.z=side*-.08;
    cylinder('Cuff '+side,'Trim',.102,.102,.075,[side*.47,.91,.02],18);
    ellipsoid('Hand palm '+side,'Skin',[side*.47,.79,.035],[.085,.13,.07]);
    for(let finger=0;finger<4;finger++)ellipsoid('Finger '+side+' '+finger,'Skin',[side*.47+(finger-1.5)*.037,.695,.045],[.022,.073,.026]);
    ellipsoid('Thumb '+side,'Skin',[side*.47+side*.105,.765,.08],[.032,.075,.032]);
    // Elbow dart, sleeve creases and top-stitching are thin raised cloth details.
    for(let f=0;f<3;f++)tube('Sleeve wrinkle '+side+' '+f,'Fold',[[side*.35,1.3+f*.028,.11],[side*.44,1.29+f*.015,.132],[side*.52,1.31-f*.02,.105]],.008,10);
    tube('Sleeve highlight '+side,'Highlight',[[side*.43,1.55,.12],[side*.48,1.42,.128],[side*.49,1.34,.12]],.006,10);
  }

  // Waist, shirt and tailored outer jacket with a shaped chest and a real neck opening.
  lathe('Waistcoat shirt','Shirt',[[.23,-.42],[.28,-.3],[.3,-.1],[.32,.14],[.35,.34],[.31,.42]],[0,1.44,0]);
  lathe('Tailored coat','Coat',[[.28,-.43],[.32,-.32],[.34,-.09],[.37,.15],[.4,.34],[.35,.43]],[0,1.44,0]);
  lathe('Trouser waistband','Pants',[[.305,-.035],[.33,-.035],[.34,.055],[.31,.055]],[0,1.05,0]);
  // Two lapels angle inward over the shirt and cast their own small shadows.
  const lapelL=new T.Shape();lapelL.moveTo(-.32,1.83);lapelL.lineTo(-.06,1.81);lapelL.lineTo(-.12,1.56);lapelL.lineTo(-.3,1.72);lapelL.closePath();
  const lapelR=new T.Shape();lapelR.moveTo(.32,1.83);lapelR.lineTo(.06,1.81);lapelR.lineTo(.12,1.56);lapelR.lineTo(.3,1.72);lapelR.closePath();
  add('Left folded lapel',new T.ShapeGeometry(lapelL),'Highlight',0,0,.27);
  add('Right folded lapel',new T.ShapeGeometry(lapelR),'Coat',0,0,.275);
  cylinder('Neck','Skin',.105,.12,.21,[0,1.88,.01],20);
  ellipsoid('Throat shadow','Skin',[0,1.91,.09],[.085,.1,.07]);
  // Collar points and placket buttons are small, distinct pieces rather than painted blocks.
  roundBox('Shirt placket','Shirt',[.065,.46,.025],[0,1.57,.292],.02);
  for(let i=0;i<4;i++)ellipsoid('Jacket button '+i,'Metal',[.035,1.68-i*.14,.312],[.022,.022,.012]);
  tube('Buttonhole seam L','Trim',[[-.02,1.76,.316],[-.04,1.62,.318],[-.04,1.48,.315]],.006,12);
  tube('Buttonhole seam R','Trim',[[.065,1.76,.316],[.07,1.62,.318],[.07,1.48,.315]],.006,12);
  // Cloth gathering at the side waist, underarm and elbow; curves sit just above the fabric.
  for(const side of [-1,1])for(let f=0;f<3;f++)tube('Jacket waist fold '+side+' '+f, f===1?'Highlight':'Fold',[[side*.25,1.28+f*.055,.2],[side*.3,1.3+f*.052,.235],[side*.34,1.31+f*.04,.2]],.009,12);
  tube('Shoulder top stitch L','Trim',[[-.34,1.79,.13],[-.23,1.84,.16],[-.08,1.84,.18]],.007,12);
  tube('Shoulder top stitch R','Trim',[[.34,1.79,.13],[.23,1.84,.16],[.08,1.84,.18]],.007,12);

  // Apron panels and straps vary in length by trade; texture and folds are added in-browser.
  roundBox('Apron panel','Apron',[.38,.5,.045],[0,1.27,.323],.035);
  tube('Apron strap L','Apron',[[-.18,1.51,.3],[-.19,1.72,.22],[-.11,1.78,.16]],.035,16);
  tube('Apron strap R','Apron',[[.18,1.51,.3],[.19,1.72,.22],[.11,1.78,.16]],.035,16);
  tube('Apron top stitch','Trim',[[-.16,1.49,.35],[0,1.49,.352],[.16,1.49,.35]],.007,18);
  tube('Apron hem','Trim',[[-.17,1.03,.35],[0,1.02,.356],[.17,1.03,.35]],.008,18);
  for(let f=0;f<4;f++)tube('Apron hanging fold '+f,'Fold',[[-.13+f*.065,1.08,.352],[-.12+f*.065,1.24,.356],[-.1+f*.065,1.43,.353]],.007,12);
  roundBox('Tool belt','Shoe',[.7,.1,.44],[0,1.01,0],.025);
  cylinder('Belt buckle','Metal',.065,.065,.025,[0,1.01,.239],4);

  // Friendly game-style face: larger, softer forms and a readable smile avoid uncanny realism.
  ellipsoid('Face','Skin',[0,2.18,.015],[.36,.43,.31]);
  ellipsoid('Jaw','Skin',[0,2.035,.065],[.265,.19,.25]);
  for(const side of [-1,1]){
    ellipsoid('Ear '+side,'Skin',[side*.35,2.17,.005],[.075,.105,.065]);
    ellipsoid('Eye white '+side,'EyeWhite',[side*.132,2.205,.286],[.067,.055,.026]);
    ellipsoid('Iris '+side,'Iris',[side*.132,2.204,.308],[.033,.038,.014]);
    ellipsoid('Pupil '+side,'Mouth',[side*.132,2.204,.32],[.017,.025,.008]);
    ellipsoid('Eye catchlight '+side,'EyeWhite',[side*.12,2.22,.328],[.011,.012,.005]);
    tube('Soft brow '+side,'Hair',[[side*.21,2.275,.286],[side*.14,2.3,.3],[side*.07,2.285,.295]],.018,12);
    ellipsoid('Blush '+side,'Blush',[side*.2,2.095,.291],[.06,.035,.01]);
  }
  ellipsoid('Button nose','Skin',[0,2.13,.298],[.052,.06,.044]);
  tube('Friendly smile','Mouth',[[-.09,2.045,.29],[-.055,2.025,.307],[0,2.02,.312],[.055,2.025,.307],[.09,2.045,.29]],.014,16);
  ellipsoid('Forehead','Skin',[0,2.36,.025],[.31,.19,.27]);
  ellipsoid('Hair cap','Hair',[0,2.49,-.018],[.37,.19,.32]);
  for(const side of [-1,1])ellipsoid('Side hair '+side,'Hair',[side*.3,2.32,-.055],[.105,.23,.24]);
  for(let i=0;i<5;i++)ellipsoid('Hair curl '+i,'Hair',[-.23+i*.115,2.55,.04],[.1,.09,.13]);

  // Trade-specific accessories: each named resident has a different silhouette and work kit.
  const accessory=a.accessory;
  if(accessory==='straw-hat'){
    cylinder('Farmer hat crown','Hat',.22,.26,.16,[0,2.59,0],24);
    cylinder('Woven hat brim','Hat',.39,.39,.055,[0,2.54,0],32);
    cylinder('Hat band','Trim',.25,.25,.035,[0,2.59,.005],24);
    for(let i=0;i<10;i++){const ang=i*Math.PI/5;tube('Hat weave '+i,'Trim',[[Math.cos(ang)*.12,2.57,Math.sin(ang)*.12],[Math.cos(ang)*.36,2.56,Math.sin(ang)*.36]],.005,6);}
  }else if(accessory==='mail-cap'){
    ellipsoid('Courier cap crown','Hat',[0,2.58,-.005],[.3,.105,.27]);
    roundBox('Courier cap bill','Hat',[.43,.045,.24],[0,2.535,.19],.035);
    ellipsoid('Cap badge','Metal',[0,2.59,.25],[.06,.045,.014]);
  }else if(accessory==='headwrap'){
    ellipsoid('Baker head wrap','Hat',[0,2.53,-.06],[.32,.09,.27]);
    tube('Headwrap tie','Trim',[[-.28,2.52,-.04],[-.36,2.45,-.12],[-.27,2.38,-.17]],.035,14);
    ellipsoid('Hair bun','Hair',[0,2.44,-.26],[.14,.14,.12]);
  }else if(accessory==='glasses'){
    for(const side of [-1,1]){
      const ring=new T.Mesh(new T.TorusGeometry(.065,.009,8,20),materials.Metal);ring.name='Glasses rim '+side;ring.position.set(side*.12,2.2,.31);root.add(ring);
      tube('Glasses arm '+side, 'Metal',[[side*.18,2.21,.305],[side*.25,2.21,.22],[side*.29,2.18,.08]],.008,10);
    }
    tube('Glasses bridge','Metal',[[-.055,2.2,.314],[0,2.215,.33],[.055,2.2,.314]],.009,8);
  }else if(accessory==='goggles'){
    for(const side of [-1,1]){const ring=new T.Mesh(new T.TorusGeometry(.073,.018,8,20),materials.Metal);ring.name='Maker goggle '+side;ring.position.set(side*.12,2.32,.28);root.add(ring);ellipsoid('Goggle lens '+side,'EyeWhite',[side*.12,2.32,.276],[.052,.052,.014]);}
    tube('Goggle bridge','Metal',[[-.05,2.32,.3],[0,2.34,.316],[.05,2.32,.3]],.014,8);
  }else if(accessory==='flower-brooch'){
    ellipsoid('Hair bun','Hair',[0,2.48,-.25],[.15,.15,.13]);
    for(let i=0;i<6;i++){const ang=i*Math.PI/3;ellipsoid('Flower petal '+i,'Trim',[Math.cos(ang)*.07,1.79+Math.sin(ang)*.07,.29],[.045,.04,.02]);}
    ellipsoid('Flower centre','Metal',[0,1.79,.315],[.023,.023,.015]);
  }else if(accessory==='mayor-sash'){
    tube('Civic sash','Trim',[[-.29,1.75,.22],[-.14,1.55,.28],[.02,1.35,.32],[.2,1.15,.27]],.048,24);
    roundBox('Mayor seal','Metal',[.12,.15,.035],[.23,1.2,.285],.025);
    for(let i=0;i<3;i++)ellipsoid('Mayor lapel pin '+i,'Metal',[.21-i*.035,1.66-i*.055,.3],[.018,.018,.012]);
  }else if(accessory==='backpack'){
    roundBox('Student backpack','Apron',[.39,.48,.21],[0,1.36,-.285],.08);
    roundBox('Backpack flap','Trim',[.34,.15,.04],[0,1.62,-.4],.045);
    tube('Backpack strap L','Apron',[[-.21,1.72,-.13],[-.25,1.55,.02],[-.22,1.35,.16]],.025,14);
    tube('Backpack strap R','Apron',[[.21,1.72,-.13],[.25,1.55,.02],[.22,1.35,.16]],.025,14);
  }else if(accessory==='barista'){
    roundBox('Barista apron pocket','Trim',[.19,.14,.022],[0,1.26,.354],.025);
    cylinder('Coffee pin','Metal',.04,.04,.025,[.2,1.77,.29],16);
  }else if(accessory==='scarf'){
    tube('Soft scarf loop','Trim',[[-.25,1.83,.1],[-.18,1.72,.25],[0,1.69,.3],[.18,1.75,.24],[.25,1.84,.09]],.07,24);
    tube('Scarf end','Trim',[[.15,1.73,.24],[.22,1.5,.3],[.18,1.26,.33]],.065,20);
  }
  // A narrow necktie and folded pocket square are sewn into formal outfits.
  if(person.role==='Mayor'||person.role==='Doctor'||person.role==='Teacher'){
    const tie=new T.Shape();tie.moveTo(-.045,1.77);tie.lineTo(.045,1.77);tie.lineTo(.075,1.45);tie.lineTo(0,1.38);tie.lineTo(-.075,1.45);tie.closePath();
    add('Necktie',new T.ShapeGeometry(tie),'Trim',0,0,.305);
    tube('Pocket square stitch', 'Shirt',[[.21,1.68,.3],[.28,1.71,.305],[.32,1.66,.29]],.015,10);
  }
  // The bakery, clinic, market and workshop all carry a stitched, role-specific apron.
  if(['Baker','Doctor','Shopkeeper','Maker','Barista'].includes(person.role)){
    roundBox('Work apron pocket','Trim',[.2,.16,.025],[.08,1.25,.36],.025);
    tube('Pocket stitch','Shirt',[[0,1.33,.377],[.08,1.34,.379],[.16,1.33,.377]],.006,10);
  }
  // Turn the mesh layout into real shoulder, hip and ankle pivots for a clean walk cycle.
  const moveInto=(parent,child,anchor)=>{parent.remove(child);child.position.sub(anchor);parent.add(child);};
  const pivotMeshes=(name,anchor,pattern)=>{
    const pivot=new T.Group();pivot.name=name;pivot.position.copy(anchor);root.add(pivot);
    for(const child of [...root.children])if(child.isMesh&&pattern.test(child.name))moveInto(pivot,child,anchor);
    return pivot;
  };
  const animation={arms:{},legs:{},feet:{}};
  for(const side of [-1,1]){
    const label=side<0?'L':'R',x=side*.155,hip=new T.Vector3(x,.96,0);
    animation.arms[label]=pivotMeshes('Arm pivot '+label,new T.Vector3(side*.37,1.68,0),new RegExp(`^(Shoulder ${side}|Sleeve upper ${side}|Elbow joint ${side}|Sleeve forearm ${side}|Cuff ${side}|Hand palm ${side}|Finger ${side} |Thumb ${side}|Sleeve wrinkle ${side} |Sleeve highlight ${side})`));
    const foot=pivotMeshes('Foot pivot '+label,new T.Vector3(x,.2,0),new RegExp(`^(Sole ${side}|Leather toe ${side}|Boot shaft ${side}|Lace eyelet ${side}|Crossed boot lace ${side}|Boot welt ${side})`));
    const leg=pivotMeshes('Leg pivot '+label,hip,new RegExp(`^(Trousers calf ${side}|Knee joint ${side}|Trousers thigh ${side}|Trouser knee crease ${side}|Trouser hem seam ${side})`));
    moveInto(leg,foot,hip);
    animation.legs[label]=leg;animation.feet[label]=foot;
  }
  root.userData.animation=animation;
  root.userData.profile={name:person.name,role:person.role,pattern:a.pattern};
  return root;
}

const exporter=new GLTFExporter();
for(const person of CITIZENS){
  const root=makeResident(person),data=await exporter.parseAsync(root,{binary:true});
  const slug=person.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  await writeFile(output+'/'+slug+'.glb',Buffer.from(data));
  console.log('Generated detailed resident GLB:',person.name,Math.round(data.byteLength/1024)+' KB');
  if(person.name==='Mira')await writeFile('public/models/villager.glb',Buffer.from(data));
}
