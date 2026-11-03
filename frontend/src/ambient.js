// The ambient layer from the Alpine design: the contour sphere, click sparks and the cursor.
// Ported verbatim from interviewverse-dashboard.html; it runs once for the whole app.
// The sphere follows the element marked [data-anchor] in the current view (.view.on),
// and setLevel() makes it breathe with the microphone.

let started = false
let micLevel = 0
export function setLevel(level) {
  micLevel = level
}

export function startAmbient() {
if (started) return
started = true
const $=(s,c=document)=>c.querySelector(s), $$=(s,c=document)=>[...c.querySelectorAll(s)];
const lerp=(a,b,t)=>a+(b-a)*t, clamp=(v,a,b)=>Math.min(b,Math.max(a,v)), sm=t=>t*t*(3-2*t);
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
const cs=getComputedStyle(document.documentElement), tok=n=>cs.getPropertyValue(n).trim();
const hex=h=>{h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]};
const C={ink:hex(tok('--ink')),moss:hex(tok('--moss')),lichen:hex(tok('--lichen')),glacier:hex(tok('--glacier')),snow:hex(tok('--snow')),glow:hex(tok('--alpenglow'))};
const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
const TAU=Math.PI*2, NS='http://www.w3.org/2000/svg';
let W=innerWidth,H=innerHeight,DPR=Math.min(devicePixelRatio||1,2);
const mouse={x:0,y:0,tx:0,ty:0,px:-999,py:-999,on:0,ton:0};
let T=0, introT=1;

