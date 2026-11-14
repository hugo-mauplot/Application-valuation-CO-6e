/* Règles des passages : pur JavaScript, sans réseau ni interface. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
function maximum(doc){const n=Number(doc.settings?.maxBeaconsPerVisit??1);return n===0?0:Number.isInteger(n)&&n>0&&n<=200?n:1}
function enabled(doc){return maximum(doc)!==1}
function remaining(doc,p){const good=new Set((doc.attempts||[]).filter(a=>a.pairId===p.id&&a.found).map(a=>a.beaconId));return(doc.beacons||[]).filter(b=>(p.courseId?b.courseId===p.courseId:(p.freeBeaconIds||[]).includes(b.id))&&!good.has(b.id))}
function course(doc,p){return(doc.courses||[]).find(c=>c.id===String(p.courseId).split('::')[0])}
function ordered(doc,p){const c=course(doc,p),order=c?.variantOrders?.[String(p.courseId).split('::')[1]]||[];return remaining(doc,p).sort((a,b)=>{const rank=b=>{const n=Number(b.courseNumber||b.number),i=order.indexOf(n);return c?.orderMode==='imposed'&&i>=0?i:n+1000};return rank(a)-rank(b)||String(a.id).localeCompare(String(b.id))})}
function validPlan(doc,p){const x=p.visitState;return x?.version===1&&x.session===doc.sessionStartedAt&&x.start===p.startAt&&x.course===(p.courseId||'')}
function prepare(doc,p){
 const list=ordered(doc,p),ids=list.map(b=>b.id),open=(p.runs||[]).findLast?.(r=>!r.endAt)||(p.runs||[]).slice().reverse().find(r=>!r.endAt);
 let x=validPlan(doc,p)?p.visitState:null;
 if(!x)x={version:1,session:doc.sessionStartedAt,start:p.startAt,course:p.courseId||'',run:null,queue:ids,assigned:[],visit:{touched:[],pending:null,id:null}};
 if(open&&x.run!==open.id){
  const good=new Set(ids);let queue=[...new Set([...(x.queue||[]),...ids])].filter(id=>good.has(id));if(x.run){const assigned=new Set(x.assigned);queue=[...queue.filter(id=>!assigned.has(id)),...x.assigned.filter(id=>good.has(id))];}
  if(x.priority&&good.has(x.priority))queue=[x.priority,...queue.filter(id=>id!==x.priority)];
  const max=maximum(doc),imposed=course(doc,p)?.orderMode==='imposed';
  x={...x,priority:null,run:open.id,queue,assigned:imposed?queue.slice(0,max||queue.length):queue.slice(),visit:{touched:[],pending:null,id:null}};
 }
 p.visitState=x;return x;
}
function sync(doc){if(!enabled(doc))return;for(const p of doc.pairs||[])if(p.startAt&&!p.endAt&&!p.end)prepare(doc,p)}
function batch(doc,p){if(!p)return[];const copy=clone(p),plan=prepare(doc,copy),left=remaining(doc,p),map=new Map(left.map(b=>[b.id,b]));const ids=plan.run?plan.assigned:ordered(doc,p).slice(0,maximum(doc)||200).map(b=>b.id);return ids.map(id=>map.get(id)).filter(Boolean)}
function choices(doc,p){const x=prepare(doc,p),t=new Set(x.visit.touched||[]);return batch(doc,p).filter(b=>!t.has(b.id))}
function pending(doc,p){const x=prepare(doc,p);return(doc.attempts||[]).find(a=>a.id===x.visit.pending)||null}
function canContinue(doc,p){const x=prepare(doc,p),max=maximum(doc);return(!max||x.visit.touched.length<max)&&choices(doc,p).length>0}
function transition(original,event,stamp){
 const doc=clone(original),p=(doc.pairs||[]).find(p=>p.id===event.pair);
 if(!doc.sessionStartedAt||!doc.terrainModeActive)throw Error('Séance non lancée ou terminée');
 if(!p||!p.startAt||p.endAt||p.end)throw Error('Participant non démarré ou terminé');
 if(p.teacherPausedAt)throw Error('Participant en pause');
 if(event.course!==p.courseId)throw Error('Parcours modifié');
 const x=prepare(doc,p),v=x.visit,last=pending(doc,p),max=maximum(doc);
 if(event.visitRun!==x.run)throw Error('Passage modifié : rechargez la carte');
 let result={};
 if(event.command==='answer'||event.command==='skip'){
  const b=(doc.beacons||[]).find(b=>b.id===event.beacon),left=remaining(doc,p);
  if(!b||!left.some(q=>q.id===b.id))throw Error('Balise déjà validée ou hors parcours');
  const retry=false;
  if(last)throw Error('Choisissez de continuer ou de repartir');
  if(!x.assigned.includes(b.id))throw Error('Balise hors du lot attribué');
  if(!retry&&v.touched.includes(b.id))throw Error('Balise déjà traitée pendant ce passage');
  if(!retry&&max&&v.touched.length>=max)throw Error('Maximum atteint pour ce passage');
  const expected=(doc.inventory||[]).find(i=>i.id===b.inventoryId)?.codes?.[p.codeKey];
  if(expected==null||String(expected)==='')throw Error('Correction manquante');
  if(event.command==='answer'&&!/^\d+$/.test(event.code||''))throw Error('Code numérique requis');
  const found=event.command==='answer'&&String(event.code).trim()===String(expected).trim();
  v.id=v.id||event.event;if(!v.touched.includes(b.id))v.touched.push(b.id);
  const record={id:event.event,pairId:p.id,beaconId:b.id,codeKey:p.codeKey,found,skipped:event.command==='skip',enteredCode:event.code||'',expectedCode:String(expected),time:stamp,arrivalAt:v.arrivalAt||stamp,returnId:v.id,nextDepartureAt:null,passageRun:x.run,thirdFormat:doc.settings?.gradeFormat==='third'};
  v.arrivalAt=record.arrivalAt;v.pending=record.id;doc.attempts.push(record);
  for(const r of p.runs||[])if(!r.endAt)r.endAt=stamp;
  result={found,attempt:record.id,skipped:record.skipped};
 }else if(event.command==='continue'){
  if(!last)throw Error('Aucune tentative en attente');
  if(!canContinue(doc,p))throw Error('Maximum atteint ou lot terminé');
  v.pending=null;result={continued:true};
 }else if(event.command==='depart'){
  if(!v.touched.length)throw Error('Aucune balise traitée pendant ce passage');
  // Les balises proposées et non réussies passent après toutes les autres.
  const leftIds=new Set(remaining(doc,p).map(b=>b.id)),assigned=new Set(x.assigned);
  x.queue=[...x.queue.filter(id=>leftIds.has(id)&&!assigned.has(id)),...x.assigned.filter(id=>leftIds.has(id))];
  if(event.retry){if(!last||last.found||last.skipped)throw Error('Aucune erreur à retenter au prochain lot');x.priority=last.beaconId;}
  for(const a of doc.attempts)if(a.pairId===p.id&&a.returnId===v.id&&!a.nextDepartureAt)a.nextDepartureAt=stamp;
  v.pending=null;
  if(leftIds.size){p.runs.push({id:event.event,startAt:stamp,endAt:null});prepare(doc,p)}
  result={departed:true};
 }else throw Error('Action de passage inconnue');
 return{profile:doc,...result};
}
const api={maximum,enabled,remaining,ordered,prepare,sync,batch,choices,pending,canContinue,transition};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.COPassages=api;
})(typeof window==='undefined'?globalThis:window);
