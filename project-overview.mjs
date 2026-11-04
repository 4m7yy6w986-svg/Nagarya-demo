import {buildLayout} from './project-layout.mjs';
const ns='http://www.w3.org/2000/svg';
function svg(tag,attributes={}){const el=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,value);return el;}
function dom(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function action(text,fn){const b=dom('button','',text);b.type='button';b.onclick=fn;return b;}
const corners=[[-1,-1,-1],[1,-1,-1],[-1,1,-1],[1,1,-1],[-1,-1,1],[1,-1,1],[-1,1,1],[1,1,1]];
const clamp=(v,low,high)=>Math.min(high,Math.max(low,v));
function projectScene(svgRoot,units,poses,yaw,pitch,width,height,choose,lastId) {
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const project=(x,y,z)=>[x*cy-z*sy,-y*cp+(x*sy+z*cy)*sp,y*sp+(x*sy+z*cy)*cp];
  const geometry=units.map(u=>{
    const p=poses.get(u.id);
    const point=(x,y,z)=>project(p.x+x*p.ux-z*p.uz,p.y+y,p.z+x*p.uz+z*p.ux);
    const verts=corners.map(([a,b,c])=>point(a*u.w/2,b*u.h/2,c*u.d/2));
    return {u,point,verts,depth:point(0,0,0)[2]};
  });
  const pts=geometry.flatMap(g=>g.verts),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const fit=Math.min((width-54)/Math.max(1,maxX-minX),(height-48)/Math.max(1,maxY-minY));
  const toXY=p=>[width/2+(p[0]-(minX+maxX)/2)*fit,height/2+(p[1]-(minY+maxY)/2)*fit];
  const coords=points=>points.map(p=>toXY(p).map(v=>v.toFixed(2)).join(',')).join(' ');
  svgRoot.replaceChildren();svgRoot.setAttribute('viewBox','0 0 '+width+' '+height);
  const labels=[];
  const wood={front:'#d7bf94',inside:'#c2ac86',top:'#e8d8b9',side:'#a88e68',shelf:'#eee3cf',drawer:'#d9c7a5',door:'#d9d6c7'};
  for(const g of geometry.sort((a,b)=>a.depth-b.depth)){
    const {u,point,verts}=g;
    const body=svg('g',{'class':'cabinetShape'+(u.id===lastId?' wasOpened':''),'data-cabinet':u.id,tabindex:0,role:'button','aria-label':'פתח ארגז '+u.id});
    const title=svg('title');title.textContent='ארגז '+u.id+' · '+u.w+' × '+u.h+' × '+u.d+' מ״מ';body.append(title);
    const poly=(v,fill)=>body.append(svg('polygon',{points:coords(v),fill,stroke:'#766a55','stroke-width':.8,'stroke-linejoin':'round'}));
    const frontSign=point(0,0,1)[2]>=g.depth?1:-1,sideSign=point(1,0,0)[2]>=g.depth?1:-1;
    const x=u.w/2,y=u.h/2,z=u.d/2*frontSign,border=Math.min(22,u.w*.04,u.h*.08);
    const face=(x1,y1,x2,y2,color,depth=z)=>poly([point(x1,y1,depth),point(x2,y1,depth),point(x2,y2,depth),point(x1,y2,depth)],color);
    poly((sideSign===1?[1,3,7,5]:[0,2,6,4]).map(i=>verts[i]),wood.side);
    poly([2,3,7,6].map(i=>verts[i]),wood.top);
    face(-x,-y,x,y,wood.front);
    const insideX=x-border,insideY=y-border;
    face(-insideX,-insideY,insideX,insideY,wood.inside);
    const clipId='opening-'+u.id;
    const clip=svg('clipPath',{id:clipId});
    clip.append(svg('polygon',{points:coords([point(-insideX,-insideY,z),point(insideX,-insideY,z),point(insideX,insideY,z),point(-insideX,insideY,z)])}));
    const defs=svg('defs');defs.append(clip);body.append(defs);
    const interior=svg('g',{'clip-path':'url(#'+clipId+')'});body.append(interior);
    const insidePoly=(points,color)=>interior.append(svg('polygon',{points:coords(points),fill:color,stroke:'#887a63','stroke-width':.6}));
    const rear=-z*.87;
    insidePoly([point(-insideX,-insideY,rear),point(insideX,-insideY,rear),point(insideX,insideY,rear),point(-insideX,insideY,rear)],'#cbb998');
    for(const edge of [-insideX,insideX])insidePoly([point(edge,-insideY,z),point(edge,-insideY,rear),point(edge,insideY,rear),point(edge,insideY,z)],edge*sideSign>0?'#b6a17e':'#dac8a5');
    insidePoly([point(-insideX,-insideY,z),point(-insideX,-insideY,rear),point(insideX,-insideY,rear),point(insideX,-insideY,z)],wood.shelf);
    const doors=u.parts.filter(p=>/Door|^דלת/.test(p.name)).length;
    const drawers=new Set(u.parts.filter(p=>/מגש/.test(p.name)).map(p=>p.name.match(/\d+/)?.[0]||'1')).size;
    if(doors){
      for(let j=0;j<doors;j++)face(-x+u.w*j/doors+border/3,-y+border*.5,-x+u.w*(j+1)/doors-border/3,y-border*.5,wood.door);
    }else{
      const drawerHeight=drawers?Math.min(u.h*.87,drawers*195):0;
      for(let j=0;j<drawers;j++)face(-x+border,-y+drawerHeight*j/drawers+5,x-border,-y+drawerHeight*(j+1)/drawers-4,wood.drawer);
      const shelves=u.parts.filter(p=>/מדף/.test(p.name)).length;
      for(let j=1;j<=shelves;j++){const level=-y+drawerHeight+(u.h-drawerHeight)*j/(shelves+1);insidePoly([point(-insideX,level,rear),point(insideX,level,rear),point(insideX,level,z),point(-insideX,level,z)],wood.shelf);
        face(-insideX,level-14,insideX,level,wood.front);}
    }
    const open=()=>choose(u.id);
    body.addEventListener('click',open);body.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
    svgRoot.append(body);labels.push({id:u.id,xy:toXY(point(0,0,z)),open});
  }
  // Lay out number badges last so cabinets in front cannot hide another cabinet's number.
  const occupied=[];
  for(const label of labels.sort((a,b)=>a.xy[1]-b.xy[1]||a.xy[0]-b.xy[0])){
    const [ax,ay]=label.xy,boxW=Math.max(29,String(label.id).length*8+12),boxH=22;
    let best=null;
    for(const radius of [0,13,26,39,52,78,104]){
      for(let step=0;step<(radius?12:1);step++){
        const angle=step*Math.PI/6;
        const x=clamp(ax+radius*Math.cos(angle),boxW/2+2,width-boxW/2-2),y=clamp(ay+radius*Math.sin(angle),14,height-14);
        if(!occupied.some(r=>Math.abs(x-r.x)<(boxW+r.w)/2+2 && Math.abs(y-r.y)<boxH+2)){best={x,y,w:boxW};break;}
      }if(best)break;
    }
    const pos=best||{x:ax,y:ay,w:boxW};occupied.push(pos);
    if(Math.hypot(pos.x-ax,pos.y-ay)>13)svgRoot.append(svg('line',{x1:ax,y1:ay,x2:pos.x,y2:pos.y,stroke:'#315e4c','stroke-width':1.3,'pointer-events':'none'}));
    const badge=svg('g',{'class':'cabBadge'+(label.id===lastId?' wasOpened':''),'data-number':label.id,'aria-hidden':'true'});
    badge.append(svg('rect',{x:pos.x-boxW/2,y:pos.y-boxH/2,width:boxW,height:boxH,rx:7}));
    const text=svg('text',{x:pos.x,y:pos.y+4.6,'text-anchor':'middle'});text.textContent=label.id;badge.append(text);badge.onclick=label.open;svgRoot.append(badge);
  }
}
function frontPoses(wall){return new Map(wall.positions.map(p=>[p.id,{x:p.x,y:p.y,z:0,ux:1,uz:0}]));}
export function setupOverview(root,open) {
  let views=[],lastId=null,project=null;
  const resize=new ResizeObserver(()=>{for(const view of views)view.draw();});
  function makeScene(host,units,poses,turn,roomMode,choose){
    const wrap=dom('div','overviewScroll'),picture=svg('svg',{'class':'projectScene',role:'group','aria-label':'הדמיה עם ארגזים לבחירה'});wrap.append(picture);host.append(wrap);
    const view={wrap,draw(){
      const width=wrap.clientWidth;if(width<20)return;
      const height=roomMode?clamp(width*.72,330,480):clamp(width*.46,205,365);
      picture.style.height=height+'px';
      projectScene(picture,units,poses,turn(),roomMode?.77:.14,width,height,choose,lastId);
    }};
    views.push(view);resize.observe(wrap);view.draw();
  }
  function drawRoom(room){
    const units=room.walls.flatMap(w=>w.units),panel=dom('article','roomOverview');
    const header=dom('div','roomHead'),caption=dom('div');
    caption.append(dom('div','kicker',room.id?'חדר '+room.id:'מבט כללי'),dom('h3','',room.name||(room.id?'יחידות החדר':'הפרויקט')));
    header.append(caption,dom('span','badge',units.length+' ארגזים'));panel.append(header);root.append(panel);
    let active='all',yaw=-.58;
    const bar=dom('div','wallControls'),zone=dom('div','roomDrawing'),note=dom('p','mapNote');
    panel.append(bar,zone,note);
    const select=(id)=>{lastId=id;open(id);};
    function paint(){
      for(const view of views.filter(v=>zone.contains(v.wrap)))resize.unobserve(view.wrap);
      views=views.filter(v=>!zone.contains(v.wrap));zone.replaceChildren();bar.replaceChildren();
      const allButton=action('כל החדר',()=>{active='all';paint();});allButton.setAttribute('aria-pressed',String(active==='all'));bar.append(allButton);
      if(room.walls.length>1)for(const w of room.walls){const b=action('קיר '+(w.id||'כללי'),()=>{active=w.id;paint();});b.setAttribute('aria-pressed',String(active===w.id));bar.append(b);}
      if(active==='all' && room.poses){
        const tools=dom('div','roomViewTools');
        for(const [text,step] of [['↶',-1],['↷',1]]){
          const b=action(text,()=>{yaw+=step*Math.PI/2;for(const v of views.filter(v=>zone.contains(v.wrap)))v.draw();});
          b.setAttribute('aria-label',step<0?'סובב את החדר שמאלה':'סובב את החדר ימינה');tools.append(b);
        }
        makeScene(zone,units,room.poses,()=>yaw,true,select);zone.append(tools);
        note.textContent='מבט חדר סכמטי לפי התוכנית והחזיתות. לבחירה בארגז מוסתר אפשר לסובב את החדר או לבחור קיר.';return;
      }
      const walls=active==='all'?room.walls:room.walls.filter(w=>w.id===active);
      for(const w of walls){
        if(walls.length>1)zone.append(dom('h4','wallTitle','קיר '+(w.id||'כללי')));
        makeScene(zone,w.units,frontPoses(w),()=>.13,false,select);
      }
      note.textContent=project.key==='demo'?'ארגזי הדגמה. בפתיחת ZIP יוצגו כאן ארגזי הפרויקט.':walls.every(w=>w.placed)?'חזית סכמטית לפי מיקום הארגזים בדפי הקירות.':'ארגזים ללא חזית מזוהה מוצגים זה לצד זה לפי מספרם.';
    }
    paint();
  }
  return {showProject(next){
    resize.disconnect();views=[];lastId=null;project=next;root.replaceChildren();
    const layout=next.layout||buildLayout(next.units);
    for(const room of layout)drawRoom(room);
  },refresh(id){lastId=id;for(const v of views)v.draw();},
  focus(id){root.querySelector('[data-cabinet="'+Number(id)+'"]')?.focus({preventScroll:true});}};
}
