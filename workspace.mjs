import {setupOverview} from './project-overview.mjs';
import {setupModel} from './unit-model.mjs';
const $=id=>document.getElementById(id);
const option=(value,label)=>new Option(label,value);
const button=(text,action)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',action);return b;};
const show=(el,yes)=>el.hidden=!yes;
function demoUnit(id,w,h,d,shelves){
 const parts=[],put=(name,w,l,t=17)=>parts.push({name,w,l,t,material:'לביד '+t});
 put('דופן שמאל',d,h);put('דופן ימין',d,h);put('עליון',d,w-34);put('תחתון',d,w-34);put('גב',w,h,5);
 for(let i=0;i<shelves;i++)put('מדף נייד',d-20,w-36);
 return {id,w,h,d,room:'',wall:'',parts};
}
const demo={title:'מטבח לדוגמה',key:'demo',docs:[],units:[demoUnit(1,800,900,400,2),demoUnit(2,600,1800,500,4),demoUnit(3,900,720,560,1)]};
let project=demo,unit=demo.units[0],mode='model',selected=-1,renderJob=null,drawTicket=0,busy=false,isLarge=false,sourcePage=null;
const renders=new Map();
const names=['בדיקת תכולת הארגזים','פילוס וחיבור יחידות','הרכבת חזיתות','בדיקת מגירות וצירים','סוקלים וסגירות','ניקיון ובדיקת גמר','תיעוד חוסרים והשלמות'];
const model=setupModel($('scene'),i=>choosePart(i));
let overviewScroll=0;
const overview=setupOverview($('roomScenes'),id=>{
  overviewScroll=window.scrollY;
  history.pushState({nagariaUnit:id,fileKey:project.key},'');
  openUnitView(id);
});
function showView(detail) {
  show($('unitDetail'),detail);show($('projectOverview'),!detail);
  $('screenTitle').textContent=detail?'תיק יחידה':'הדמיית הפרויקט';
  document.title='NAGARIA OS | '+$('screenTitle').textContent;
  $('screenHint').textContent=detail?'דפי הרכבה, חלקים ודיווח ליחידה שנבחרה.':'לחץ על הארגז בהדמיה או על המספר שלו כדי לפתוח את תיק היחידה.';
}
function openUnitView(id) {
  showView(true);changeUnit(id);switchTab('viewer');updateMode('model');
  $('unitDetail').scrollIntoView({block:'start'});$('backOverview').focus({preventScroll:true});
}
function returnToOverview() {
  const id=unit.id;showView(false);overview.refresh(id);
  window.scrollTo(0,overviewScroll);overview.focus(id);
}
$('backOverview').onclick=()=>{if(history.state?.fileKey===project.key)history.back();else returnToOverview();};
window.addEventListener('popstate',()=>{
  const state=history.state;
  if(state?.fileKey===project.key && project.units.some(u=>u.id===state.nagariaUnit))openUnitView(state.nagariaUnit);
  else returnToOverview();
});

