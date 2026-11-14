/* Extension des bornes pour plusieurs balises par passage. Le réglage 1 conserve le parcours historique. */
const passageCore=window.COPassages;
const passageOldOpen=openStudentCard,passageOldSubmit=submitStudentAttempt,passageOldDepart=studentDepart,passageOldFeedback=coFeedback;
function passageParticipant(){return state.pairs.find(p=>p.id===studentPairId)}
function passageEvent(command,beacon,code){const p=passageParticipant();if(!p)return;const x=passageCore.prepare(state,p);return{kind:'visit',command,pair:p.id,course:p.courseId,visitRun:x.run,beacon,code}}
function passageSend(event){
 if(!event)return;
 const participant=state.pairs.find(p=>p.id===event.pair);if(participant&&rejectLateValidation(participant))return;
 if(co?.role==='student'){coQueue(event);return}
 try{const response=passageCore.transition(state,{...event,event:crypto.randomUUID()},new Date().toISOString());state=response.profile;app.profiles[stateMode]=state;save();passageFeedback(event,response)}catch(error){toast(error.message)}
}
function passageOpenCode(){
 const p=passageParticipant();if(!p||!p.startAt)return toast('Attendez le départ donné par l’enseignant');
 if(p.teacherPausedAt)return toast('Participant en pause : attendez l’enseignant');
 if(rejectLateValidation(p))return;
 const list=passageCore.choices(state,p);
 if(!list.length)return toast('Lot terminé : repartez pour recevoir les prochaines balises');
 studentBeaconId=list[0].id;studentDigits='';studentBusy=false;
 $('#studentCodeName').textContent=pairName(p);$('#studentBeaconChoiceWrap').hidden=list.length===1;
 $('#studentBeaconChoice').innerHTML=list.map(b=>`<option value="${esc(b.id)}">Balise ${esc(b.courseNumber||b.number)}</option>`).join('');
 $('#studentBeaconLarge').textContent=list[0].courseNumber||list[0].number;$('#studentCodeValue').textContent='';
 const x=passageCore.prepare(state,p),max=passageCore.maximum(state);
 $('#passageProgress').textContent=`${x.visit.touched.length} balise(s) traitée(s) ce passage · ${max?'maximum '+max:'libre'}`;
 $('#studentSkip').hidden=state.courses.find(c=>c.id===courseBaseId(p.courseId))?.orderMode!=='imposed';
 $('#studentValidate').hidden=false;$('#studentCodeKeys').hidden=false;$('#studentFeedbackDialog').close();
 const d=$('#studentCodeDialog');if(!d.open)d.showModal();
}
openStudentCard=function(id){
 if(!passageCore.enabled(state))return passageOldOpen(id);
 const p=state.pairs.find(p=>p.id===id);if(!p)return;
 if(co?.outbox?.length)return toast('Attendez la transmission de l’action précédente');
 studentPairId=id;
 if(!p.startAt)return toast('Attendez le départ donné par l’enseignant');
 if(p.teacherPausedAt)return toast('Participant en pause : attendez l’enseignant');
 if(p.endAt||p.end)return toast('Épreuve terminée');
 const last=passageCore.pending(state,p);
 if(last)return passageFeedback({kind:'visit',command:last.skipped?'skip':'answer'},{found:last.found,attempt:last.id,skipped:last.skipped});
 passageOpenCode();
};
submitStudentAttempt=function(skip=false){
 if(!passageCore.enabled(state))return passageOldSubmit(skip);
 if(!skip&&!studentDigits)return toast('Saisissez votre code');
 passageSend(passageEvent(skip?'skip':'answer',studentBeaconId,studentDigits));
};
studentDepart=function(retry){
 if(!passageCore.enabled(state))return passageOldDepart(retry);
 passageSend({...passageEvent('depart'),retry:!!retry});
};
function passageFeedback(event,response){
 const p=state.pairs.find(p=>p.id===event.pair)||passageParticipant();if(!p)return;studentPairId=p.id;
 if(event.command==='continue')return passageOpenCode();
 $('#studentCodeDialog').close();
 if(event.command==='depart'){
  $('#studentFeedbackDialog').close();
  const list=passageCore.batch(state,p),imposed=state.courses.find(c=>c.id===courseBaseId(p.courseId))?.orderMode==='imposed';
  $('#studentDestinationNumber').textContent=list.length?(imposed?list.map(b=>b.courseNumber||b.number).join(' · '):'Ordre libre'):'Terminé';
  $('#studentDestinationNumber').style.fontSize=list.length>3?'clamp(28px,7vw,54px)':'';
  const d=$('#studentDestinationDialog');if(!d.open)d.showModal();return;
 }
 const last=passageCore.pending(state,p);studentWrong=!response.found;coLastAttempt=response.attempt;
 const dialog=$('#studentFeedbackDialog');dialog.className=response.found?'correct':'incorrect';
 $('#studentFeedbackTitle').textContent=response.skipped?'Balise reportée':response.found?'VRAI':'FAUX';
 $('#studentFeedbackNext').hidden=true;$('#studentReturn').hidden=true;
 $('#studentRetry').hidden=response.found||response.skipped;$('#studentRetry').textContent='Retenter dans le prochain lot';
 $('#studentContinue').textContent=last&&!last.found?'Reporter et repartir':'Je repars';
 $('#studentMore').hidden=!passageCore.canContinue(state,p);$('#studentMore').textContent=last&&!last.found?'Reporter et saisir une autre balise':'Saisir une autre balise';
 if(!dialog.open)dialog.showModal();
}
coFeedback=function(event,response){
 if(event.kind==='visit')return passageFeedback(event,response);
 $('#studentMore').hidden=true;$('#studentRetry').textContent='Retenter';return passageOldFeedback(event,response);
};
$('#studentMore').onclick=()=>passageSend(passageEvent('continue'));
let passageLastLimit=passageCore.maximum(state)||1;
function passageRenderLimit(){
 const max=passageCore.maximum(state),locked=!!state.sessionStartedAt;
 if(max)passageLastLimit=max;
 $('#passageFree').checked=max===0;$('#passageLimited').checked=max!==0;
 $('#passageFree').disabled=locked;$('#passageLimited').disabled=locked;
 $('#passageCountWrap').hidden=max===0;
 $('#maxBeaconsPerVisit').value=String(max||passageLastLimit||1);$('#maxBeaconsPerVisit').disabled=locked||max===0;
}
function passageChooseLimit(free){
 if(state.sessionStartedAt){passageRenderLimit();return}
 state.settings.maxBeaconsPerVisit=free?0:Math.min(20,Math.max(1,passageLastLimit||1));save();
}
$('#passageFree').onchange=()=>passageChooseLimit(true);
$('#passageLimited').onchange=()=>passageChooseLimit(false);
$('#maxBeaconsPerVisit').onchange=()=>{
 if(state.sessionStartedAt){passageRenderLimit();return toast('Terminez la séance avant de modifier ce réglage')}
 const value=Number($('#maxBeaconsPerVisit').value);
 if(!Number.isInteger(value)||value<1||value>20){passageRenderLimit();return toast('Choisissez un nombre entier de 1 à 20')}
 passageLastLimit=value;state.settings.maxBeaconsPerVisit=value;save();
};
const passageOldRender=render;
render=function(){passageOldRender();passageRenderLimit();const p=passageParticipant();$('#studentMore').hidden=!passageCore.enabled(state)||!p||!passageCore.pending(state,p)||!passageCore.canContinue(state,p)};
render();
