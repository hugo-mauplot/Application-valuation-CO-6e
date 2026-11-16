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
function createPanel(dialog,anchor,beside){
 if(!dialog||!anchor)return null;
 const panel=document.createElement('aside');panel.className='student-beacon-overview';panel.setAttribute('aria-label','Suivi des balises du parcours');
 if(beside){const line=document.createElement('div');line.className='student-beacon-overview-line';anchor.before(line);line.append(anchor,panel)}else anchor.after(panel);
 const count=document.createElement('div');count.className='student-beacon-overview-count';const grid=document.createElement('div');grid.className='student-beacon-overview-grid';const legend=document.createElement('div');legend.className='student-beacon-overview-legend';legend.textContent='✓ Validée · □ À chercher · × Erreur';panel.append(count,grid,legend);
 return{dialog,anchor,beside,panel,count,grid,signature:''};
}
const views=[createPanel(document.getElementById('studentCodeDialog'),document.getElementById('studentBeaconLarge'),true),createPanel(document.getElementById('studentDestinationDialog'),document.getElementById('studentDestinationNumber'),false)].filter(Boolean);
function refresh(){
 const participant=state.pairs.find(p=>p.id===studentPairId),list=rows(state,participant);
 for(const view of views){
  if(!view.dialog.open)continue;
  const current=view.beside?studentBeaconId:null;view.panel.hidden=!list.length;
  const key=JSON.stringify([studentPairId,current,list]);if(key===view.signature)continue;view.signature=key;
  const found=list.filter(b=>b.status==='found').length;view.count.textContent=found+' / '+list.length+' validées · '+(list.length-found)+' restantes';
  const cells=list.map(b=>{const cell=document.createElement('span'),label=b.status==='found'?'validée':b.status==='error'?'erreur':'pas encore cherchée';cell.className='student-beacon-status '+b.status;cell.textContent=String(b.number)+(b.status==='found'?' ✓':b.status==='error'?' ×':'');cell.title='Balise '+b.number+' : '+label;cell.setAttribute('aria-label',cell.title);if(b.id===current)cell.setAttribute('aria-current','true');return cell});view.grid.replaceChildren(...cells);
 }
}
for(const view of views){new MutationObserver(refresh).observe(view.dialog,{attributes:true,attributeFilter:['open']});new MutationObserver(refresh).observe(view.anchor,{childList:true,characterData:true,subtree:true})}
const previousRender=render;render=function(){const result=previousRender.apply(this,arguments);refresh();return result};
refresh();
})(window);