function cleanName(p){return p.name.replace(/\)(\d+)\(/g,'($1)').trim();}
function resetSheet(){drawTicket++;renderJob?.cancel();renderJob=null;isLarge=false;$('docScroll').classList.remove('large');$('docZoom').textContent='הגדלת השרטוט';}
function updateMode(next){
 mode=next;
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 show($('modelPane'),mode==='model'||mode==='explode');show($('spreadBox'),mode==='explode');
 show($('documentPane'),mode==='sheet');show($('partsPane'),mode==='parts');
 if(mode==='model'||mode==='explode')model.spread(mode==='explode'?Number($('spread').value):0);
 if(mode==='sheet')renderDocument();else resetSheet();
}
function dims(p){return [p.l,p.w,p.t].filter(v=>v!=null).join(' × ');}
function choosePart(i,explode=false){
 selected=i;model.highlight(i);
 const p=unit.parts[i],holder=$('selectedPart');holder.replaceChildren();
 if(!p)return;
 const label=document.createElement('strong');label.textContent=cleanName(p);
 const numbers=document.createElement('bdi');numbers.textContent=dims(p);
 holder.append(label,' · ',numbers,' מ״מ · ',p.material);
 if(p.doc!==undefined)holder.append(button('דף החיתוך',()=>openDoc(p)));
 if(explode)updateMode('explode');
}
function listParts(){
 const holder=$('partsList');holder.replaceChildren();
 if(!unit.parts.length){holder.textContent='לא נמצאו שורות חיתוך משויכות ליחידה.';return;}
 for(const [i,p] of unit.parts.entries()){
  const row=document.createElement('div');row.className='partRow';
  const info=document.createElement('div');const title=document.createElement('strong');title.textContent=(i+1)+'. '+cleanName(p);
  const sub=document.createElement('div');sub.textContent=p.material;const size=document.createElement('small');size.textContent=dims(p)+' mm';info.append(title,sub,size);
  const buttons=document.createElement('div');buttons.className='partButtons';buttons.append(button('הצג בפיצוץ',()=>choosePart(i,true)));
  if(p.doc!==undefined)buttons.append(button('דף חיתוך',()=>openDoc(p)));
  row.append(info,buttons);holder.append(row);
 }
}
function openDoc(part){sourcePage={doc:part.doc,page:part.page,title:'חיתוך · '+cleanName(part)+' · עמוד '+part.page+' · חלק '+part.row};resetSheet();updateMode('sheet');}
async function renderDocument(){
 const ticket=++drawTicket;renderJob?.cancel();renderJob=null;
 const src=sourcePage||{doc:unit.doc,page:unit.page,title:'דף Assembly · יחידה '+unit.id+' · עמוד '+unit.page};
 const doc=project.docs[src.doc];$('docLabel').textContent=doc?src.title:'דף Assembly';show($('docZoom'),!!doc);
 const canvas=$('docCanvas');show(canvas,false);$('docState').textContent=doc?'טוען שרטוט…':'כאן יוצג דף ההרכבה מתוך קובץ העבודה. פתח ZIP כדי לצפות בו.';
 if(!doc)return;
 try{
  const page=await doc.getPage(src.page);if(ticket!==drawTicket)return;
  const viewport=page.getViewport({scale:isLarge?2.7:1.65});
  const buffer=document.createElement('canvas');buffer.width=Math.ceil(viewport.width);buffer.height=Math.ceil(viewport.height);
  const task=page.render({canvas:buffer,viewport});renderJob=task;await task.promise;if(ticket!==drawTicket)return;
  canvas.width=buffer.width;canvas.height=buffer.height;canvas.getContext('2d').drawImage(buffer,0,0);
  $('docState').textContent='';show(canvas,true);renderJob=null;
 }catch(err){if(ticket===drawTicket && err.name!=='RenderingCancelledException')$('docState').textContent='העמוד לא נטען. נסה לפתוח אותו שוב.';}
}
function renderAttachment(){
 const url=renders.get(unit.id);show($('attachedImage'),!!url);show($('removeRender'),!!url);
 if(url)$('attachedImage').src=url;else $('attachedImage').removeAttribute('src');
 $('renderFile').value='';
}
$('renderFile').onchange=()=>{const f=$('renderFile').files[0];if(!f?.type.startsWith('image/'))return;
 if(renders.has(unit.id))URL.revokeObjectURL(renders.get(unit.id));renders.set(unit.id,URL.createObjectURL(f));renderAttachment();};