/* ---------- orb (the sphere) ---------- */
const cv=$('#orb'), cx=cv.getContext('2d');
function sizeCanvas(c){c.width=Math.round(W*DPR);c.height=Math.round(H*DPR)}
sizeCanvas(cv);
const fxc=$('#fx'), fxx=fxc.getContext('2d'); sizeCanvas(fxc);
const NL=26, SEG=84, NM=20, HS=42;
const CT=new Float32Array(SEG+1), ST=new Float32Array(SEG+1);
for(let k=0;k<=SEG;k++){CT[k]=Math.cos(k/SEG*TAU);ST[k]=Math.sin(k/SEG*TAU)}
const CP=new Float32Array(HS+1), SP=new Float32Array(HS+1);
for(let k=0;k<=HS;k++){const p=-Math.PI/2+Math.PI*k/HS;CP[k]=Math.cos(p);SP[k]=Math.sin(p)}
const NP=innerWidth<760?300:620, PA=new Float32Array(NP*5);
function seedP(i,full){const o=i*5;PA[o]=Math.asin(Math.random()*2-1);PA[o+1]=Math.random()*TAU;PA[o+2]=full?Math.random():0;PA[o+3]=(.03+Math.random()*.09)*(Math.random()<.5?-1:1);PA[o+4]=Math.random()<.08?1:0}
for(let i=0;i<NP;i++)seedP(i,true);
const ORBITS=[{r:1.44,inc:1.22,node:.3,sp:.42,n:2},{r:1.74,inc:.5,node:2.2,sp:-.27,n:1}];
let cur={x:.72,y:.5,r:.38,amp:.1,m:0,alpha:1,warm:0,tilt:.35}, pulse=0;
let fcY,fsY,fcX,fsX,fX,fY,fP,ft=0,fR=1,fAmp=.1;
let px=0,py=0,pz=0;
function height(x,y,z,t){
  const a=Math.sin(x*3.1+t*.5)*Math.cos(y*2.7-t*.4)+Math.sin(z*3.7+x*1.3+t*.35)*.7;
  const b=Math.sin(x*7.3-y*5.1+t*.8)*Math.cos(z*6.7+t*.6)*.35;
  return(a+b)/2.05;
}
function project(ux,uy,uz,rad){
  const x=ux*rad,y=uy*rad,z=uz*rad;
  const x1=x*fcY+z*fsY, z1=-x*fsY+z*fcY;
  const y1=y*fcX-z1*fsX, z2=y*fsX+z1*fcX;
  const s=fP/(fP-z2);
  px=fX+x1*s; py=fY+y1*s; pz=z2;
}
function surf(ux,uy,uz){
  const h=height(ux,uy,uz,ft);
  let rad=fR*(1+fAmp*h+pulse*.09*Math.sin(uy*9-ft*9));
  project(ux,uy,uz,rad);
  if(mouse.on>.01){
    const dx=px-mouse.px, dy=py-mouse.py, d2=(dx*dx+dy*dy)/(fR*fR*.05);
    if(d2<9){rad*=1+.17*mouse.on*Math.exp(-d2)*(pz>-fR*.2?1:.3);project(ux,uy,uz,rad)}
  }
}
function drawOrb(t,dt){
  cx.setTransform(DPR,0,0,DPR,0,0); cx.clearRect(0,0,W,H);
  const e=1-Math.pow(1-introT,4);
  const mn=Math.min(W,H), mob=W<760;
  const R=cur.r*mn*(mob?1.12:1)*(.2+.8*e), a=cur.alpha*e*(mob?.62:1);
  if(R<3||a<.01)return;
  const X=(mob?.5+(cur.x-.5)*.35:cur.x)*W, Y=cur.y*H;
  const rotY=t*.13*(1+(1-introT)*9)+mouse.x*.55, rotX=cur.tilt+mouse.y*.28;
  fcY=Math.cos(rotY);fsY=Math.sin(rotY);fcX=Math.cos(rotX);fsX=Math.sin(rotX);fX=X;fY=Y;fP=R*4.2;ft=t;fR=R;fAmp=cur.amp;
  pulse*=Math.exp(-dt*1.5);
  const m=cur.m;

  // glow + warm rim
  let g=cx.createRadialGradient(X,Y,R*.2,X,Y,R*2);
  g.addColorStop(0,rgba(C.glacier,.12*a));g.addColorStop(.45,rgba(C.moss,.1*a));g.addColorStop(1,rgba(C.moss,0));
  cx.fillStyle=g;cx.fillRect(X-R*2,Y-R*2,R*4,R*4);
  if(cur.warm>.01){
    g=cx.createRadialGradient(X-R*.3,Y+R*.5,R*.6,X-R*.1,Y+R*.3,R*1.35);
    g.addColorStop(0,rgba(C.glow,0));g.addColorStop(.78,rgba(C.glow,.17*cur.warm*a));g.addColorStop(1,rgba(C.glow,0));
    cx.fillStyle=g;cx.fillRect(X-R*2,Y-R*2,R*4,R*4);
  }

  // contour paths
  const pF=new Path2D(),pB=new Path2D(),pI=new Path2D(),pMF=new Path2D(),pMB=new Path2D();
  if(m<.98){
    for(let i=1;i<=NL;i++){
      const phi=-Math.PI/2+Math.PI*i/(NL+1), cp=Math.cos(phi), sp=Math.sin(phi);
      const front=(i%5===0)?pI:pF; let lx=0,ly=0,lz=0,last=-1;
      for(let k=0;k<=SEG;k++){
        surf(cp*CT[k],sp,cp*ST[k]);
        if(k>0){const c=(pz+lz)>0?1:0,p=c?front:pB;if(c!==last)p.moveTo(lx,ly);p.lineTo(px,py);last=c}
        lx=px;ly=py;lz=pz;
      }
    }
  }
  if(m>.02){
    for(let i=0;i<NM;i++){
      const th=i/NM*TAU, ct=Math.cos(th), st=Math.sin(th); let lx=0,ly=0,lz=0,last=-1;
      for(let k=0;k<=HS;k++){
        surf(CP[k]*ct,SP[k],CP[k]*st);
        if(k>0){const c=(pz+lz)>0?1:0,p=c?pMF:pMB;if(c!==last)p.moveTo(lx,ly);p.lineTo(px,py);last=c}
        lx=px;ly=py;lz=pz;
      }
    }
  }
  cx.lineWidth=1;
  cx.strokeStyle=rgba(C.moss,.6*a*(1-m*.7));cx.stroke(pB);
  cx.strokeStyle=rgba(C.moss,.7*a*m);cx.stroke(pMB);
  // dim the far side so the ball reads as solid
  g=cx.createRadialGradient(X,Y,0,X,Y,R*1.06);
  g.addColorStop(0,rgba(C.ink,.5*a));g.addColorStop(.85,rgba(C.ink,.38*a));g.addColorStop(1,rgba(C.ink,0));
  cx.fillStyle=g;cx.beginPath();cx.arc(X,Y,R*1.08,0,TAU);cx.fill();

  // sparks lifting off the surface
  let lastWarm=-1;
  for(let i=0;i<NP;i++){
    const o=i*5; PA[o+2]+=dt*.14; PA[o+1]+=PA[o+3]*dt;
    if(PA[o+2]>1){seedP(i,false);continue}
    const phi=PA[o], th=PA[o+1], life=PA[o+2], cp=Math.cos(phi);
    const ux=cp*Math.cos(th), uy=Math.sin(phi), uz=cp*Math.sin(th);
    const rad=R*(1+cur.amp*height(ux,uy,uz,t)+.025+life*.2);
    project(ux,uy,uz,rad);
    const al=Math.sin(life*Math.PI)*(pz>-R*.25?1:.3)*a*.9;
    if(al<.02)continue;
    const w=PA[o+4]; if(w!==lastWarm){cx.fillStyle=rgba(w?C.glow:C.glacier,1);lastWarm=w}
    cx.globalAlpha=al;cx.fillRect(px-.8,py-.8,w?2.2:1.6,w?2.2:1.6);
  }
  cx.globalAlpha=1;

  cx.strokeStyle=rgba(C.lichen,.62*a*(1-m*.75));cx.stroke(pF);
  cx.strokeStyle=rgba(C.lichen,.7*a*m);cx.stroke(pMF);
  cx.lineWidth=1.7;cx.strokeStyle=rgba(C.glacier,.95*a*(1-m*.5));cx.stroke(pI);

  // orbit rings + satellites
  ORBITS.forEach((o,oi)=>{
    const ci=Math.cos(o.inc),si=Math.sin(o.inc),cn=Math.cos(o.node),sn=Math.sin(o.node);
    const pt=ang=>{const x=Math.cos(ang),z0=Math.sin(ang);const y=-z0*si,z=z0*ci;project(x*cn+z*sn,y,-x*sn+z*cn,R*o.r)};
    const of=new Path2D(),ob=new Path2D();let lx=0,ly=0,lz=0,last=-1;
    for(let k=0;k<=72;k++){pt(k/72*TAU);if(k>0){const c=(pz+lz)>0?1:0,p=c?of:ob;if(c!==last)p.moveTo(lx,ly);p.lineTo(px,py);last=c}lx=px;ly=py;lz=pz}
    cx.lineWidth=1;cx.strokeStyle=rgba(C.lichen,.1*a);cx.stroke(ob);cx.strokeStyle=rgba(C.lichen,.3*a);cx.stroke(of);
    for(let s=0;s<o.n;s++){
      const base=t*o.sp*1.6+s*Math.PI+oi, dir=Math.sign(o.sp);
      for(let q=15;q>=0;q--){
        pt(base-dir*q*.05);const nx=px,ny=py,nz=pz;pt(base-dir*(q+1)*.05);
        cx.globalAlpha=(1-q/16)*.7*a*(nz>0?1:.35);cx.strokeStyle=rgba(oi?C.glow:C.glacier,1);cx.lineWidth=1.6;
        cx.beginPath();cx.moveTo(nx,ny);cx.lineTo(px,py);cx.stroke();
      }
      pt(base);cx.globalAlpha=(pz>0?1:.4)*a;cx.fillStyle=rgba(oi?C.glow:C.glacier,1);
      cx.beginPath();cx.arc(px,py,3,0,TAU);cx.fill();
    }
    cx.globalAlpha=1;
  });
}
const curT={x:-100,y:-100},curP={x:-100,y:-100}, ring=$('.cur-ring'), dotC=$('.cur-dot');
if(fine&&!reduce)document.documentElement.classList.add('has-cursor');
addEventListener('pointermove',e=>{mouse.tx=e.clientX/W*2-1;mouse.ty=e.clientY/H*2-1;mouse.px=e.clientX;mouse.py=e.clientY;mouse.ton=1;curT.x=e.clientX;curT.y=e.clientY},{passive:true});
document.documentElement.addEventListener('pointerleave',()=>{mouse.ton=0});
document.addEventListener('pointerover',e=>{ring.classList.toggle('hov',!!e.target.closest('a,button,.row,.li,.wf'))});
document.addEventListener('pointermove',e=>{const c=e.target.closest&&e.target.closest('.card');if(c){const r=c.getBoundingClientRect();c.style.setProperty('--gx',(e.clientX-r.left)+'px');c.style.setProperty('--gy',(e.clientY-r.top)+'px')}},{passive:true});
const parts=[];let fxDirty=true;
document.addEventListener('click',e=>{const b=e.target.closest('[data-burst]');if(!b)return;pulse=1;const r=b.getBoundingClientRect();const x=e.clientX||r.left+r.width/2,y=e.clientY||r.top+r.height/2;
  for(let i=0;i<60;i++){const a=Math.random()*TAU,s=140+Math.random()*420;parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-150,l:0,life:.8+Math.random()*.8,sz:2+Math.random()*3.2,c:Math.random()<.3?C.glow:(Math.random()<.5?C.glacier:C.snow)})}fxDirty=true});
