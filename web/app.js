import {defaults,limits,sanitize,classify,TriggerEngine} from './gesture.js';
const $=id=>document.getElementById(id),base='http://127.0.0.1:8765';
let settings;try{settings=sanitize(JSON.parse(localStorage.getItem('gesture-settings')||'{}'));}catch{settings={...defaults};}
const engine=new TriggerEngine(settings);
let detector,stream,running=false,connected=false,busy=false,lastVideo=-1,flashUntil=0,lastHand=null;
const keys={START_SLIDESHOW:'F5',NEXT_SLIDE:'RIGHT ARROW',PREVIOUS_SLIDE:'LEFT ARROW',END_SLIDESHOW:'ESC'};
const labels={thumbHold:'THUMBS UP · Hold Time (ms)',okHold:'OK · Hold Time (ms)',swipeDistance:'SWIPE · Minimum Distance (画面幅)',swipeVelocity:'SWIPE · Minimum Velocity (画面幅/s)',swipeVertical:'SWIPE · Maximum Vertical Deviation (画面高)',swipeWindow:'SWIPE · Detection Window (ms)',swipeCooldown:'SWIPE · Cooldown (ms)'};
function renderSettings(){
  $('settings').replaceChildren();for(const [k,label] of Object.entries(labels)){
    const wrap=document.createElement('label');wrap.className='setting';wrap.textContent=label;
    const output=document.createElement('output');output.value=settings[k];const input=document.createElement('input');input.type='range';input.min=limits[k][0];input.max=limits[k][1];input.step=k.includes('Hold')||k==='swipeWindow'||k==='swipeCooldown'?10:0.01;input.value=settings[k];
    input.oninput=()=>{settings[k]=Number(input.value);output.value=input.value;engine.settings=sanitize(settings);engine.reset();save();};wrap.append(output,input);$('settings').append(wrap);
  } updateLabels();
}
function updateLabels(){$('thumb-label').textContent=settings.thumbHold;$('ok-label').textContent=settings.okHold;}
function save(){try{localStorage.setItem('gesture-settings',JSON.stringify(settings));}catch{$('message').textContent='設定を保存できません。このセッションでは有効です。';}updateLabels();}
$('reset').onclick=()=>{settings={...defaults};engine.settings=settings;engine.reset();save();renderSettings();};renderSettings();
function bridgeState(ok,text){connected=ok;$('bridge').textContent=text;$('mode').textContent=ok?'LIVE MODE':'DEMO MODE';}
async function request(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'X-Controller-Token':$('token').value,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(2000),targetAddressSpace:'loopback'});const data=await r.json();if(!r.ok)throw Error(data.error||`HTTP ${r.status}`);return data;}
$('connect').onclick=async()=>{try{const d=await request('/health');bridgeState(true,d.dry_run?'CONNECTED / DRY RUN':'CONNECTED');}catch(e){bridgeState(false,'NOT CONNECTED');$('delivery').textContent='接続失敗: '+e.message;}};
$('token').oninput=()=>bridgeState(false,'NOT CONNECTED');
setInterval(async()=>{if(!connected||busy)return;try{await request('/health');}catch{bridgeState(false,'NOT CONNECTED');}},4000);
async function deliver(action){
  $('action').textContent=action+' / '+keys[action];
  if(!connected){$('delivery').textContent='DEMO MODE / キー送信なし';return;}
  if(busy){$('delivery').textContent='SKIPPED / 前の送信が処理中';return;}busy=true;$('delivery').textContent='SENDING';
  try{const d=await request('/action',{action,id:crypto.randomUUID()});$('delivery').textContent=d.status+' / '+d.key;}
  catch(e){$('delivery').textContent='FAILED / '+e.message+'（自動再送なし）';bridgeState(false,'NOT CONNECTED');}finally{busy=false;}
}
function stop(){running=false;stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;engine.reset();lastHand=null;$('start').disabled=false;$('stop').disabled=true;$('message').textContent='停止しました。';}
$('stop').onclick=stop;window.addEventListener('pagehide',stop);
$('start').onclick=async()=>{
  $('start').disabled=true;$('message').textContent='モデルとカメラを準備中…';
  try{
    if(!detector){const {FilesetResolver,HandLandmarker}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');detector=await HandLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:0.6,minHandPresenceConfidence:0.6,minTrackingConfidence:0.6});}
    stream=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'},audio:false});$('video').srcObject=stream;await $('video').play();engine.reset();lastVideo=-1;running=true;$('stop').disabled=false;$('message').textContent='認識中。PowerPointを最前面にし、この画面が動作を続ける配置にしてください。';requestAnimationFrame(frame);
  }catch(e){stop();$('message').textContent='カメラ / モデル起動失敗: '+e.message;}
};
function frame(now){
  if(!running)return;
  try{
    const video=$('video');if(video.currentTime!==lastVideo){lastVideo=video.currentTime;
      const result=detector.detectForVideo(video,now),p=result.landmarks[0];
      const hand=result.handedness[0]?.[0]?.categoryName;if(hand&&lastHand&&hand!==lastHand)engine.reset();lastHand=hand||null;
      const obs=p?classify(p,video.videoWidth/video.videoHeight):{gesture:'NONE',palm:null,pinch:0};
      const r=engine.update(obs,now);draw(p,obs.palm);
      const gesture=r.action==='NEXT_SLIDE'?'RIGHT SWIPE':r.action==='PREVIOUS_SLIDE'?'LEFT SWIPE':obs.gesture;$('gesture').textContent=gesture;
      if(r.action){flashUntil=now+900;$('flash').textContent=gesture;void deliver(r.action);}else if(now>flashUntil)$('flash').textContent=obs.gesture==='NONE'?'手を1つ映してください':obs.gesture;
      $('debug').textContent=`DETECTED GESTURE: ${gesture}\nCANDIDATE: ${r.candidate}    STATE: ${r.state}\nHOLD TIME: ${Math.round(r.hold)} / ${r.target} ms\nPALM X: ${obs.palm?.x.toFixed(3)??'—'}    PALM Y: ${obs.palm?.y.toFixed(3)??'—'}\nVX: ${r.vx.toFixed(2)}    VY: ${r.vy.toFixed(2)}\nSWIPE DISTANCE: ${r.dx.toFixed(3)}    DIRECTION: ${r.dx>0?'RIGHT':r.dx<0?'LEFT':'—'}\nPINCH DISTANCE: ${obs.pinch.toFixed(3)}\nCOOLDOWN: ${Math.round(r.cooldown)} ms\nBRIDGE STATUS: ${$('bridge').textContent}\nLAST ACTION: ${$('action').textContent}\nDELIVERY: ${$('delivery').textContent}`;
    }
    requestAnimationFrame(frame);
  }catch(e){stop();$('message').textContent='認識エラー: '+e.message;}
}
const connections=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
function draw(p,palm){const c=$('overlay'),v=$('video');c.width=v.videoWidth;c.height=v.videoHeight;const ctx=c.getContext('2d');if(!p||!$('landmarks').checked)return;ctx.strokeStyle='#80e3c3';ctx.lineWidth=2;for(const [a,b] of connections){ctx.beginPath();ctx.moveTo((1-p[a].x)*c.width,p[a].y*c.height);ctx.lineTo((1-p[b].x)*c.width,p[b].y*c.height);ctx.stroke();}for(const q of p){ctx.beginPath();ctx.arc((1-q.x)*c.width,q.y*c.height,4,0,Math.PI*2);ctx.fillStyle='#e9fff7';ctx.fill();}ctx.beginPath();ctx.arc(palm.x*c.width,palm.y*c.height,9,0,Math.PI*2);ctx.fillStyle='#ffbd69';ctx.fill();}

