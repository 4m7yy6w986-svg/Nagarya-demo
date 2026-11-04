const svgNS='http://www.w3.org/2000/svg';
const makeSvg=(tag,attrs)=>{const el=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el;};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
function family(p) {
  const n=p.name;
  if(n.includes('מגש'))return 'tray';
  if(/Door|דלת|חזית/.test(n))return 'door';
  if(n.includes('חיבור גב'))return 'rail';
  if(n.includes('גב'))return 'back';
  if(/דופן/.test(n))return 'side';
  if(/מחיצה/.test(n))return 'divider';
  if(/מדף/.test(n))return 'shelf';
  if(/עליון/.test(n)&&!n.includes('סרגל'))return 'top';
  if(/תחתון/.test(n))return 'bottom';
  if(/סוקל|סרגל/.test(n))return 'plinth';
  return 'misc';
}
// The reports describe cut blanks, not assembly transforms. Keep nominal dimensions,
// and place the boards by function. The original PDF is the workshop reference.
function boards(unit) {
  const {w,h,d,parts}=unit, groups=parts.map(family);
  const trays=[...new Set(parts.filter((_,i)=>groups[i]==='tray').map(p=>p.name.match(/\d+/)?.[0]||''))].sort((a,b)=>+a-+b);
  const count=g=>groups.filter(x=>x===g).length;
  const seen={}, traySides=new Map();
  return parts.map((p,i)=>{
    const g=groups[i],idx=seen[g]||0;seen[g]=idx+1;
    const t=p.t||Math.min(w,h,d)*.025,L=p.l,W=p.w;
    let size=[L,t,W],pos=[0,0,0],vec=[0,1,0];
    const side=p.name.includes('שמאל')?-1:p.name.includes('ימ')?1:idx%2===0?-1:1;
    if(g==='side'){size=[t,L,W];pos=[side*(w/2-t/2),L/2,0];vec=[side*(1+idx*.10),.12,0];}
    else if(g==='divider'){size=[t,L,W];pos=[0,L/2,0];vec=[.2,.55,.35];}
    else if(g==='back'){size=[W,L,t];pos=[0,L/2,-d/2+t/2];vec=[0,.1,-1-idx*.24];}
    else if(g==='top'||g==='bottom'){const top=g==='top';pos=[0,top?h-t/2:t/2,0];vec=[0,top?1.2:-1,0];}
    else if(g==='shelf'){
      const start=trays.length?Math.min(h*.48,trays.length*180):0;
      pos=[0,start+(h-start)*(idx+1)/(count(g)+1),0];vec=[0,(idx+1)/(count(g)+1)-.5,.7+idx*.36];
    } else if(g==='door'){
      const sign=/1A-L/.test(p.name)?-1:/1A-R/.test(p.name)?1:0;
      size=[W,L,t];pos=[sign*(w/2-W/2),h-L/2,d/2+t/2];vec=[sign*.65,.05,1.4];
    } else if(g==='plinth'||g==='rail'){size=[Math.max(W,L),Math.min(W,L),t];pos=[0,g==='rail'?h*.75:size[1]/2,g==='rail'?-d/2:d/2];vec=[0,-.75,.65+idx*.35];}
    else if(g==='tray'){
      const key=p.name.match(/\d+/)?.[0]||'',level=trays.indexOf(key);
      const base=Math.min(h/(trays.length+1),(h<500?55:90))+level*Math.min(190,h/(trays.length+1));
      vec=[0,level*.22,1+level*.35];
      if(p.name.includes('צד')){const s=traySides.has(key)?1:-1;traySides.set(key,true);size=[t,W,L];pos=[s*(w/2-30),base+W/2,0];vec[0]=s*.75;}
      else if(p.name.includes('תחתית')){size=[L,t,W];pos=[0,base,0];vec[1]-=.4;}
      else {const back=p.name.includes('גב'),cover=p.name.includes('ציפוי');size=[L,W,t];pos=[0,base+W/2,back?-d*.42:d*.43+(cover?t:0)];vec[2]+=back?-.4:cover?1.2:.7;}
    } else {pos=[0,h*(idx+1)/(count(g)+1),0];vec=[.4,.1,1+idx*.4];}
    return {i,size,pos,vec,group:g};
  });
}
const palettes={side:'#bca17c',back:'#d5c7af',door:'#c1c6b5',tray:'#d7b98d',shelf:'#e1cda4',top:'#d0b68b',bottom:'#cbb287',plinth:'#cab78d',divider:'#bda07c',rail:'#bea98c',misc:'#d4c6b0'};
function shade(hex,brightness){return 'rgb('+[1,3,5].map(pos=>Math.round(clamp(parseInt(hex.slice(pos,pos+2),16)*brightness,0,255))).join(',')+')';}
const surfaces=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]];
export function setupModel(svg,select) {
  let unit=null, pieces=[], spread=0, chosen=-1,yaw=.54,pitch=.28,zoom=1,drag=null;
  function draw(){
    if(!unit)return;const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const faces=[],points=[],scaleOut=Math.min(Math.max(unit.w,unit.h)*.33,500);
    for(const piece of pieces){
      const center=piece.pos.map((v,k)=>v+spread*piece.vec[k]*scaleOut);
      const vertices=Array.from({length:8},(_,n)=>{
        const [x,y,z]=center.map((v,k)=>v+piece.size[k]*((n>>k)&1?.5:-.5));
        const front=x*sy+z*cy;
        return [x*cy-z*sy,-y*cp+front*sp,y*sp+front*cp];
      });points.push(...vertices);
      surfaces.forEach((face,k)=>{const v=face.map(i=>vertices[i]);faces.push({i:piece.i,v,depth:v.reduce((n,p)=>n+p[2],0)/4,color:shade(piece.i===chosen?'#45b69b':palettes[piece.group], [.82,.94,.68,1,.77,.89][k])});});
    }
    svg.replaceChildren();
    if(!points.length){const text=makeSvg('text',{x:360,y:215,'text-anchor':'middle',fill:'#435b4c'});text.textContent='אין חלקים מזוהים בדוח החיתוך';svg.append(text);return;}
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
    const scale=Math.min(637/(x1-x0||1),360/(y1-y0||1))*zoom;
    const project=p=>[360+(p[0]-(x0+x1)/2)*scale,230+(p[1]-(y0+y1)/2)*scale].map(v=>v.toFixed(2)).join(',');
    const fragment=document.createDocumentFragment();
    faces.sort((a,b)=>a.depth-b.depth).forEach(f=>fragment.append(makeSvg('polygon',{points:f.v.map(project).join(' '),fill:f.color,stroke:f.i===chosen?'#144e42':'#635b49','stroke-width':f.i===chosen?1.9:.95,'stroke-linejoin':'round','data-piece':f.i})));
    svg.append(fragment);
  }
  svg.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw,pitch,i:e.target.closest('[data-piece]')?.dataset.piece};svg.setPointerCapture(e.pointerId);});
  svg.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;yaw=drag.yaw+(e.clientX-drag.x)*.013;pitch=clamp(drag.pitch-(e.clientY-drag.y)*.009,-1.18,1.18);draw();});
  svg.addEventListener('pointerup',e=>{if(drag?.id!==e.pointerId)return;const tap=Math.hypot(drag.x-e.clientX,drag.y-e.clientY)<5&&drag.i!==undefined;const i=Number(drag.i);drag=null;if(tap)select(i);});
  svg.addEventListener('pointercancel',()=>drag=null);
  return {unit(u){unit=u;pieces=boards(u);chosen=-1;zoom=1;yaw=.54;pitch=.28;draw();},spread(n){spread=n/100;draw();},highlight(i){chosen=i;draw();},rotate(d){yaw+=d;draw();},zoom(f){zoom=clamp(zoom*f,.65,2.8);draw();},reset(){yaw=.54;pitch=.28;zoom=1;draw();}};
}
