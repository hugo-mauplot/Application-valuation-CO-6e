const assert=require('assert'),C=require('../application_co_iphone/passages-core.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(cap=3,count=8,imposed=true){return{sessionStartedAt:'session',terrainModeActive:true,settings:{maxBeaconsPerVisit:cap},courses:[{id:'c',orderMode:imposed?'imposed':'free',variantOrders:{A:Array.from({length:count},(_,i)=>i+1)}}],beacons:Array.from({length:count},(_,i)=>({id:'b'+(i+1),courseId:'c::A',courseNumber:i+1,inventoryId:'i'+i})),inventory:Array.from({length:count},(_,i)=>({id:'i'+i,codes:{A1:'00'+(i+1)}})),pairs:[{id:'p',courseId:'c::A',codeKey:'A1',startAt:'now',runs:[{id:'run1',startAt:'now',endAt:null}]}],attempts:[]}}
let counter=0;function send(doc,command,beacon,code,retry=false){const p=doc.pairs[0];return C.transition(doc,{event:'event'+(++counter),command,retry,pair:'p',course:p.courseId,visitRun:C.prepare(doc,p).run,beacon,code},'stamp'+counter).profile}
let d=fixture();C.sync(d);assert.deepEqual(C.batch(d,d.pairs[0]).map(b=>b.id),['b1','b2','b3']);
d=send(d,'answer','b2','002');assert.equal(d.attempts[0].found,true);d=send(d,'continue');d=send(d,'answer','b1','999');assert.equal(d.attempts.at(-1).found,false);
assert.throws(()=>send(d,'answer','b1','001'),/continuer|traitée/,'Aucune retentative sur place');
d=send(d,'depart',undefined,undefined,true);assert.deepEqual(C.batch(d,d.pairs[0]).map(b=>b.id),['b1','b4','b5'],'Retentative dans le lot suivant, avec nouveau départ');assert.equal(d.attempts.filter(a=>!a.nextDepartureAt).length,0);assert.equal(new Set(d.attempts.map(a=>a.returnId)).size,1,'Un passage = un retour pour plusieurs tentatives');
d=send(d,'answer','b1','001');assert.equal(d.attempts.at(-1).found,true);assert.throws(()=>send(d,'answer','b1','001'),/déjà validée/);
// Reporter une erreur et repartir avant le maximum.
d=fixture(2,5);C.sync(d);d=send(d,'answer','b1','wrong'.replace('wrong','999'));d=send(d,'depart');assert.deepEqual(C.batch(d,d.pairs[0]).map(b=>b.id),['b3','b4']);d=send(d,'answer','b3','003');d=send(d,'depart');assert.deepEqual(C.batch(d,d.pairs[0]).map(b=>b.id),['b5','b1'],'Erreur réintroduite après proposition des autres balises');
// Maximum, lot résiduel et aucune mutation sur refus.
d=fixture(2,3);C.sync(d);d=send(d,'answer','b1','001');d=send(d,'continue');d=send(d,'answer','b2','002');const before=JSON.stringify(d);assert.throws(()=>send(d,'continue'),/Maximum/);assert.throws(()=>send(d,'answer','b3','003'));assert.equal(JSON.stringify(d),before);d=send(d,'depart');assert.deepEqual(C.batch(d,d.pairs[0]).map(b=>b.id),['b3']);
// Libre, ordre libre, pauses et nouveau passage/course.
d=fixture(0,30);C.sync(d);assert.equal(C.batch(d,d.pairs[0]).length,30);for(let i=1;i<=30;i++){d=send(d,'answer','b'+i,'00'+i);if(i<30)d=send(d,'continue')}d=send(d,'depart');assert.equal(C.batch(d,d.pairs[0]).length,0);
d=fixture(3,7,false);C.sync(d);d=send(d,'answer','b7','007');assert.equal(d.attempts[0].found,true);d.pairs[0].teacherPausedAt='pause';assert.throws(()=>send(d,'depart'),/pause/);
assert.equal(C.maximum({settings:{}}),1);assert.equal(C.enabled({settings:{}}),false,'1 conserve le parcours historique');
// Un nouveau départ d’épreuve après remise à zéro repart du début du parcours.
d=fixture(2,5);C.sync(d);d=send(d,'answer','b1','001');d=send(d,'depart');d.attempts=[];d.pairs[0].startAt='new-start';d.pairs[0].runs=[{id:'new-run',startAt:'new-start',endAt:null}];C.sync(d);assert.deepEqual(C.batch(d,d.pairs[0]).map(b=>b.id),['b1','b2']);
// Contrôle aléatoire : jamais de réussite proposée de nouveau, lot <= maximum, terminaison.
for(let n=2;n<=8;n++){let x=fixture(n,17);C.sync(x);let loops=0;while(C.remaining(x,x.pairs[0]).length&&loops++<30){const batch=C.batch(x,x.pairs[0]);assert.ok(batch.length<=n);for(let i=0;i<batch.length;i++){const b=batch[i];x=send(x,'answer',b.id,'00'+b.courseNumber);if(i+1<batch.length)x=send(x,'continue')}x=send(x,'depart');const good=new Set(x.attempts.filter(a=>a.found).map(a=>a.beaconId));assert.ok(C.batch(x,x.pairs[0]).every(b=>!good.has(b.id)))}assert.equal(C.remaining(x,x.pairs[0]).length,0)}
console.log('OK : lots 2–8, maximum, départ anticipé, erreurs/report/retentative au prochain lot uniquement, zéros initiaux, Libre 30, ordre libre, pauses, retour groupé et exclusion des réussites.');