function drawFx(dt){fxx.setTransform(DPR,0,0,DPR,0,0);fxx.clearRect(0,0,W,H);
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.l+=dt;if(p.l>p.life){parts.splice(i,1);continue}p.vy+=520*dt;p.vx*=1-1.4*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
    fxx.globalAlpha=1-p.l/p.life;fxx.fillStyle=rgba(p.c,1);fxx.save();fxx.translate(p.x,p.y);fxx.rotate(p.l*6);fxx.fillRect(-p.sz/2,-p.sz/2,p.sz,p.sz);fxx.restore()}fxx.globalAlpha=1}

/* ---------- orb anchor ---------- */
function orbTarget(){
  const v=$('.view.on'); if(!v)return null;
  const a=$('[data-anchor]',v);
  if(!a)return {x:.5,y:.4,r:.2,amp:.05,m:0,alpha:0,warm:0,tilt:.3};
  const r=a.getBoundingClientRect(),p=JSON.parse(a.dataset.orb), mn=Math.min(W,H);
  const vis=clamp(1-Math.max(0,-r.bottom+H*.1)/(H*.3),0,1)*clamp((H-r.top)/(H*.25),0,1);
  return {x:(r.left+r.width*parseFloat(a.dataset.ax))/W,y:(r.top+r.height*parseFloat(a.dataset.ay))/H,r:Math.min(r.height,r.width)*parseFloat(a.dataset.ar)/mn,amp:p.amp,m:p.m,alpha:p.alpha*vis,warm:p.warm,tilt:p.tilt};
}

