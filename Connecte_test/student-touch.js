/* Gestes de zoom limités au terrain élève ; défilement et saisie conservés. */
(function(){
'use strict';
const viewport=document.querySelector('meta[name="viewport"]'),originalViewport=viewport?.getAttribute('content')||'';
function locked(){return (typeof co!=='undefined'&&co?.role==='student')||document.body.classList.contains('student-station')}
function sync(){let enabled=locked();document.documentElement.classList.toggle('student-zoom-locked',enabled);if(viewport){let value=enabled?'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover':originalViewport;if(viewport.getAttribute('content')!==value)viewport.setAttribute('content',value)}}
function stopZoom(event){if(locked()&&event.cancelable)event.preventDefault()}
document.addEventListener('gesturestart',stopZoom,{passive:false,capture:true});
document.addEventListener('gesturechange',stopZoom,{passive:false,capture:true});
document.addEventListener('touchmove',event=>{if(event.touches?.length>1)stopZoom(event)},{passive:false,capture:true});
document.addEventListener('dblclick',stopZoom,{passive:false,capture:true});
document.addEventListener('wheel',event=>{if(event.ctrlKey)stopZoom(event)},{passive:false,capture:true});
const previous=renderStudentStation;renderStudentStation=function(){let result=previous.apply(this,arguments);sync();return result};
new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
sync();
})();
