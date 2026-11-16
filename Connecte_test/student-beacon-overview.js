/* Récapitulatif visuel uniquement : aucune modification des tentatives ou du parcours. */
(function(root){
'use strict';
function rows(doc,participant){
 if(!participant)return[];
 const attempts=(doc.attempts||[]).filter(a=>a.pairId===participant.id),good=new Set(attempts.filter(a=>a.found).map(a=>a.beaconId)),wrong=new Set(attempts.filter(a=>!a.found&&!a.skipped).map(a=>a.beaconId)),free=new Set(participant.freeBeaconIds||[]);
 return(doc.beacons||[]).filter(b=>participant.courseId?b.courseId===participant.courseId:free.has(b.id)).map(b=>({id:b.id,number:b.courseNumber||b.number,status:good.has(b.id)?'found':wrong.has(b.id)?'error':'untried'})).sort((a,b)=>Number(a.number)-Number(b.number)||String(a.id).localeCompare(String(b.id)));
}
root.COBeaconOverview={rows};
if(typeof document==='undefined')return;
const dialog=document.getElementById('studentCodeDialog'),number=document.getElementById('studentBeaconLarge');if(!dialog||!number)return;
const line=document.createElement('div');line.className='student-beacon-overview-line';number.before(line);line.append(number);
const panel=document.createElement('aside');panel.className='student-beacon-overview';panel.setAttribute('aria-label','Suivi des balises du parcours');line.append(panel);
const count=document.createElement('div');count.className='student-beacon-overview-count';const grid=document.createElement('div');grid.className='student-beacon-overview-grid';const legend=document.createElement('div');legend.className='student-beacon-overview-legend';legend.textContent='✓ Validée · □ À chercher · × Erreur';panel.append(count,grid,legend);
let signature='';
function refresh(){
 if(!dialog.open)return;
 const participant=state.pairs.find(p=>p.id===studentPairId),list=rows(state,participant);panel.hidden=!list.length;
 const key=JSON.stringify([studentPairId,studentBeaconId,list]);if(key===signature)return;signature=key;
 const found=list.filter(b=>b.status==='found').length;count.textContent=found+' / '+list.length+' validées · '+(list.length-found)+' restantes';
 const cells=list.map(b=>{const cell=document.createElement('span'),label=b.status==='found'?'validée':b.status==='error'?'erreur':'pas encore cherchée';cell.className='student-beacon-status '+b.status;cell.textContent=String(b.number)+(b.status==='found'?' ✓':b.status==='error'?' ×':'');cell.title='Balise '+b.number+' : '+label;cell.setAttribute('aria-label',cell.title);if(b.id===studentBeaconId)cell.setAttribute('aria-current','true');return cell});grid.replaceChildren(...cells);
}
new MutationObserver(refresh).observe(dialog,{attributes:true,attributeFilter:['open']});
new MutationObserver(refresh).observe(number,{childList:true,characterData:true,subtree:true});
const previousRender=render;render=function(){const result=previousRender.apply(this,arguments);refresh();return result};
refresh();
})(window);
