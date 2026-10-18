import * as THREE from 'three';
import {apparelFor} from '../data/apparel.js';

const cache=new Map();
export function residentModelUrl(name){return './models/villagers/'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.glb';}

function seeded(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function textureCanvas(kind,pattern='woven'){
  const key=kind+':'+pattern;if(cache.has(key))return cache.get(key);
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d'),rand=seeded(key.split('').reduce((n,ch)=>n+ch.charCodeAt(0),0));
  g.fillStyle='#e4e0d7';g.fillRect(0,0,256,256);
  // Fine, low-contrast fibers give the PBR cloth a surface response without noisy colors.
  for(let i=0;i<4600;i++){const v=rand()>.5?255:45;g.fillStyle='rgba('+v+','+v+','+v+','+(.018+rand()*.055)+')';g.fillRect(rand()*256,rand()*256,1+rand()*3,1+rand()*2);}
  if(kind==='cloth'){
    if(pattern==='pinstripe'||pattern==='fine-stripe')for(let x=0;x<256;x+=pattern==='pinstripe'?30:18){g.fillStyle='rgba(35,37,39,.12)';g.fillRect(x,0,2,256);g.fillStyle='rgba(255,255,255,.10)';g.fillRect(x+3,0,1,256);}
    if(pattern==='plaid'){g.fillStyle='rgba(45,43,38,.09)';for(let p=0;p<256;p+=42){g.fillRect(p,0,5,256);g.fillRect(0,p,256,5);}g.fillStyle='rgba(255,255,255,.1)';for(let p=10;p<256;p+=42){g.fillRect(p,0,2,256);g.fillRect(0,p,256,2);}}
    if(pattern==='herringbone')for(let y=-32;y<288;y+=16){g.strokeStyle='rgba(38,38,38,.1)';g.lineWidth=2;g.beginPath();for(let x=-32;x<=288;x+=12){const up=((Math.floor(x/12)+Math.floor(y/16))%2)===0;g.lineTo(x,y+(up?0:10));g.lineTo(x+6,y+(up?10:0));}g.stroke();}
    if(pattern==='knit'){g.strokeStyle='rgba(40,38,39,.12)';g.lineWidth=2;for(let y=0;y<256;y+=9)for(let x=(y%18?0:4);x<256;x+=12){g.beginPath();g.ellipse(x,y,3.5,4,0,0,Math.PI*2);g.stroke();}}
    if(pattern==='floral'){for(let y=12;y<256;y+=38)for(let x=12+(y%76?0:19);x<256;x+=38){g.fillStyle='rgba(71,50,60,.16)';for(let p=0;p<5;p++){const a=p*Math.PI*2/5;g.beginPath();g.ellipse(x+Math.cos(a)*4,y+Math.sin(a)*4,3,2, a,0,Math.PI*2);g.fill();}g.fillStyle='rgba(186,148,89,.2)';g.beginPath();g.arc(x,y,2,0,Math.PI*2);g.fill();}}
    if(pattern==='canvas'||pattern==='heavy-weave'||pattern==='woven'){g.strokeStyle='rgba(45,43,37,'+(pattern==='heavy-weave'?'.11':'.065')+')';g.lineWidth=1;const step=pattern==='heavy-weave'?5:8;for(let p=0;p<256;p+=step){g.beginPath();g.moveTo(p,0);g.lineTo(p,256);g.stroke();g.beginPath();g.moveTo(0,p);g.lineTo(256,p);g.stroke();}}
  }else if(kind==='skin'){
    for(let i=0;i<180;i++){const r=rand()*18+4;g.fillStyle='rgba(142,84,63,'+(.012+rand()*.024)+')';g.beginPath();g.arc(rand()*256,rand()*256,r,r*.65,0,Math.PI*2);g.fill();}
  }else if(kind==='hair'){
    for(let i=0;i<520;i++){const x=rand()*256;g.strokeStyle='rgba(22,18,17,'+(.035+rand()*.08)+')';g.lineWidth=.5+rand();g.beginPath();g.moveTo(x,rand()*256);g.bezierCurveTo(x-5,90,x+7,160,x-3,256);g.stroke();}
  }else if(kind==='leather'){
    for(let i=0;i<1100;i++){g.fillStyle='rgba(25,20,18,'+(.018+rand()*.06)+')';g.beginPath();g.arc(rand()*256,rand()*256,.4+rand()*1.3,0,Math.PI*2);g.fill();}
  }
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(1.6,1.6);tex.anisotropy=8;tex.needsUpdate=true;cache.set(key,tex);return tex;
}

export function textureResidentModel(root,name){
  const profile=apparelFor(name);
  root.traverse(o=>{
    if(!o.isMesh)return;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    for(const m of mats){
      const n=m.name||'';
      if(['Coat','Shirt','Pants','Apron'].includes(n))m.map=textureCanvas('cloth',profile.pattern);
      // Keep faces and hair as smooth, bold game art; noisy pores and strand maps caused uncanny detail.
      else if(n==='Skin'||n==='Hair')m.map=null;
      else if(n==='Shoe')m.map=textureCanvas('leather');
      if(m.map){m.map.needsUpdate=true;m.roughness=Math.max(m.roughness||0,.82);m.needsUpdate=true;}
    }
    o.castShadow=true;o.receiveShadow=true;
  });
  return root;
}

export function fabricMaterial(name,color,pattern,roughness=.9){
  const material=new THREE.MeshStandardMaterial({name,color,roughness,map:textureCanvas('cloth',pattern)});return material;
}
export function surfaceMaterial(name,color,kind,roughness=.8){return new THREE.MeshStandardMaterial({name,color,roughness,map:textureCanvas(kind)});}
export {apparelFor};