/* ---------- main loop ---------- */
function measure(){W=innerWidth;H=innerHeight;DPR=Math.min(devicePixelRatio||1,2);sizeCanvas(cv);sizeCanvas(fxc)}
let rsT;addEventListener('resize',()=>{clearTimeout(rsT);rsT=setTimeout(measure,150)});
let last=performance.now(), lvl=0;
function loop(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;T+=dt*(reduce?.12:1);
  mouse.x=lerp(mouse.x,mouse.tx,1-Math.exp(-dt*3));mouse.y=lerp(mouse.y,mouse.ty,1-Math.exp(-dt*3));mouse.on=lerp(mouse.on,mouse.ton,1-Math.exp(-dt*5));
  lvl=lerp(lvl,micLevel,.35);
  const tg=orbTarget();
  if(tg){const kk=1-Math.exp(-dt*5),kf=1-Math.exp(-dt*16);cur.x=lerp(cur.x,tg.x,kf);cur.y=lerp(cur.y,tg.y,kf);cur.r=lerp(cur.r,tg.r,kk*1.5);['amp','m','alpha','warm','tilt'].forEach(p=>cur[p]=lerp(cur[p],tg[p],kk));}
  cur.amp+=lvl*.16;if(lvl>.1)pulse=Math.max(pulse,lvl*.9);
  drawOrb(T,dt);
  if(parts.length||fxDirty){drawFx(dt);fxDirty=!!parts.length}
  if(fine){curP.x=lerp(curP.x,curT.x,1-Math.exp(-dt*16));curP.y=lerp(curP.y,curT.y,1-Math.exp(-dt*16));ring.parentElement.style.transform=`translate3d(${curP.x}px,${curP.y}px,0)`;dotC.style.transform=`translate3d(${curT.x-curP.x}px,${curT.y-curP.y}px,0)`}
  requestAnimationFrame(loop);
}

/* ---------- boot ---------- */
cur.x=.8;cur.y=.3;cur.r=.2;cur.alpha=0;
introT=0;
const pre=$('.pre');
const open=()=>{if(pre){pre.classList.add('open');setTimeout(()=>pre.remove(),1000)}const t0=performance.now();(function s(n){introT=clamp((n-t0)/1800,0,1);if(introT<1)requestAnimationFrame(s)})(t0)};
if(reduce){pre&&pre.remove();introT=1}else setTimeout(open,700);
measure();requestAnimationFrame(loop);
}
