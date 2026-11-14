/* Application CO — expérimentation de synchronisation. Aucun secret administrateur. */
const CO_ENDPOINT='https://uchekzoyzsaxodmltqeg.supabase.co/rest/v1/rpc/co_sync';
const CO_PUBLIC_KEY='sb_publishable_lpSjwNej0wNLNOpGRWA1PA_DwwJ3CzG';
const CO_STORE='co-shared-connection-v1';
let co=JSON.parse(localStorage.getItem(CO_STORE)||'null'),coBaseline=null,coBusy=false,coApplying=false,coError='',coLast=0,coJoining=false,coLaunching=false;
const coLocalSave=save,coLocalSubmit=submitStudentAttempt,coLocalDepart=studentDepart,coLocalAccess=studentAccess;
const coClone=x=>JSON.parse(JSON.stringify(x)),coEq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function coPersist(){localStorage.setItem(CO_STORE,JSON.stringify(co))}
function coSecret(){let a=new Uint8Array(32);crypto.getRandomValues(a);return Array.from(a,x=>x.toString(16).padStart(2,'0')).join('')}
function coClean(profile){let p=coClone(profile);delete p.lastSessionResults;delete p.studentCourseFilter;delete p.studentTerrain;delete p.tabletSetupPending;p.terrainModeActive=!!p.sessionStartedAt;return p}
function coDiff(old,current){let ops=[];for(let k of new Set([...Object.keys(old),...Object.keys(current)])){if(['pairs','attempts'].includes(k)){let a=new Map((old[k]||[]).map(x=>[x.id,x])),b=new Map((current[k]||[]).map(x=>[x.id,x]));for(let [id,x] of a)if(!b.has(id))ops.push({field:k,id,delete:true});for(let [id,x] of b){let before=a.get(id);if(!before){ops.push({field:k,id,set:x});continue}let set={},remove=[];for(let f of new Set([...Object.keys(before),...Object.keys(x)])){if(!(f in x))remove.push(f);else if(!coEq(before[f],x[f]))set[f]=x[f]}if(Object.keys(set).length||remove.length)ops.push({field:k,id,set,remove})}}else if(!coEq(old[k],current[k]))ops.push(k in current?{field:k,value:current[k]}:{field:k,delete:true})}return ops}
function coApply(doc,ops){doc=coClone(doc);for(let op of ops){if(op.id){let a=doc[op.field]||[],idx=a.findIndex(x=>x.id===op.id);if(op.delete){if(idx>=0)a.splice(idx,1)}else{let x=idx>=0?a[idx]:{};for(let k of op.remove||[])delete x[k];Object.assign(x,op.set||{});if(idx>=0)a[idx]=x;else a.push(x)}doc[op.field]=a}else if(op.delete)delete doc[op.field];else doc[op.field]=coClone(op.value)}return doc}
async function coRpc(data,connection=co){let controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{let response=await fetch(CO_ENDPOINT,{method:'POST',headers:{apikey:CO_PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify({request:{...data,session:connection.session,token:connection.token,device:connection.device,deviceName:connection.deviceName}}),signal:controller.signal,cache:'no-store'});let body=await response.json();if(!response.ok)throw Error(body.message||'Connexion refusée');return body}finally{clearTimeout(timer)}}
function coInstall(response,lateOps=[]){let filter=state.studentCourseFilter||'',retained=state.lastSessionResults,teacherTerrainActive=state.terrainModeActive,tabletSetupPending=state.tabletSetupPending;state=coApply(response.profile,lateOps);state.settings=state.settings||{};if(co.role==='student'){state.studentTerrain=true;state.studentCourseFilter=(state.courses||[]).some(c=>c.id===filter)?filter:'';delete state.settings.teacherPin;state.terrainModeActive=!!response.profile.sessionStartedAt}else{state.studentTerrain=false;state.tabletSetupPending=!!state.sessionStartedAt&&!!tabletSetupPending;state.terrainModeActive=!!state.sessionStartedAt&&!!teacherTerrainActive;if(retained)state.lastSessionResults=retained}app.activeMode=response.mode;stateMode=response.mode;app.profiles[stateMode]=state;coBaseline=coClean(response.profile);coApplying=true;try{coLocalSave(false)}finally{coApplying=false}coLast=Date.now();coError='';coRenderStatus(response.devices);}
function coRenderStatus(devices){let el=document.querySelector('#coStatus');if(!el)return;el.textContent=!co?'Mode local indépendant':coError?'⚠ '+coError:co.outbox?.length?'En attente : '+co.outbox.length+' action(s)':'Synchronisé · '+(co.role==='teacher'?'Centre enseignant':'Borne élève');if(co?.role==='teacher'&&devices){document.querySelector('#coDevices').textContent=devices.map(d=>d.name+' : '+(Date.now()-new Date(d.seenAt)<15000?'connectée':'sans nouvelles')).join(' · ')}}
function coCanShareCurrentSession(){
 return co?.role==='teacher'&&!!state.sessionStartedAt&&state.studentTabletsEnabled===true&&co.startedAt===state.sessionStartedAt&&(!co.mode||co.mode===app.activeMode)&&!!co.studentToken;
}
function coRefreshShareButton(){
 const button=document.querySelector('#coShare');if(button)button.hidden=!coCanShareCurrentSession();
 if(!coCanShareCurrentSession()){
  const dialog=document.querySelector('#coInvitationDialog');if(dialog?.open)dialog.close();
  const link=document.querySelector('#coInvitation');if(link)link.value='';
  const canvas=document.querySelector('#coInvitationQR');if(canvas)canvas.hidden=true;
 }
}
function coUpdateToolbar(){
 const student=co?.role==='student';
 document.querySelector('#coCreate').hidden=true;document.querySelector('#coJoin').hidden=true;
 coRefreshShareButton();
 document.querySelector('#coLeave').hidden=true;
 coRenderStatus();coRenderLaunchChoices();
}
async function coTick(){
 if(!co||coBusy||coJoining||coLaunching||document.hidden)return;
 const connection=co,stillCurrent=()=>co===connection&&!coJoining&&!coLaunching;
 coBusy=true;
 try{
  if(connection.role==='teacher'){
   let sent=coClean(state),ops=coBaseline?coDiff(coBaseline,sent):(connection.pendingOps||[]);
   connection.pendingOps=ops;coPersist();
   let response=await coRpc({action:ops.length?'patch':'read',ops},connection);
   if(!stillCurrent())return;
   let late=coDiff(sent,coClean(state));connection.pendingOps=[];coPersist();coInstall(response,late);
  }else if(connection.outbox?.length){
   let event=connection.outbox[0],response;
   try{response=await coRpc({action:'student',...event},connection)}catch(error){
    if(!stillCurrent())return;
    if(error.name==='AbortError'||!navigator.onLine||error.message==='Failed to fetch')throw error;
    connection.outbox.shift();connection.rejected=connection.rejected||[];
    connection.rejected.push({...event,error:error.message});coPersist();throw error;
   }
   if(!stillCurrent())return;
   connection.outbox.shift();coPersist();coInstall(response);coFeedback(event,response);
  }else{
   let response=await coRpc({action:'read'},connection);
   if(!stillCurrent())return;
   coInstall(response);
  }
 }catch(error){if(stillCurrent()){coError=error.name==='AbortError'?'Connexion lente · données conservées':error.message;coRenderStatus();renderStudentStation();toast(coError)}}
 finally{coBusy=false;coUpdateToolbar()}
}
save=function(recordUndo=true){coLocalSave(recordUndo);if(co?.role==='teacher'&&!coApplying){co.pendingOps=coBaseline?coDiff(coBaseline,coClean(state)):(co.pendingOps||[]);coPersist();coTick()}};
function coRenderLaunchChoices(){
 coRefreshShareButton();
 const students=document.querySelector('#sessionDevicesStudents'),teacher=document.querySelector('#sessionDevicesTeacher');
 if(!students||!teacher)return;
 const shared=state.studentTabletsEnabled??(co?.role==='teacher');
 students.checked=!!shared;teacher.checked=!shared;
 students.disabled=teacher.disabled=coLaunching||!!state.sessionStartedAt;
 const button=document.querySelector('#checkSessionStart');
 button.disabled=coLaunching;
 button.textContent=coLaunching?'Connexion des tablettes…':state.sessionStartedAt?(state.tabletSetupPending?'Afficher le QR code des tablettes élèves':'Revenir au terrain enseignant'):'Lancer la séance';
 const error=document.querySelector('#coLaunchError');if(error)error.textContent=coError;
}
function coChooseDevices(shared){
 if(co?.role==='student'||state.sessionStartedAt||coLaunching)return;
 state.studentTabletsEnabled=shared;coLocalSave(false);coRenderLaunchChoices();
}
function coEnterTeacherTerrain(){
 if(co?.role==='student'||!state.sessionStartedAt||coLaunching)return;
 state.tabletSetupPending=false;state.studentTerrain=false;state.terrainModeActive=true;
 document.querySelector('#coInvitationDialog').close();save(false);activateView('live');coRenderLaunchChoices();
}
async function coLaunchSession(forced=false){
 if(co?.role==='student'||coLaunching)return;
 if(state.sessionStartedAt&&!state.tabletSetupPending)return coEnterTeacherTerrain();
 const shared=state.studentTabletsEnabled??(co?.role==='teacher');
 const existingStart=state.sessionStartedAt;
 if(!state.pairs.length)return toast('Ajoutez les participants');
 document.querySelector('#sessionCheckDialog').close();
 if(!shared){
  // Ne pas envoyer la séance locale à une ancienne connexion partagée.
  if(co){localStorage.setItem('co-last-teacher-connection',JSON.stringify(co));co=null;coBaseline=null;localStorage.removeItem(CO_STORE)}
  delete state.lastSessionResults;state.studentTabletsEnabled=false;state.sessionStartedAt=existingStart||new Date().toISOString();state.sessionStartForced=forced;
  state.tabletSetupPending=false;state.studentTerrain=false;state.terrainModeActive=true;
  coLocalSave(false);activateView('live');coUpdateToolbar();return;
 }
 if(existingStart&&co?.role==='teacher'&&co.startedAt===existingStart)return coShare();
 coLaunching=true;coError='';coRenderLaunchChoices();
 const candidate={session:crypto.randomUUID(),token:coSecret(),studentToken:coSecret(),device:crypto.randomUUID(),deviceName:'Tablette enseignant',role:'teacher',mode:app.activeMode,outbox:[],startedAt:existingStart||new Date().toISOString()};
 try{
  const profile=coClean(state);profile.sessionStartedAt=candidate.startedAt;profile.studentTabletsEnabled=true;profile.sessionStartForced=forced;profile.terrainModeActive=true;delete profile.lastSessionResults;
  const response=await coRpc({action:'create',studentToken:candidate.studentToken,profile,mode:app.activeMode},candidate);
  if(!response.profile||!['evaluation','training'].includes(response.mode))throw Error('La séance partagée n’a pas pu être créée');
  if(co)localStorage.setItem('co-last-teacher-connection',JSON.stringify(co));
  co=candidate;coBaseline=null;coPersist();
  delete state.lastSessionResults;state.tabletSetupPending=true;state.terrainModeActive=false;
  coInstall(response);activateView('pairs');await coShare();
 }catch(error){coError='Connexion impossible : '+error.message;toast(coError)}
 finally{coLaunching=false;coUpdateToolbar()}
}
async function coCreate(){return coLaunchSession(false)}
validateSessionStart=function(forced=false){return coLaunchSession(forced)};
toggleSessionStart=function(){
 if(co?.role==='student'||coLaunching)return;
 if(state.sessionStartedAt){if(state.tabletSetupPending)return coLaunchSession(state.sessionStartForced);return coEnterTeacherTerrain()}
 openSessionCheck();
};
const coOriginalRender=render;
render=function(){coOriginalRender();coRenderLaunchChoices()};
function coDrawInvitationQR(value){let canvas=document.querySelector('#coInvitationQR');try{let qr=new window.COQRCode(-1,window.COQRErrorLevel.M);qr.addData(value);qr.make();let count=qr.getModuleCount(),unit=8,quiet=4;canvas.width=canvas.height=(count+quiet*2)*unit;let context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.fillStyle='#000';for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(qr.isDark(r,c))context.fillRect((c+quiet)*unit,(r+quiet)*unit,unit,unit);canvas.hidden=false}catch(error){canvas.hidden=true;toast('QR indisponible : utilisez le lien à copier');console.error(error)}}
async function coShare(){
 if(!coCanShareCurrentSession()){coRefreshShareButton();return toast('Lancez d’abord la séance actuelle avec les tablettes élèves.')}
 const connection=co,startedAt=state.sessionStartedAt,mode=app.activeMode;
 const dialog=document.querySelector('#coInvitationDialog'),link=document.querySelector('#coInvitation'),canvas=document.querySelector('#coInvitationQR');
 // Aucun ancien lien n'est visible pendant la vérification du partage.
 if(dialog.open)dialog.close();link.value='';canvas.hidden=true;
 try{
  const response=await coRpc({action:'read'},connection);
  if(co!==connection||state.sessionStartedAt!==startedAt||app.activeMode!==mode||!coCanShareCurrentSession())return;
  if(response.mode!==mode||response.profile?.sessionStartedAt!==startedAt)return toast('Ce partage ne correspond plus à la séance actuelle. Aucun QR code affiché.');
  let url=new URL(location.href);url.hash='co='+encodeURIComponent(connection.session+'.'+connection.studentToken);
  link.value=url.href;coDrawInvitationQR(url.href);dialog.showModal();
 }catch(error){toast('Impossible de vérifier le QR de cette séance : '+error.message)}
}

async function coJoin(invitation){
 if(coJoining)return;
 if(co?.role==='teacher')return toast('Cette tablette est le centre enseignant. Ouvrez le QR code sur une borne élève.');
 const value=invitation||prompt('Collez le lien transmis par l’enseignant');
 if(!value)return;
 let session,token;
 try{
  const payload=value.includes('#co=')?decodeURIComponent(value.split('#co=')[1]):value;
  const parts=payload.trim().split('.');[session,token]=parts;
  if(parts.length!==2||!/^[a-f0-9-]{36}$/.test(session)||!/^[a-f0-9]{64}$/.test(token))throw Error();
 }catch{return toast('Lien de séance invalide')}
 if(co?.session===session&&co.token===token){activateView('live');return coTick()}
 if(co?.outbox?.length){coTick();return toast('Une réponse de la séance précédente attend sa transmission. Reconnectez la borne, attendez la confirmation, puis scannez à nouveau le QR code.');}
 const previous=co;
 const candidate={session,token,device:previous?.device||crypto.randomUUID(),deviceName:previous?.deviceName||prompt('Nom de la borne','Tablette élèves')||'Tablette élèves',role:'student',outbox:[]};
 coJoining=true;
 try{
  // Vérifier le nouveau lien avant de remplacer la connexion précédente.
  const response=await coRpc({action:'read'},candidate);
  if(!response.profile||!['evaluation','training'].includes(response.mode))throw Error('Réponse de séance invalide');
  if(!previous)localStorage.setItem('co-before-shared',JSON.stringify(app));
  else localStorage.setItem('co-previous-student-connection',JSON.stringify(previous));
  co=candidate;coBaseline=null;coLastAttempt='';coPersist();
  state.studentCourseFilter='';studentPairId='';studentBeaconId='';studentDigits='';
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  coInstall(response);activateView('live');coUpdateToolbar();
 }catch(error){toast(error.message||'Impossible de rejoindre la séance. La connexion précédente est conservée.')}
 finally{coJoining=false}
}
function coLeave(){if(co?.role==='student')return toast('Cette borne est réservée aux élèves. La séance est gérée depuis le centre enseignant.');if(co?.outbox?.length)return toast('Des actions attendent encore leur transmission');if(!confirm('Revenir au fonctionnement local ? La séance en ligne ne sera pas effacée.'))return;co=null;coBaseline=null;localStorage.removeItem(CO_STORE);state.studentTerrain=false;state.terrainModeActive=false;coLocalSave();activateView('pairs');coUpdateToolbar()}
function coQueue(event){if(co.outbox?.length)return toast('Attendez la transmission de l’action précédente');co.outbox=[{...event,event:crypto.randomUUID()}];coPersist();coRenderStatus();coTick()}
submitStudentAttempt=function(skip=false){if(co?.role!=='student')return coLocalSubmit(skip);let p=state.pairs.find(p=>p.id===studentPairId);if(!p)return;if(p.teacherPausedAt)return toast('Participant en pause : attendez l’enseignant');if(!skip&&!studentDigits)return toast('Saisissez votre code');coQueue({kind:skip?'skip':'attempt',pair:p.id,course:p.courseId,beacon:studentBeaconId,code:studentDigits})};
let coLastAttempt='';
function coFeedback(event,response){if(event.kind==='attempt'||event.kind==='skip'){studentPairId=event.pair;studentBeaconId=event.beacon;coLastAttempt=response.attempt;studentWrong=!response.found;let p=state.pairs.find(p=>p.id===event.pair);if(!p)return;document.querySelector('#studentCodeDialog').close();let dialog=document.querySelector('#studentFeedbackDialog');dialog.className=response.found?'correct':'incorrect';document.querySelector('#studentFeedbackTitle').textContent=event.kind==='skip'?'Balise passée':response.found?'VRAI':'FAUX';document.querySelector('#studentFeedbackNext').textContent=nextBeaconLabel(p);document.querySelector('#studentFeedbackNext').hidden=true;document.querySelector('#studentReturn').hidden=true;document.querySelector('#studentRetry').hidden=response.found||event.kind==='skip';document.querySelector('#studentContinue').textContent=response.found||event.kind==='skip'?'Je repars':'Passer à la suivante';if(!dialog.open)dialog.showModal()}else{document.querySelector('#studentFeedbackDialog').close();let p=state.pairs.find(p=>p.id===event.pair),next=p&&orderedRemaining(p)[0];document.querySelector('#studentDestinationNumber').textContent=next?(next.courseNumber||next.number):'Terminé';let d=document.querySelector('#studentDestinationDialog');if(!d.open)d.showModal()}}
studentDepart=function(retry){if(co?.role!=='student')return coLocalDepart(retry);let p=state.pairs.find(p=>p.id===studentPairId);if(!p)return;coQueue({kind:retry?'retry':'next',pair:p.id,course:p.courseId,attempt:coLastAttempt})};
// Mise à jour visible au retour du réseau et de la veille. Aucun effacement de l'outbox.
window.addEventListener('online',coTick);document.addEventListener('visibilitychange',coTick);setInterval(coTick,2500);
// Les anciennes commandes restent internes ; le lancement est intégré à la configuration.
const coUi=document.createElement('div');coUi.hidden=true;
coUi.innerHTML='<button id="coCreate" hidden></button><button id="coJoin" hidden></button><button id="coLeave" hidden></button>';
document.body.append(coUi);
document.querySelector('#sessionLaunchCard').insertAdjacentHTML('beforeend','<p id="coLaunchError" role="alert"></p>');
document.querySelector('#sessionDevicesStudents').onchange=()=>coChooseDevices(true);
document.querySelector('#sessionDevicesTeacher').onchange=()=>coChooseDevices(false);
let joinHome=document.createElement('button');joinHome.textContent='Rejoindre une séance élève';joinHome.style.cssText='width:100%;margin:12px 0';joinHome.onclick=()=>coJoin();document.querySelector('#view-home').prepend(joinHome);
let invitationDialog=document.createElement('dialog');invitationDialog.id='coInvitationDialog';invitationDialog.innerHTML='<div class="modal"><h3>Connecter les tablettes élèves</h3><p>Scannez ce QR code avec chaque tablette élève, puis ouvrez le lien détecté.</p><canvas id="coInvitationQR" role="img" aria-label="QR code pour rejoindre la séance en mode élève" style="display:block;width:min(100%,360px);height:auto;margin:12px auto;image-rendering:pixelated;background:#fff"></canvas><button type="button" id="coStudentsReady">Tablettes élèves prêtes</button><p class="dialog-help">Quand toutes les bornes sont connectées, ouvrez le terrain enseignant. Les chronomètres des élèves seront déclenchés depuis cet écran.</p><textarea id="coInvitation" rows="5" readonly></textarea><button type="button" id="coCopy" style="width:100%;margin:8px 0">Copier le lien</button><button type="button" onclick="this.closest(\'dialog\').close()">Revenir à la configuration</button></div>';document.body.append(invitationDialog);
document.querySelector('#coStudentsReady').onclick=coEnterTeacherTerrain;
document.querySelector('#coCreate').onclick=coCreate;document.querySelector('#coJoin').onclick=()=>coJoin();document.querySelector('#coShare').onclick=coShare;document.querySelector('#coLeave').onclick=coLeave;document.querySelector('#coCopy').onclick=async()=>{try{await navigator.clipboard.writeText(document.querySelector('#coInvitation').value);toast('Lien copié')}catch{document.querySelector('#coInvitation').select()}};
// Une borne reste une borne, y compris entre deux séances.
studentAccess=function(){if(co?.role!=='student')return coLocalAccess();toast('La séance est gérée depuis la tablette enseignant.')};
const coOriginalActivateView=activateView;
activateView=function(name){return coOriginalActivateView(co?.role==='student'?'live':name)};
const coOriginalRenderStudent=renderStudentStation;
renderStudentStation=function(){
 const locked=co?.role==='student';document.body.classList.toggle('co-student-lock',locked);
 if(!locked)return coOriginalRenderStudent();
 state.studentTerrain=true;
 const root=document.querySelector('#studentStation');
 if(state.sessionStartedAt&&state.terrainModeActive){
  coOriginalRenderStudent();
  // Retirer le bouton supprime aussi ses gestionnaires d'appui prolongé.
  document.querySelector('#studentTeacherAccess')?.remove();
 }else{
  document.body.classList.add('student-station');
  root.innerHTML='<h2>Borne élève</h2><p>La séance est terminée ou en attente de lancement.</p><p>La séance est gérée depuis la tablette enseignant. Pour rejoindre une autre séance, scannez son QR code.</p>';
 }
 const allowed=new Set(['studentCodeDialog','studentFeedbackDialog','studentDestinationDialog']);
 document.querySelectorAll('dialog[open]').forEach(d=>{if(!allowed.has(d.id)||!state.sessionStartedAt)d.close()});
 let status=document.querySelector('#coStudentStatus');
 if(!status){status=document.createElement('p');status.id='coStudentStatus';root.prepend(status)}
 status.textContent=coError?'⚠ '+coError:co.outbox?.length?'En attente de transmission · ne fermez pas la séance':'Connecté à la séance enseignant';
};
const coLockStyle=document.createElement('style');
coLockStyle.textContent='body.co-student-lock nav,body.co-student-lock main>.view:not(#view-live),body.co-student-lock #view-live>:not(#terrainDashboard),body.co-student-lock #terrainDashboard>:not(#studentStation){display:none!important}body.co-student-lock #view-live,body.co-student-lock #terrainDashboard,body.co-student-lock #studentStation{display:block!important}body.co-student-lock{padding-bottom:24px!important}';
document.head.append(coLockStyle);
function coReadInvitation(){
 if(!location.hash.startsWith('#co='))return false;
 const invitation=location.href;history.replaceState(null,'',location.pathname+location.search);coJoin(invitation);return true;
}
window.addEventListener('hashchange',coReadInvitation);
coUpdateToolbar();
if(co){coBaseline=co.pendingOps?.length?null:coClean(state);if(co.role==='student'){state.studentTerrain=true;state.terrainModeActive=!!state.sessionStartedAt;activateView('live')}}
if(!coReadInvitation())coTick();
const coOriginalOpenStudent=openStudentCard;
openStudentCard=function(id){if(co?.role==='student'){let p=state.pairs.find(p=>p.id===id);if(p?.teacherPausedAt)return toast('Participant en pause : attendez l’enseignant');let last=[...state.attempts].reverse().find(a=>a.pairId===id&&a.returnId&&!a.nextDepartureAt);if(last){coFeedback({kind:last.skipped?'skip':'attempt',pair:id,beacon:last.beaconId},{attempt:last.id,found:last.found});return}}coOriginalOpenStudent(id)};
