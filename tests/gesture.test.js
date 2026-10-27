import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TriggerEngine,sanitize,defaults,classify} from '../web/gesture.js';
const sample=(gesture='NONE',x=.3,y=.5)=>({gesture,palm:{x,y}});
function hold(e,g,end,start=0){let r;for(let t=start;t<end;t+=50)r=e.update(sample(g),t);return e.update(sample(g),end);}
for(const [g,ms,action] of [['THUMBS UP',500,'START_SLIDESHOW'],['OK',700,'END_SLIDESHOW']]){
  test(`${g}: boundary, one shot, cooldown and re-arm`,()=>{
    const e=new TriggerEngine();assert.equal(hold(e,g,ms-1).action,null);assert.equal(e.update(sample(g),ms).action,action);
    for(let t=ms+1;t<3000;t+=50)assert.equal(e.update(sample(g),t).action,null);
    e.update(sample(),3000);assert.equal(hold(e,g,3100+ms,3100).action,action);
  });
  test(`${g}: tracking loss breaks continuous hold`,()=>{const e=new TriggerEngine();hold(e,g,ms-50);e.update({},ms);assert.equal(e.update(sample(g),ms+50).action,null);assert.equal(e.update(sample(g),ms+350).action,null);});
}
function swipe(e,direction,start=0,yMove=0,distance=.24){const actions=[];for(let i=0;i<=6;i++){const r=e.update(sample('NONE',.5+direction*distance*i/6,.4+yMove*i/6),start+i*50);if(r.action)actions.push(r.action);}return actions;}
test('right swipe sends one next action',()=>assert.deepEqual(swipe(new TriggerEngine(),1),['NEXT_SLIDE']));
test('left swipe sends one previous action',()=>assert.deepEqual(swipe(new TriggerEngine(),-1),['PREVIOUS_SLIDE']));
test('small jitter does not fire',()=>assert.deepEqual(swipe(new TriggerEngine(),1,0,0,.03),[]));
test('vertical motion rejected',()=>assert.deepEqual(swipe(new TriggerEngine(),1,0,.3),[]));
test('vertical excursion returning to baseline rejected',()=>{const e=new TriggerEngine();let actions=[];for(let i=0;i<7;i++){const r=e.update(sample('NONE',.3+i*.04,.4+(i===3?.3:0)),i*50);if(r.action)actions.push(r.action);}assert.deepEqual(actions,[]);});
test('swipe cooldown, remaining trajectory, stationary re-arm',()=>{const e=new TriggerEngine();assert.equal(swipe(e,1).length,1);assert.deepEqual(swipe(e,-1,350),[]);for(let t=700;t<1300;t+=50)assert.equal(e.update(sample('NONE',.5+t/3000),t).action,null);for(let t=1300;t<=1600;t+=50)e.update(sample('NONE',.5),t);assert.equal(swipe(e,1,1650).length,1);});
test('static gesture suppresses swipe',()=>{const e=new TriggerEngine();for(let i=0;i<7;i++)assert.equal(e.update(sample('OK',.2+i*.05),i*50).action,null);});
test('static release during cooldown does not fire early',()=>{const e=new TriggerEngine();hold(e,'THUMBS UP',500);e.update(sample(),600);assert.equal(hold(e,'THUMBS UP',1200,700).action,null);assert.equal(hold(e,'THUMBS UP',1500,1250).action,'START_SLIDESHOW');});
test('invalid persisted settings sanitized',()=>{assert.deepEqual(sanitize({}),defaults);assert.equal(sanitize({thumbHold:NaN}).thumbHold,500);assert.equal(sanitize({swipeWindow:10000}).swipeWindow,500);});
test('palm coordinates always follow mirrored screen',()=>{const p=Array.from({length:21},()=>({x:.2,y:.4,z:0}));const r=classify(p);assert.equal(r.palm.x,.8);assert.equal(r.gesture,'NONE');});
function fixture(ok=false){const p=Array.from({length:21},()=>({x:.5,y:.6,z:0}));p[0]={x:.5,y:.9,z:0};for(const m of [5,9,13,17]){const x=.5+(m-5)*.015;p[m]={x,y:.6,z:0};p[m+1]={x,y:.4,z:0};p[m+2]={x,y:.5,z:0};p[m+3]={x,y:ok&&m!==5?.2:.7,z:0};}p[1]={x:.43,y:.75,z:0};p[2]={x:.4,y:.6,z:0};p[3]={x:.4,y:.4,z:0};p[4]=ok?{...p[8],x:p[8].x+.01}:{x:.4,y:.2,z:0};return p;}
test('thumb geometry works for both mirrored hands',()=>{const p=fixture();assert.equal(classify(p).gesture,'THUMBS UP');assert.equal(classify(p.map(q=>({...q,x:1-q.x}))).gesture,'THUMBS UP');});
test('OK pinch is scale invariant',()=>{const p=fixture(true);assert.equal(classify(p).gesture,'OK');assert.equal(classify(p.map(q=>({x:q.x*.5+.2,y:q.y*.5+.2,z:q.z*.5}))).gesture,'OK');});
test('thumb pointing down rejected',()=>{assert.equal(classify(fixture().map(q=>({...q,y:1-q.y}))).gesture,'NONE');});
