/* Consultation enseignante des balises, sans saisie ni modification de résultats. */
(function(root){
'use strict';
const dialog=document.getElementById('teacherBeaconOverviewDialog');if(!dialog)return;
let participantId='',signature='';
function refresh(){
 if(!dialog.open)return;
 if(state.studentTerrain||(typeof co!=='undefined'&&co?.role==='student')){dialog.close();return}
 const participant=state.pairs.find(p=>p.id===participantId);if(!participant){dialog.close();return}
 const list=root.COBeaconOverview.rows(state,participant),key=JSON.stringify([participantId,pairName(participant),list]);if(key===signature)return;signature=key;
 document.getElementById('teacherBeaconOverviewName').textContent=pairName(participant);
 const found=list.filter(b=>b.status==='found').length;dialog.querySelector('.student-beacon-overview-count').textContent=found+' / '+list.length+' validées · '+(list.length-found)+' restantes';
 const cells=list.map(b=>{const cell=document.createElement('span'),label=b.status==='found'?'validée':b.status==='error'?'erreur':'pas encore cherchée';cell.className='student-beacon-status '+b.status;cell.textContent=String(b.number)+(b.status==='found'?' ✓':b.status==='error'?' ×':'');cell.title='Balise '+b.number+' : '+label;cell.setAttribute('aria-label',cell.title);return cell});dialog.querySelector('.student-beacon-overview-grid').replaceChildren(...cells);
}
root.openTeacherBeaconOverview=function(id){if(state.studentTerrain||(typeof co!=='undefined'&&co?.role==='student'))return;if(!state.pairs.some(p=>p.id===id))return;participantId=id;signature='';if(!dialog.open)dialog.showModal();refresh()};
const previousRender=render;render=function(){const result=previousRender.apply(this,arguments);refresh();return result};
})(window);
