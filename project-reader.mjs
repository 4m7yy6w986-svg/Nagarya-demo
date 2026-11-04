import * as pdfjs from './pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', import.meta.url).href;

// The ZIP may carry DOS Hebrew filenames without a Unicode filename flag.
function decodeName(bytes) {
  try { return new TextDecoder('utf-8', {fatal:true}).decode(bytes); }
  catch { return Array.from(bytes, n => n >= 128 && n <= 154 ? String.fromCharCode(0x5d0+n-128) : String.fromCharCode(n)).join(''); }
}
const number = /^\d+(?:\.\d+)?$/;
async function readPageItems(page) {
  if (page.isPureXfa) return (await page.getTextContent()).items;
  // Some iPhone browsers support stream readers but not async iteration on streams.
  const reader = page.streamTextContent().getReader();
  const items = [];
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) return items;
      for (const item of value.items) items.push(item);
    }
  } finally {
    reader.releaseLock();
  }
}
function parseSheet(items, doc, page) {
  const header = items.find(i=>i.str==='Cab#');
  if (!header) return [];
  const fields=['#','Width','Length','Name','Cab#','Room'];
  const columns=fields.map(s=>items.find(i=>i.str===s && Math.abs(i.transform[5]-header.transform[5])<1)?.transform[4]);
  if (columns.some(x=>x===undefined)) return [];
  const data=items.filter(i=>i.str.trim() && i.transform[5]<header.transform[5]-1);
  const footer=items.map(i=>i.str).find(s=>/\bSheet\s+\d+\s+of\s+\d+/i.test(s))||'';
  const mat=footer.match(/\b(MDF|SAND)\s+(\d+(?:\.\d+)?)/i);
  const material=mat ? (mat[1].toUpperCase()==='MDF'?'MDF':'סנדוויץ׳')+' '+Number(mat[2]) : 'לפי דף החיתוך';
  const out=[];
  for(const row of data.filter(i=>Math.abs(i.transform[4]-columns[0])<9 && /^\d+$/.test(i.str.trim()))) {
    const line=data.filter(i=>Math.abs(i.transform[5]-row.transform[5])<1.2);
    const cell=n=>line.filter(i=>i.transform[4]>=columns[n]-2 && i.transform[4]<columns[n+1]-2).sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str.trim()).join(' ').trim();
    const w=cell(1),l=cell(2),cab=cell(4),name=cell(3);
    if (!number.test(w)||!number.test(l)||!/^\d+$/.test(cab)||!name) continue;
    out.push({cab:Number(cab),name,w:Number(w),l:Number(l),t:mat?Number(mat[2]):null,material,doc,page,row:Number(row.str)});
  }
  return out;
}
async function fileKey(bytes) {
  if (globalThis.crypto?.subtle) {
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  }
  // Local HTTP previews may lack Web Crypto. This identifier only namespaces notes.
  let a=2166136261,b=5381;
  for(const n of new Uint8Array(bytes)){a=Math.imul(a^n,16777619);b=(Math.imul(b,33)^n)>>>0;}
  return bytes.byteLength+'-'+(a>>>0).toString(16)+'-'+b.toString(16);
}
export async function readArchive(file,onProgress) {
  if(file.size>180*1024*1024) throw Error('הקובץ גדול מדי לפתיחה במכשיר זה.');
  const bytes=await file.arrayBuffer();
  const hash=await fileKey(bytes);
  const zip=await globalThis.JSZip.loadAsync(bytes,{decodeFileName:decodeName});
  const entries=Object.values(zip.files).filter(x=>!x.dir && !x.name.startsWith('__MACOSX') && /\.pdf$/i.test(x.name));
  if(!entries.length)throw Error('לא נמצאו דפי PDF בארכיון.');
  const docs=[],units=new Map(),parts=[];
  try {
    for(const [id,entry] of entries.entries()) {
      const document=await pdfjs.getDocument({data:await entry.async('uint8array'),isEvalSupported:false,useSystemFonts:true,disableFontFace:false}).promise;
      docs.push(document);
      for(let pageNo=1;pageNo<=document.numPages;pageNo++) {
        if(pageNo===1 || pageNo%4===0)onProgress('קורא מסמך '+(id+1)+' מתוך '+entries.length+' · עמוד '+pageNo+' מתוך '+document.numPages);
        const page=await document.getPage(pageNo);
        const items=(await readPageItems(page)).filter(i=>typeof i.str==='string' && i.str.trim());
        const strings=items.map(i=>i.str.trim()),title=strings.map(s=>s.match(/^Assembly\s*#\s*(\d+)\s*-\s*(.*)/i)).find(Boolean);
        if(title) {
          const dims=strings.join(' ').match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
          if(!dims)throw Error('חסרות מידות בדף ההרכבה של יחידה '+title[1]);
          const idNum=Number(title[1]);if(units.has(idNum))throw Error('מספר יחידה מופיע פעמיים. לא ניתן לשייך את החלקים בוודאות.');
          const line=strings.join(' ');
          units.set(idNum,{id:idNum,kind:title[2],w:+dims[1],h:+dims[2],d:+dims[3],room:line.match(/Room\s*#\s*(\d+)/i)?.[1]||'',wall:line.match(/Wall\s*#\s*(\d+)/i)?.[1]||'',doc:id,page:pageNo,parts:[]});
        } else parts.push(...parseSheet(items,id,pageNo));
        page.cleanup();
      }
    }
    if(!units.size)throw Error('לא נמצאו דפי Assembly עם מספרי יחידות בארכיון.');
    let unmatched=0;
    for(const part of parts) {
      const unit=units.get(part.cab);
      if(unit)unit.parts.push(part);else unmatched++;
    }
    return {key:hash,title:file.name.replace(/\.zip$/i,''),docs,units:[...units.values()].sort((a,b)=>a.id-b.id),unmatched};
  } catch(err) {await Promise.allSettled(docs.map(doc=>doc.destroy()));throw err;}
}
