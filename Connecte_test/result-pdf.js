/* Export des résultats avec détail des balises, sans colonne Mode. */
(function(root){
'use strict';
function details(doc,p){
 const attempts=(doc.attempts||[]).filter(a=>a.pairId===p.id),good=new Set(attempts.filter(a=>a.found).map(a=>a.beaconId)),free=new Set(p.freeBeaconIds||[]),beacons=(doc.beacons||[]).filter(b=>p.courseId?b.courseId===p.courseId:free.has(b.id)).sort((a,b)=>Number(a.courseNumber||a.number)-Number(b.courseNumber||b.number));
 return{found:beacons.filter(b=>good.has(b.id)).map(b=>b.courseNumber||b.number),missing:beacons.filter(b=>!good.has(b.id)).map(b=>b.courseNumber||b.number)};
}
function create(){
 const third=isThirdFormat(),training=app.activeMode==='training',cfg=state.settings,accent=third?[111,39,49]:[23,63,58],today=new Date(),fmt=a=>a.length?a.join(', '):'—';
 let heads=third?['Élève(s)','Parcours','Contrat','Contrat /10','Validées','N1','N2','Base /20','Contrôle','Fin','Note /20']:['Élève(s)','Parcours','Validées','Points','Erreurs','Retard',...(training?[]:['Pénalité','Note /20'])];
 heads.splice(3,0,'Trouvées','Non trouvées');
 const body=state.pairs.map(p=>{const score=third?thirdStats(p):stats(p),course=courseForId(p.courseId),beacons=details(state,p);let row=third?[pairName(p),course?.name||'Sans parcours',String(p.thirdProject?.contract||'—'),score.contractScore==null?'—':String(score.contractScore),String(score.found),String(score.n1),String(score.n2),String(score.base),score.checkpoint.label,score.finish.label,String(score.final)]:[pairName(p),course?.name||((p.freeBeaconIds||[]).length?'Balises libres':'Sans parcours'),String(score.found),String(score.points),String(score.errors),score.late+' min',...(training?[]:['-'+score.pen,String(score.final)])];row.splice(3,0,fmt(beacons.found),fmt(beacons.missing));return row.map(value=>String(value).replace(/\u2212/g,'-'))});
 const scale=third?(cfg.thirdScales.find(s=>s.id===cfg.activeThirdScaleId)||cfg.thirdScales[0]):cfg.scales?.find(s=>s.id===cfg.activeScaleId);
 let scaleHeads=[],scaleRows=[];
 if(!training){if(third){const matrix=scale?.matrix||initialThirdMatrix,max=thirdMatrixMaxN2(matrix),cols=Array.from({length:max+1},(_,i)=>max-i);scaleHeads=['Validées',...cols.map(n=>n+' N2')];scaleRows=thirdMatrixRows(matrix).filter(n=>n>0).sort((a,b)=>b-a).map(n=>[String(n),...cols.map(c=>{const v=thirdTableScore(n,c);return v==null?'—':String(v).replace('.',',')})])}else{const width=Math.max(...Object.values(cfg.matrix).map(r=>r.length));scaleHeads=['Points',...Array.from({length:width},(_,i)=>i+(i===width-1?'+':'')+' err.')];scaleRows=pointRows().map(k=>{const row=cfg.matrix[k],last=row[row.length-1]??0;return[String(k),...Array.from({length:width},(_,i)=>String(row[i]??last))]})}}
 let last;
 for(const format of ['a4','a3'])for(const font of [7,6.25,5.5,5]){
  const doc=new root.jspdf.jsPDF({orientation:'landscape',unit:'mm',format}),w=doc.internal.pageSize.getWidth(),h=doc.internal.pageSize.getHeight(),margin=8,rightWidth=training?0:Math.max(75,w*.29),leftWidth=w-margin*2-(training?0:rightWidth+6),rightX=margin+leftWidth+6;
  doc.setFontSize(15);doc.setTextColor(...accent);doc.text(training?'Résultats de l’entraînement':third?'Évaluation course d’orientation 3e':'Évaluation course d’orientation 6e',margin,13);
  doc.setFontSize(8);doc.setTextColor(65,75,70);doc.text('Résultats et détail des balises · '+today.toLocaleString('fr-FR'),margin,19);
  const duration=third?cfg.third.duration:cfg.duration;
  let reminder='Durée : '+duration+' min · Barème : '+(scale?.name||'barème courant');
  if(third){const t=cfg.third;reminder+=' · Contrôle : '+(t.checkpointRequired?t.checkpointStart+'–'+t.checkpointEnd+' min ; pause '+t.regulationPause+' min':'non imposé')+' · Fin : '+(t.finishPenaltyEnabled?'-'+t.finishPenalty+' pts / '+t.finishStep+' min ; zéro après '+t.finishZeroAfter+' min':'sans pénalité')}else{reminder+=' · '+(cfg.penaltyEnabled?'Retard : -1 pt / '+cfg.lateStep+' min ; max -'+cfg.lateMax+' dès '+cfg.lateThreshold+' min, sur '+(cfg.penaltyTarget==='points'?'les points balises':'la note'):'Sans pénalité de retard')+' · '+Object.entries(cfg.levels).map(([n,v])=>n+' = '+v+' pt').join(' ; ')}
  const reminderLines=doc.splitTextToSize(reminder,w-2*margin);doc.setFontSize(7);doc.text(reminderLines,margin,24);const startY=26+reminderLines.length*3;
  doc.autoTable({startY,margin:{left:margin,right:w-margin-leftWidth,bottom:12},tableWidth:leftWidth,head:[heads],body,theme:'grid',styles:{fontSize:font,cellPadding:font*.14,textColor:[36,48,46],overflow:'linebreak',valign:'middle'},headStyles:{fillColor:accent,textColor:[255,255,255],fontSize:font},columnStyles:{0:{cellWidth:leftWidth*.14},1:{cellWidth:leftWidth*.12},3:{cellWidth:leftWidth*.15},4:{cellWidth:leftWidth*.15}},didParseCell:d=>{if(d.section==='body'&&d.column.index===3){d.cell.styles.textColor=[24,105,57]}if(d.section==='body'&&d.column.index===4)d.cell.styles.textColor=[145,44,51];if(!training&&d.section==='body'&&d.column.index===heads.length-1){const v=parseFloat(d.cell.raw);d.cell.styles.fillColor=noteColor(v);d.cell.styles.fontStyle='bold';if(v>18.5)d.cell.styles.textColor=[255,255,255]}}});
  if(!training){doc.setPage(1);doc.setFontSize(8);doc.setTextColor(...accent);doc.text('Barème appliqué : '+(scale?.name||'barème courant'),rightX,startY+2,{maxWidth:rightWidth});doc.autoTable({startY:startY+6,margin:{left:rightX,right:margin,bottom:12},tableWidth:rightWidth,head:[scaleHeads],body:scaleRows,theme:'grid',styles:{fontSize:Math.max(4.3,font-1.5),cellPadding:font*.085,halign:'center'},headStyles:{fillColor:accent,textColor:[255,255,255]},didParseCell:d=>{if(d.section==='body'&&d.column.index>0&&d.cell.raw!=='—'){const v=Number(String(d.cell.raw).replace(',','.'));d.cell.styles.fillColor=noteColor(v);if(v>18.5)d.cell.styles.textColor=[255,255,255]}}})}
  doc.setPage(1);doc.setTextColor(80,85,82);doc.setFontSize(7);doc.text('Numéros des balises du parcours. Non trouvées : erreurs et balises non tentées. Une réussite après une erreur compte comme trouvée.',margin,h-6);
  last=doc;if(doc.getNumberOfPages()===1)return doc;
 }
 throw new Error('Trop de données pour une seule page lisible : réduisez le nombre de participants ou de balises à exporter.');
}
root.COResultPdf={details,create};
downloadPdf=async function(){if(!state.pairs.length)return toast('Aucun résultat à exporter');if(!root.jspdf?.jsPDF)return toast('La création du PDF est indisponible');try{const doc=create(),day=new Date().toISOString().slice(0,10);return openPdfDocument(doc,'resultats-course-orientation-'+day+'.pdf','Résultats et détail des balises')}catch(error){toast(error.message)}};
downloadThirdPdf=downloadPdf;
})(window);
