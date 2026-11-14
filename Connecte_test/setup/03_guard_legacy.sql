CREATE OR REPLACE FUNCTION public.co_sync(request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 s co_private.sessions%rowtype; sid uuid; action text:=request->>'action'; secret text:=request->>'token'; teacher boolean:=false;
 doc jsonb; p jsonb; b jsonb; inv jsonb; rec jsonb; item jsonb; arr jsonb; runs jsonb; run jsonb; idx int; bi int; course jsonb;
 eid uuid; old_result jsonb; good boolean; expected text; stamp text; duration numeric; paused numeric; elapsed numeric; selected text; first_id text;
 response jsonb; skipped jsonb; epoch double precision; last_attempt jsonb;
begin
 if action not in ('create','read','patch','student') then raise exception 'Action inconnue'; end if;
 sid:=(request->>'session')::uuid;
 if action='create' then
  if length(secret)<40 or length(request->>'studentToken')<40 then raise exception 'Accès invalide'; end if;
  if jsonb_typeof(request->'profile')<>'object' then raise exception 'Configuration invalide'; end if;
  insert into co_private.sessions(id,teacher_hash,student_hash,profile,mode)
  values(sid,encode(sha256(convert_to(secret,'UTF8')),'hex'),encode(sha256(convert_to(request->>'studentToken','UTF8')),'hex'),request->'profile',request->>'mode');
 end if;
 select * into s from co_private.sessions where id=sid for update;
 if not found or s.expires_at<now() then raise exception 'Séance introuvable ou expirée'; end if;
 teacher:=s.teacher_hash=encode(sha256(convert_to(coalesce(secret,''),'UTF8')),'hex');
 if not teacher and s.student_hash<>encode(sha256(convert_to(coalesce(secret,''),'UTF8')),'hex') then raise exception 'Accès refusé'; end if;
 doc:=s.profile;
 if action='student' and coalesce((doc#>>'{settings,maxBeaconsPerVisit}')::integer,1)<>1 then raise exception 'Actualisez la borne pour utiliser les passages par lots';end if;
 if action='patch' then
  if not teacher then raise exception 'Accès enseignant requis'; end if;
  if jsonb_array_length(request->'ops')>1000 then raise exception 'Trop de modifications'; end if;
  doc:=co_private.patch_profile(doc,request->'ops');
 elsif action='student' then
  if teacher then raise exception 'Accès borne requis'; end if;
  eid:=(request->>'event')::uuid;
  select result into old_result from co_private.receipts where session_id=sid and receipts.event_id=eid;
  if found then return old_result; end if;
  if not coalesce((doc->>'terrainModeActive')::boolean,false) or doc->>'sessionStartedAt' is null then raise exception 'Séance non lancée ou terminée'; end if;
  select value,ordinality::int-1 into p,idx from jsonb_array_elements(doc->'pairs') with ordinality where value->>'id'=request->>'pair';
  if p is null or p->>'endAt' is not null or p->>'end' is not null then raise exception 'Participant terminé ou introuvable'; end if;
  if p->>'startAt' is null then raise exception 'Départ non déclenché par l’enseignant'; end if;
  if p->>'teacherPausedAt' is not null then raise exception 'Participant en pause : attendez l’enseignant'; end if;
  if request->>'course' is distinct from p->>'courseId' then raise exception 'Parcours modifié : rechargez la carte'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  duration:=coalesce((case when doc#>>'{settings,gradeFormat}'='third' then doc#>>'{settings,third,duration}' else doc#>>'{settings,duration}' end)::numeric,40);
  elapsed:=case when p->>'startAt' is null then 0 else extract(epoch from (now()-(p->>'startAt')::timestamptz))*1000-coalesce((p->>'teacherPausedMs')::numeric,0) end;
  if elapsed>=duration*60000 then raise exception 'Temps réglementaire dépassé'; end if;
  if request->>'kind' in ('attempt','skip') then
   select value into b from jsonb_array_elements(doc->'beacons') where value->>'id'=request->>'beacon' and value->>'courseId'=p->>'courseId';
   if b is null then raise exception 'Balise hors parcours'; end if;
   if exists(select 1 from jsonb_array_elements(doc->'attempts') a where a->>'pairId'=p->>'id' and a->>'beaconId'=b->>'id' and (a->>'found')::boolean) then raise exception 'Balise déjà validée'; end if;
   select value into course from jsonb_array_elements(doc->'courses') where value->>'id'=split_part(p->>'courseId','::',1);
   if course->>'orderMode'='imposed' then
    -- Le même ordre que la borne : priorité retenter, puis ordre enregistré, puis balises passées.
    select bb.value->>'id' into first_id from jsonb_array_elements(doc->'beacons') bb where bb.value->>'courseId'=p->>'courseId'
     and not exists(select 1 from jsonb_array_elements(doc->'attempts') aa where aa->>'pairId'=p->>'id' and aa->>'beaconId'=bb.value->>'id' and (aa->>'found')::boolean)
     order by case when bb.value->>'id'=p->>'retryOrderBeacon' then -1 else 0 end,
      case when coalesce(p->'skippedOrderBeacons','[]') ? (bb.value->>'id') then 1 else 0 end,
      coalesce((select oo.ordinality from jsonb_array_elements_text(course#>array['variantOrders',split_part(p->>'courseId','::',2)]) with ordinality oo where oo.value=coalesce(bb.value->>'courseNumber',bb.value->>'number')),999)
     limit 1;
    if first_id is distinct from b->>'id' then raise exception 'Balise attendue modifiée : rechargez la carte'; end if;
   end if;
   select value into inv from jsonb_array_elements(doc->'inventory') where value->>'id'=b->>'inventoryId';
   expected:=inv#>>array['codes',p->>'codeKey'];
   if expected is null or expected='' then raise exception 'Correction manquante : contactez l’enseignant'; end if;
   if request->>'kind'='attempt' and coalesce(request->>'code','') !~ '^[0-9]+$' then raise exception 'Code numérique requis'; end if;
   good:=request->>'kind'='attempt' and trim(request->>'code')=trim(expected);
   rec:=jsonb_build_object('id',eid::text,'pairId',p->>'id','beaconId',b->>'id','codeKey',p->>'codeKey','found',good,'enteredCode',coalesce(request->>'code',''),'expectedCode',expected,'time',stamp,'arrivalAt',stamp,'returnId',eid::text,'nextDepartureAt',null);
   doc:=jsonb_set(doc,'{attempts}',coalesce(doc->'attempts','[]')||jsonb_build_array(rec));
   if p->>'startAt' is null then p:=p||jsonb_build_object('startAt',stamp); end if;
   runs:=coalesce(p->'runs','[]'); arr:='[]';
   for run in select value from jsonb_array_elements(runs) loop
    if run->>'endAt' is null then run:=run||jsonb_build_object('endAt',stamp); end if; arr:=arr||jsonb_build_array(run);
   end loop;
   p:=p||jsonb_build_object('runs',arr);
   if request->>'kind'='skip' then
    skipped:=coalesce(p->'skippedOrderBeacons','[]');if not skipped ? (b->>'id') then skipped:=skipped||jsonb_build_array(b->>'id');end if;
    p:=p||jsonb_build_object('skippedOrderBeacons',skipped,'retryOrderBeacon','');
   end if;
   response:=jsonb_build_object('found',good,'beacon',b->>'id','attempt',eid::text);
  elsif request->>'kind' in ('retry','next') then
   select value into last_attempt from jsonb_array_elements(doc->'attempts') a where a->>'pairId'=p->>'id' and a->>'id'=request->>'attempt';
   if last_attempt is null then raise exception 'Tentative introuvable'; end if;
   if last_attempt->>'nextDepartureAt' is not null then raise exception 'Départ déjà enregistré'; end if;
   if not coalesce((last_attempt->>'found')::boolean,false) then
    skipped:=coalesce(p->'skippedOrderBeacons','[]');
    if request->>'kind'='retry' then
     select coalesce(jsonb_agg(value),'[]') into skipped from jsonb_array_elements(skipped) where value<>to_jsonb(last_attempt->>'beaconId');
     p:=p||jsonb_build_object('retryOrderBeacon',last_attempt->>'beaconId');
    else
     if not skipped ? (last_attempt->>'beaconId') then skipped:=skipped||jsonb_build_array(last_attempt->>'beaconId'); end if;
     p:=p||jsonb_build_object('retryOrderBeacon','');
    end if;
    p:=p||jsonb_build_object('skippedOrderBeacons',skipped);
   end if;
   arr:='[]';for item in select value from jsonb_array_elements(doc->'attempts') loop
    if item->>'id'=last_attempt->>'id' then item:=item||jsonb_build_object('nextDepartureAt',stamp);end if;arr:=arr||jsonb_build_array(item);
   end loop;doc:=jsonb_set(doc,'{attempts}',arr);
   p:=p||jsonb_build_object('runs',coalesce(p->'runs','[]')||jsonb_build_array(jsonb_build_object('id',eid::text,'startAt',stamp,'endAt',null)));
   response:=jsonb_build_object('departed',true);
  else raise exception 'Action élève inconnue'; end if;
  doc:=jsonb_set(doc,array['pairs',idx::text],p);
 end if;
 if action in ('patch','student') then
  update co_private.sessions set profile=doc,revision=revision+1,updated_at=now() where id=sid returning * into s;
 end if;
 if request ? 'device' then
  insert into co_private.devices(session_id,device_id,name) values(sid,(request->>'device')::uuid,left(coalesce(request->>'deviceName','Tablette'),60))
  on conflict(session_id,device_id) do update set seen_at=now(),name=excluded.name;
 end if;
 if not teacher then
  doc:=doc-'lastSessionResults';doc:=jsonb_set(doc,'{settings}',(doc->'settings')-'teacherPin');
  select coalesce(jsonb_agg(value-'codes'),'[]') into arr from jsonb_array_elements(coalesce(doc->'inventory','[]'));doc:=jsonb_set(doc,'{inventory}',arr);
  select coalesce(jsonb_agg(value-'expectedCode'),'[]') into arr from jsonb_array_elements(coalesce(doc->'attempts','[]'));doc:=jsonb_set(doc,'{attempts}',arr);
 end if;
 response:=coalesce(response,'{}')||jsonb_build_object('profile',doc,'mode',s.mode,'revision',s.revision,'serverTime',now());
 if teacher then response:=response||jsonb_build_object('devices',(select coalesce(jsonb_agg(jsonb_build_object('name',name,'seenAt',seen_at)),'[]') from co_private.devices where session_id=sid));end if;
 if action='student' then insert into co_private.receipts values(sid,eid,response);end if;
 return response;
end $function$
