export const defaults = Object.freeze({thumbHold:500,okHold:700,swipeDistance:0.18,swipeVelocity:0.65,swipeVertical:0.10,swipeWindow:400,swipeCooldown:700});
export const limits = {thumbHold:[100,3000],okHold:[100,3000],swipeDistance:[0.05,0.6],swipeVelocity:[0.1,3],swipeVertical:[0.02,0.4],swipeWindow:[300,500],swipeCooldown:[200,3000]};
export function sanitize(s={}) {return Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,Number.isFinite(s[k])?Math.max(limits[k][0],Math.min(limits[k][1],s[k])):v]));}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function angle(a,b,c){const u=[a.x-b.x,a.y-b.y,a.z-b.z],v=[c.x-b.x,c.y-b.y,c.z-b.z];return Math.acos(Math.max(-1,Math.min(1,u.reduce((s,x,i)=>s+x*v[i],0)/(Math.hypot(...u)*Math.hypot(...v)||1))))*180/Math.PI;}
export function classify(raw,aspect=1){
  const p=raw.map(v=>({x:v.x*aspect,y:v.y,z:v.z*aspect}));
  const scale=Math.max(dist(p[0],p[9]),dist(p[5],p[17]),0.001);
  const extended=(m,j,t)=>angle(p[m],p[j],p[t])>155&&dist(p[t],p[0])>dist(p[j],p[0])*1.12;
  const fingers=[[5,6,8],[9,10,12],[13,14,16],[17,18,20]].map(a=>extended(...a));
  const pinch=dist(p[4],p[8])/scale;
  const thumb=angle(p[1],p[2],p[4])>150&&dist(p[4],p[0])>dist(p[3],p[0])*1.1&&p[4].y<p[3].y-0.12*scale&&p[4].y<p[0].y-0.35*scale;
  const gesture=pinch<0.25&&fingers.slice(1).every(Boolean)?'OK':thumb&&fingers.every(v=>!v)?'THUMBS UP':'NONE';
  const ids=[0,5,9,13,17];
  return {gesture,pinch,palm:{x:1-ids.reduce((s,i)=>s+raw[i].x,0)/5,y:ids.reduce((s,i)=>s+raw[i].y,0)/5}};
}
export class TriggerEngine {
  constructor(settings=defaults){this.settings=sanitize(settings);this.reset();}
  reset(){this.history=[];this.lastTime=null;this.candidate='NONE';this.since=0;this.locks={};this.until=0;this.swipeLocked=false;this.stillSince=null;}
  update({gesture='NONE',palm=null}={},now){
    if(this.lastTime!==null&&(now-this.lastTime>200||now<this.lastTime)){this.history=[];this.candidate='NONE';}
    this.lastTime=now;
    const s=this.settings;
    for(const g of ['THUMBS UP','OK']) if(gesture!==g)delete this.locks[g];
    if(gesture!==this.candidate){this.candidate=gesture;this.since=now;}
    let dx=0,dy=0,vx=0,vy=0,action=null;
    if(palm){
      this.history.push({...palm,t:now});this.history=this.history.filter(p=>now-p.t<=s.swipeWindow);
      let a=this.history[0];
      // Search within the window so time spent stationary does not dilute a new swipe.
      for(const q of this.history){const dt=(now-q.t)/1000;if(dt>=0.1&&Math.abs(palm.x-q.x)>=s.swipeDistance&&Math.abs((palm.x-q.x)/dt)>=s.swipeVelocity){a=q;break;}}
      const dt=(now-a.t)/1000;dx=palm.x-a.x;dy=palm.y-a.y;if(dt>0){vx=dx/dt;vy=dy/dt;}
      const recent=this.history.filter(p=>now-p.t<=180);
      const quiet=recent.length>=2&&now-recent[0].t>=100&&Math.max(...recent.map(p=>p.x))-Math.min(...recent.map(p=>p.x))<0.035;
      if(this.swipeLocked&&now>=this.until&&quiet){this.swipeLocked=false;this.history=[{...palm,t:now}];dx=dy=vx=vy=0;}
    }else{this.history=[];this.candidate='NONE';if(now>=this.until)this.swipeLocked=false;}
    const hold=palm?now-this.since:0,target=gesture==='THUMBS UP'?s.thumbHold:gesture==='OK'?s.okHold:0;
    const swipeCandidate=!target&&Math.abs(dx)>0.04&&Math.abs(vx)>0.2;
    let state=now<this.until?'COOLDOWN':this.locks[gesture]||this.swipeLocked?'RE-ARM':target||swipeCandidate?'CANDIDATE':'IDLE';
    if(now>=this.until&&palm){
      if(target&&!this.locks[gesture]&&hold>=target){action=gesture==='OK'?'END_SLIDESHOW':'START_SLIDESHOW';this.locks[gesture]=true;this.until=now+1000;}
      else if(!target&&!this.swipeLocked&&this.history.length>2&&now-this.history[0].t>=100&&Math.abs(dx)>=s.swipeDistance&&Math.abs(vx)>=s.swipeVelocity&&Math.max(...this.history.map(p=>p.y))-Math.min(...this.history.map(p=>p.y))<=s.swipeVertical){action=dx>0?'NEXT_SLIDE':'PREVIOUS_SLIDE';this.swipeLocked=true;this.until=now+s.swipeCooldown;}
    }
    if(target)this.history=palm?[{...palm,t:now}]:[];
    if(action){state='TRIGGER';this.history=[];}
    return {action,state,candidate:swipeCandidate?(dx>0?'RIGHT SWIPE':'LEFT SWIPE'):this.candidate,hold,target,dx,dy,vx,vy,cooldown:Math.max(0,this.until-now)};
  }
}
