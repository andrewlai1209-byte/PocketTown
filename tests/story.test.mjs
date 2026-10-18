import test from 'node:test';
import assert from 'node:assert/strict';
import {Story} from '../src/story/story.js';
import {importStory,newStory,QUESTS,readStory,roll,STORY_KEY} from '../src/story/state.js';
import {PLACES} from '../src/data/town.js';

function harness(){
  const story=Object.create(Story.prototype);
  story.state=newStory();
  story.dialog={hidden:false,insertAdjacentHTML(){}};
  story.app={ui:{toast(){}},game:{citizens:[]},world:{}};
  story.saved=[];
  story.save=()=>story.saved.push(JSON.stringify(story.state));
  story.draw=()=>{};
  story.questFlash=type=>{story.lastFlash=type;};
  story.message=(title,text,actions)=>{story.lastDialog={title,text,actions};};
  return story;
}

function localStorageStub(){
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};
  return values;
}

test('all fifty chapters have valid destinations and advance exactly once into a saved ending',()=>{
  assert.equal(QUESTS.length,50);
  const placeNames=new Set(PLACES.map(place=>place.name));
  assert.ok(QUESTS.every(([title,description,destination,objective])=>title&&description&&objective&&placeNames.has(destination)));
  const story=harness();
  for(let stage=0;stage<QUESTS.length;stage++){
    assert.equal(story.state.stage,stage,`chapter ${stage+1} starts in order`);
    story.target=()=>({kind:'place',name:QUESTS[stage][2],x:story.state.x,z:story.state.z});
    story.interact();
    assert.ok(story.lastDialog.actions.some(action=>action.startsWith('objective:')),`chapter ${stage+1} offers its objective at the right destination`);
    story.act('objective');
    assert.deepEqual(story.state.pendingChoice,{stage});
    assert.equal(story.completeObjective(),false,'a completed objective cannot be claimed twice');
    const action=stage===1?'choice-deliver':'choice-kind';
    assert.equal(story.resolveChoice(action),undefined);
    if(stage<QUESTS.length-1){
      assert.equal(story.state.stage,stage+1);
      assert.equal(story.state.ended,false);
      assert.equal(story.resolveChoice(action),false,'a choice cannot be submitted twice');
    }
  }
  assert.equal(story.state.stage,49);
  assert.equal(story.state.ended,true);
  assert.equal(story.state.pendingChoice,null);
  assert.match(story.state.ending,/shared table/i);
  assert.equal(story.lastDialog.title,'Your winter story is complete');
  assert.deepEqual(JSON.parse(story.saved.at(-1)).ended,true);
});

test('a saved pending choice resumes at the same chapter and imports without changing the save format',()=>{
  const values=localStorageStub();
  const state=newStory();state.stage=23;state.pendingChoice={stage:23};state.seed=184;
  importStory(JSON.stringify(state));
  const restored=readStory();
  assert.equal(values.has(STORY_KEY),true);
  assert.equal(restored.version,1);
  assert.equal(restored.stage,23);
  assert.deepEqual(restored.pendingChoice,{stage:23});
  const resumed=harness();resumed.state=restored;
  resumed.contact={name:'Sage'};
  resumed.showChoice(QUESTS[23],[['kind','Work with the neighbours',8]]);
  assert.match(resumed.lastDialog.text,/CHAPTER 24 COMPLETE/);
});

test('legacy v1 saves fill optional fields and final-stage saves remain continuable',()=>{
  const values=localStorageStub();
  const legacy={version:1,stage:6,health:80,x:0,z:0,bag:{},clues:[],log:['Old save'],relations:{}};
  values.set(STORY_KEY,JSON.stringify(legacy));
  const restored=readStory();
  assert.equal(restored.stage,6);
  assert.equal(restored.food,100);
  assert.equal(restored.seed,0);
  const finished={...newStory(),stage:50,ended:true,ending:'The town chose together.'};
  const final=importStory(JSON.stringify(finished));
  assert.equal(final.stage,49);
  assert.equal(final.ended,true);
  assert.equal(readStory().ending,'The town chose together.');
});

test('the informant betrayal branch schedules its delayed ambush and records evidence',()=>{
  const story=harness();story.state.stage=44;story.state.pendingChoice={stage:44};story.state.seed=0;story.contact={name:'Sage'};
  story.resolveChoice('choice-conceal');
  assert.equal(story.state.stage,45);
  assert.equal(story.state.betrayals,1);
  assert.equal(story.state.risk,14000);
  assert.equal(story.state.pendingChoice,null);
  assert.match(story.lastDialog.text,/accomplice may be waiting/i);
});

test('a delayed ambush resolves once, damages health, and adds its signed evidence',()=>{
  const story=harness();story.state.risk=1;story.state.health=90;
  story.resolveAmbush();
  assert.equal(story.state.risk,0);
  assert.equal(story.state.health,45);
  assert.ok(story.state.clues.includes('signed accomplice note'));
  assert.equal(story.lastDialog.title,'Betrayed on the lane');
  assert.equal(story.resolveAmbush(),false);
  assert.equal(story.state.health,45);
  assert.equal(story.state.clues.filter(clue=>clue==='signed accomplice note').length,1);
});

test('the final chapter records a distinct replayable ending for each town choice',()=>{
  const endings=[];
  for(const action of ['choice-kind','choice-bargain','choice-conceal']){
    const story=harness();story.state.stage=49;story.state.pendingChoice={stage:49};story.state.seed=712;
    story.resolveChoice(action);endings.push(story.state.ending);
    assert.equal(story.state.ended,true);
    assert.equal(story.state.stage,49);
    assert.equal(story.state.pendingChoice,null);
  }
  assert.equal(new Set(endings).size,3);
});

test('choices use the saved seed and reject invalid or stale submissions',()=>{
  const first=newStory();first.seed=712;
  const second=JSON.parse(JSON.stringify(first));
  assert.equal(roll(first),roll(second));
  assert.equal(roll(first),roll(second));
  const story=harness();story.state.pendingChoice={stage:0};
  assert.equal(story.resolveChoice('choice-expose'),false);
  assert.equal(story.state.stage,0);
  story.state.pendingChoice={stage:1};
  assert.equal(story.resolveChoice('choice-kind'),false);
  assert.equal(story.state.stage,0);
});

test('replay creates a fresh chapter one life while preserving the schema',async()=>{
  const story=harness();story.state.ended=true;story.state.stage=49;story.state.ending='Finished';
  let left=false;story.leave=()=>{left=true;};story.start=async resume=>{story.state=resume?readStory():newStory();};
  await story.act('new');
  assert.equal(left,true);
  assert.equal(story.state.stage,0);
  assert.equal(story.state.ended,false);
  assert.equal(story.state.version,1);
});
