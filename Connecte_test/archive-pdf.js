/* PDF des archives : uniquement les valeurs sauvegardées, sans recalcul de la séance actuelle. */
(function(root){
'use strict';
function create(archive){
 const third=archive.gradeFormat==='third',training=archive.mode==='training',value=x=>x==null?'—':String(x).replace(/\u2212/g,'-'),list=x=>Array.isArray(x)?(x.length?x.join(', '):'—'):'Non conservé';
 const hasDetails=archive.participants.some(p=>p.beaconResults);
 const heads=['Élève(s)','Parcours','Validées',...(hasDetails?['Trouvées','Non trouvées']:[]),'Points','Erreurs',...(third?['Contrat','Contrat /10','N1','N2']:[]),...(training?[]:['Pénalité','Note /20'])];
 const rows=archive.participants.map(p=>[p.name,p.course,value(p.found),...(hasDetails?[list(p.beaconResults?.found),list(p.beaconResults?.missing)]:[]),value(p.points),value(p.errors),...(third?[value(p.contract),value(p.contractScore),value(p.n1),value(p.n2)]:[]),...(training?[]:[value(p.penalty),value(p.final)])]);
 for(const format of ['a4','a3'])for(const font of [8,7,6,5]){
  const doc=new root.jspdf.jsPDF({orientation:'landscape',unit:'mm',format}),w=doc.internal.pageSize.getWidth(),h=doc.internal.pageSize.getHeight(),color=third?[111,39,49]:[23,63,58];
  doc.setTextColor(...color);doc.setFontSize(16);doc.text('Résultats archivés — '+(training?'Entraînement':third?'Évaluation 3e':'Évaluation 6e'),9,14);
  doc.setTextColor(65,75,70);doc.setFontSize(9);doc.text([archive.className,new Date(archive.createdAt).toLocaleString('fr-FR'),archive.duration+' min','Barème : '+(archive.scaleName||'non conservé')].filter(Boolean).join(' · '),9,21,{maxWidth:w-18});
  doc.autoTable({startY:28,head:[heads],body:rows,margin:{left:9,right:9,bottom:16},theme:'grid',styles:{fontSize:font,cellPadding:font*.16,overflow:'linebreak',textColor:[36,48,46]},headStyles:{fillColor:color,textColor:[255,255,255]},columnStyles:{0:{cellWidth:(w-18)*.14},1:{cellWidth:(w-18)*.12},...(hasDetails?{3:{cellWidth:(w-18)*.15},4:{cellWidth:(w-18)*.15}}:{})},didParseCell:d=>{if(d.section!=='body')return;if(hasDetails&&d.column.index===3)d.cell.styles.textColor=[24,105,57];if(hasDetails&&d.column.index===4)d.cell.styles.textColor=[145,44,51];if(!training&&d.column.index===heads.length-1&&d.cell.raw!=='—'){const v=parseFloat(d.cell.raw);d.cell.styles.fillColor=noteColor(v);d.cell.styles.fontStyle='bold';if(v>18.5)d.cell.styles.textColor=[255,255,255]}}});
  doc.setPage(1);doc.setFontSize(7);doc.setTextColor(80,85,82);doc.text(archive.participants.some(p=>!p.beaconResults)?'Ancienne archive : le détail des numéros de balises n’avait pas été conservé. Les scores ci-dessus sont ceux sauvegardés.':'Numéros des balises du parcours. Non trouvées : erreurs et balises non tentées. Résultats tels qu’archivés.',9,h-7,{maxWidth:w-18});
  if(doc.getNumberOfPages()===1)return doc;
 }
 throw new Error('Cette archive contient trop de données pour une seule page lisible.');
}
root.COArchivePdf={create};
root.downloadArchivePdf=function(id){const archive=app.archives.find(a=>a.id===id);if(!archive)return toast('Archive introuvable');if(!root.jspdf?.jsPDF)return toast('La création du PDF est indisponible');try{const doc=create(archive),date=new Date(archive.createdAt).toISOString().slice(0,10),safe=String(archive.id).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40);return openPdfDocument(doc,'archive-course-orientation-'+date+'-'+safe+'.pdf','Résultats archivés')}catch(error){toast(error.message)}};
})(window);
