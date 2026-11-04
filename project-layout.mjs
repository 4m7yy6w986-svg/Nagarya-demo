// Each reference page is read locally. Cabinet Vision may use an earlier numbering
// sequence on a floor plan, and can draw more than one view on an elevation sheet.
export function referencePage(items, doc, page) {
  const captions=items.map(i=>i.str.trim());
  const footer=captions.find(s=>/Room\s*#\s*\d+/i.test(s));if(!footer)return null;
  const tags=[];
  for (const item of items) {
    const hit=item.str.trim().match(/^#\s*(\d+)$/);if(!hit)continue;
    tags.push({id:+hit[1],x:item.transform[4]+item.width/2,y:item.transform[5]+item.height/2,size:item.height});
  }
  if(!tags.length)return null;
  const roomName=footer.match(/[)(]([^()]*[\u0590-\u05ff][^()]*)[)(]/)?.[1]?.trim()||'';
  return {doc,page,tags,roomName,elevation:/Wall\s*#\s*\d+/i.test(footer)};
}
const median=list=>{const a=[...list].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
function orderedWall(units) {
  let edge=0;return units.map(u=>{const x=edge+u.w/2;edge+=u.w;return {id:u.id,x,y:u.h/2};});
}
function elevationWall(units, pages) {
  let best=null;
  for(const ref of pages){
    const tags=new Map();
    for(const t of ref.tags){
      // Where both a plan and a larger front view appear, prefer the larger label.
      if(!tags.has(t.id)||t.size>tags.get(t.id).size)tags.set(t.id,t);
    }
    if(!units.every(u=>tags.has(u.id)))continue;
    const vertical=[],horizontal=[];
    for(const [i,u] of units.entries()){
      for(const v of units.slice(i+1)){
        const a=tags.get(u.id),b=tags.get(v.id),dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
        if(dx<2 && dy>2)vertical.push(dy/((u.h+v.h)/2));
        if(dy<2 && dx>2){
          const between=units.some(other=>{const k=tags.get(other.id);return Math.abs(k.y-a.y)<2 && k.x>Math.min(a.x,b.x)+2 && k.x<Math.max(a.x,b.x)-2;});
          if(!between)horizontal.push(dx/((u.w+v.w)/2));
        }
      }
    }
    const scale=vertical.length?median(vertical):horizontal.length?median(horizontal):1;
    if(!(scale>0))continue;
    const runs=units.map(u=>({id:u.id,x:tags.get(u.id).x/scale,y:tags.get(u.id).y/scale}));
    const minX=Math.min(...runs.map((p,i)=>p.x-units[i].w/2)),minY=Math.min(...runs.map((p,i)=>p.y-units[i].h/2));
    for(const p of runs){p.x-=minX;p.y-=minY;}
    const candidate={runs,ref,score:units.reduce((sum,u)=>sum+tags.get(u.id).size,0)};
    if(!best||best.score<candidate.score)best=candidate;
  }
  return best;
}
function matchFloor(walls, floor) {
  const all=walls.flatMap(w=>w.positions);
  if(floor.tags.length!==all.length || walls.some(w=>!w.placed))return null;
  const tags=new Map(floor.tags.map(t=>[t.id,t]));if(tags.size!==all.length)return null;
  const offset=Math.min(...tags.keys())-Math.min(...all.map(p=>p.id));
  if(!all.every(p=>tags.has(p.id+offset)))return null;
  const fits=[];
  for(const wall of walls){
    const columns=[];
    for(const p of wall.positions){
      const t=tags.get(p.id+offset);
      let column=columns.find(c=>Math.abs(c.x-p.x)<12);
      if(!column){column={x:p.x,markers:[]};columns.push(column);}
      column.markers.push(t);
    }
    columns.sort((a,b)=>a.x-b.x);
    if(columns.length<2)return null;
    for(const c of columns){c.px=median(c.markers.map(t=>t.x));c.pz=median(c.markers.map(t=>-t.y));}
    const first=columns[0],last=columns.at(-1);
    const dx=last.px-first.px,dz=last.pz-first.pz,len=Math.hypot(dx,dz);
    const scale=len/(last.x-first.x);if(!(len>1 && scale>0))return null;
    const ux=dx/len,uz=dz/len;
    for(const c of columns){
      const along=(c.x-first.x)*scale;
      if(Math.hypot(c.px-first.px-along*ux,c.pz-first.pz-along*uz)>Math.max(2,len*.025))return null;
      if(c.markers.some(t=>Math.hypot(t.x-c.px,-t.y-c.pz)>Math.max(5,scale*110)))return null;
    }
    fits.push({wall,first,ux,uz,scale});
  }
  const scale=median(fits.map(f=>f.scale));
  if(fits.some(f=>Math.abs(f.scale/scale-1)>.06))return null;
  const poses=new Map();
  for(const {wall,first,ux,uz} of fits){
    for(const p of wall.positions){poses.set(p.id,{x:first.px/scale+(p.x-first.x)*ux,z:first.pz/scale+(p.x-first.x)*uz,y:p.y,ux,uz});}
  }
  return poses;
}
export function buildLayout(units,references=[]) {
  const rooms=new Map();
  for(const u of units){
    const key=String(u.room||'');if(!rooms.has(key))rooms.set(key,{id:key,name:'',walls:[]});
    const room=rooms.get(key),id=String(u.wall||'');let wall=room.walls.find(w=>w.id===id);
    if(!wall){wall={id,units:[]};room.walls.push(wall);}wall.units.push(u);
  }
  for(const room of rooms.values()){
    room.walls.sort((a,b)=>Number(a.id)-Number(b.id));
    const relevant=references.filter(r=>room.walls.some(w=>w.units.some(u=>u.doc===r.doc)));
    for(const wall of room.walls){
      const match=elevationWall(wall.units,relevant.filter(r=>r.elevation && r.doc===wall.units[0].doc));
      wall.placed=!!match;wall.positions=match?.runs||orderedWall(wall.units);
      if(match?.ref.roomName)room.name=match.ref.roomName;
    }
    if(room.walls.length>1){
      const matches=relevant.filter(r=>!r.elevation).map(r=>matchFloor(room.walls,r)).filter(Boolean);
      if(matches.length===1)room.poses=matches[0];
    }
  }
  return [...rooms.values()];
}