$('removeRender').onclick=()=>{URL.revokeObjectURL(renders.get(unit.id));renders.delete(unit.id);renderAttachment();};
function switchTab(tab){
 document.querySelectorAll('[data-tab]').forEach(b=>{const current=b.dataset.tab===tab;b.classList.toggle('active',current);b.setAttribute('aria-pressed',String(current));});
 document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===tab));
}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(b.dataset.mode==='sheet'){sourcePage=null;resetSheet();}updateMode(b.dataset.mode);});
$('spread').oninput=()=>{$('spreadValue').textContent=$('spread').value+'%';model.spread(Number($('spread').value));};
$('spreadValue').textContent=$('spread').value+'%';
$('rotPrev').onclick=()=>model.rotate(-.3);$('rotNext').onclick=()=>model.rotate(.3);$('zoomIn').onclick=()=>model.zoom(1.2);$('zoomOut').onclick=()=>model.zoom(1/1.2);$('resetView').onclick=()=>model.reset();
$('docZoom').onclick=()=>{isLarge=!isLarge;$('docScroll').classList.toggle('large',isLarge);$('docZoom').textContent=isLarge?'התאמה למסך':'הגדלת השרטוט';renderDocument();};
function unitLabel(u){return project===demo?'ארון '+String(u.id).padStart(2,'0'):'יחידה '+u.id;}
function changeUnit(id){
 unit=project.units.find(u=>u.id===Number(id))||project.units[0];selected=-1;sourcePage=null;resetSheet();
 $('unitPicker').value=String(unit.id);$('modelTitle').textContent=unitLabel(unit);$('countBadge').textContent=unit.parts.length+' חלקים';
 $('unitMeta').replaceChildren();const numbers=document.createElement('bdi');numbers.textContent=[unit.w,unit.h,unit.d].join(' × ');
 $('unitMeta').append('רוחב × גובה × עומק · ',numbers,' מ״מ');
 $('selectedPart').replaceChildren();model.unit(unit);listParts();renderAttachment();updateMode(mode);loadForms();
}
function openProject(next){
 const prev=project;resetSheet();for(const url of renders.values())URL.revokeObjectURL(url);renders.clear();
 project=next;$('projectName').textContent=next.title;
 $('projectMeta').textContent=(project===demo?'פרויקט הדגמה':'קובץ מקומי')+' · '+project.units.length+' יחידות · '+project.units.reduce((n,u)=>n+u.parts.length,0)+' חלקים';
 show($('closeProject'),next!==demo);$('unitPicker').replaceChildren(...next.units.map(u=>option(u.id,unitLabel(u)+(u.wall?' · חדר '+u.room+' · קיר '+u.wall:''))));
 $('unit').replaceChildren(...next.units.map(u=>option(unitLabel(u),unitLabel(u))),option('כללי / באתר','כללי / באתר'));
 changeUnit(next.units[0].id);switchTab('viewer');
 showView(false);overview.showProject(next);overviewScroll=0;history.replaceState(null,'');
 if(prev!==next)for(const doc of prev.docs)doc.destroy().catch(()=>{});
}
function message(text,error=false){$('loadMsg').textContent=text;$('loadMsg').classList.toggle('bad',error);}
$('archive').onchange=async()=>{
 const file=$('archive').files[0];if(!file||busy)return;busy=true;$('archive').disabled=true;$('closeProject').disabled=true;
 try{
  message('פותח את קובץ העבודה במכשיר…');
  const {readArchive}=await import('./project-reader.mjs?v=3');const next=await readArchive(file,message);openProject(next);
  message('הפרויקט פתוח במכשיר זה. לאחר רענון יש לבחור את ה־ZIP מחדש.'+(next.unmatched?' '+next.unmatched+' שורות חיתוך לא שויכו ליחידה.':''));
 }catch(error){message('לא ניתן לפתוח את הפרויקט. '+(error.message||'יש לבחור ZIP עם דפי Assembly.'),true);}
 finally{busy=false;$('archive').disabled=false;$('closeProject').disabled=false;$('archive').value='';}
};
$('closeProject').onclick=()=>{openProject(demo);message('הפרויקט נסגר. אפשר לפתוח קובץ עבודה נוסף.');};
$('unitPicker').onchange=()=>changeUnit($('unitPicker').value);
// Keep the demo's original browser keys. Work reports use the file fingerprint + assembly ID.
function key(k){return project===demo?'nagariaDemo:'+k:'nagariaWork:'+project.key+':'+unit.id+':'+k;}
function read(k,fallback){try{return JSON.parse(localStorage.getItem(key(k)))??fallback;}catch{return fallback;}}
function save(k,v){try{localStorage.setItem(key(k),JSON.stringify(v));return true;}catch{return false;}}
let checks=[],previewUrls=[];
function updateChecks(){const n=checks.filter(Boolean).length;$('count').textContent=n+'/'+names.length;$('bar').style.width=100*n/names.length+'%';}
function loadForms(){
 for(const u of previewUrls)URL.revokeObjectURL(u);previewUrls=[];
 for(const id of ['issueImages','finishImages'])$(id).value='';for(const id of ['issuePreview','finishPreview'])$(id).replaceChildren();
 const stored=read('checks',[]);checks=names.map((_,i)=>Array.isArray(stored)&&!!stored[i]);
 $('taskList').replaceChildren(...names.map((text,i)=>{const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=checks[i];box.onchange=()=>{checks[i]=box.checked;if(!save('checks',checks))$('tasks').querySelector('.notice').textContent='השמירה חסומה בדפדפן זה.';updateChecks();};label.append(box,document.createTextNode(text));return label;}));updateChecks();
 const issue=read('issue',{}),finish=read('finish',{});$('unit').value=issue.unit||unitLabel(unit);$('kind').value=issue.kind||$('kind').options[0].value;$('description').value=issue.description||'';
 $('area').value=finish.area||$('area').options[0].value;$('state').value=finish.state||$('state').options[0].value;$('finalNotes').value=finish.notes||'';
 $('issueState').textContent='הדיווח נשמר במכשיר בלבד.';$('finishState').textContent='התמונות מוצגות לתצוגה בלבד. הסיכום נשמר במכשיר.';
}
$('unit').onchange=()=>{if(project!==demo){const u=project.units.find(u=>unitLabel(u)===$('unit').value);if(u&&u.id!==unit.id)changeUnit(u.id);}};
function photos(input,holder){holder.replaceChildren();for(const file of [...input.files].slice(0,9)){if(!file.type.startsWith('image/'))continue;const img=new Image(),url=URL.createObjectURL(file);img.src=url;img.alt='תמונה שצורפה';previewUrls.push(url);holder.append(img);}}
$('issueImages').onchange=()=>photos($('issueImages'),$('issuePreview'));$('finishImages').onchange=()=>photos($('finishImages'),$('finishPreview'));
function issueData(){return {unit:$('unit').value,kind:$('kind').value,description:$('description').value,time:new Date().toLocaleString('he-IL'),photoCount:$('issueImages').files.length};}
function finishData(){return {unit:unitLabel(unit),area:$('area').value,notes:$('finalNotes').value,state:$('state').value,time:new Date().toLocaleString('he-IL'),photoCount:$('finishImages').files.length,checklist:checks.map((done,i)=>({item:names[i],done}))};}
function download(obj,file){const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=file;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('saveIssue').onclick=()=>{$('issueState').textContent=save('issue',issueData())?'פרטי הדיווח נשמרו במכשיר.':'השמירה חסומה בדפדפן זה.';};
$('saveFinish').onclick=()=>{$('finishState').textContent=save('finish',finishData())?'סיכום ההתקנה נשמר במכשיר.':'השמירה חסומה בדפדפן זה.';};
$('exportIssue').onclick=()=>download(issueData(),project===demo?'nagaria-issue-demo.json':'nagaria-issue-'+unit.id+'.json');
$('exportFinish').onclick=()=>download(finishData(),project===demo?'nagaria-installation-demo.json':'nagaria-installation-'+unit.id+'.json');
openProject(demo);
