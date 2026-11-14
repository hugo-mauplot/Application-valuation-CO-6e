-- Extension additive : co_sync et les séances existantes restent compatibles.
create or replace function co_private.visit_prepare(doc jsonb, participant jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare p jsonb:=participant; plan jsonb:=p->'visitState'; c jsonb; b jsonb; r jsonb; run_id text; ids jsonb:='[]'; queue jsonb:='[]'; assigned jsonb:='[]'; rotated jsonb:='[]'; n int; cap int; bid text; order_values jsonb;
begin
 cap:=coalesce((doc#>>'{settings,maxBeaconsPerVisit}')::int,1);
 if cap<0 or cap>200 then raise exception 'Maximum par passage invalide'; end if;
 select value into c from jsonb_array_elements(coalesce(doc->'courses','[]')) where value->>'id'=split_part(p->>'courseId','::',1);
 order_values:=coalesce(c#>array['variantOrders',split_part(p->>'courseId','::',2)],'[]');
 for b in select bb.value from jsonb_array_elements(coalesce(doc->'beacons','[]')) bb
  where (case when coalesce(p->>'courseId','')<>'' then bb.value->>'courseId'=p->>'courseId' else coalesce(p->'freeBeaconIds','[]') ? (bb.value->>'id') end)
  and not exists(select 1 from jsonb_array_elements(coalesce(doc->'attempts','[]')) aa where aa->>'pairId'=p->>'id' and aa->>'beaconId'=bb.value->>'id' and coalesce((aa->>'found')::boolean,false))
  order by case when c->>'orderMode'='imposed' then coalesce((select ordinality::int from jsonb_array_elements_text(order_values) with ordinality oo where oo.value=coalesce(bb.value->>'courseNumber',bb.value->>'number')),1001+coalesce((bb.value->>'courseNumber')::int,(bb.value->>'number')::int,0)) else 1001+coalesce((bb.value->>'courseNumber')::int,(bb.value->>'number')::int,0) end,bb.value->>'id'
 loop ids:=ids||jsonb_build_array(b->>'id'); end loop;
 if plan is null or plan->>'version' is distinct from '1' or plan->>'session' is distinct from doc->>'sessionStartedAt' or plan->>'course' is distinct from coalesce(p->>'courseId','') then
  plan:=jsonb_build_object('version',1,'session',doc->>'sessionStartedAt','course',coalesce(p->>'courseId',''),'run',null,'queue',ids,'assigned','[]'::jsonb,'visit',jsonb_build_object('touched','[]'::jsonb,'pending',null,'id',null));
 end if;
 select value->>'id' into run_id from jsonb_array_elements(coalesce(p->'runs','[]')) with ordinality rr where value->>'endAt' is null order by ordinality desc limit 1;
 if run_id is not null and plan->>'run' is distinct from run_id then
  for bid in select value from jsonb_array_elements_text(coalesce(plan->'queue','[]')||ids) loop
   if ids ? bid and not queue ? bid then queue:=queue||jsonb_build_array(bid);end if;
  end loop;
  if plan->>'run' is not null then
   for bid in select value from jsonb_array_elements_text(queue) loop if not (plan->'assigned') ? bid then rotated:=rotated||jsonb_build_array(bid);end if;end loop;
   for bid in select value from jsonb_array_elements_text(plan->'assigned') loop if ids ? bid then rotated:=rotated||jsonb_build_array(bid);end if;end loop;queue:=rotated;
  end if;
  if plan->>'priority' is not null and ids ? (plan->>'priority') then
   rotated:=jsonb_build_array(plan->>'priority');for bid in select value from jsonb_array_elements_text(queue) loop if bid<>plan->>'priority' then rotated:=rotated||jsonb_build_array(bid);end if;end loop;queue:=rotated;
  end if;
  n:=0;for bid in select value from jsonb_array_elements_text(queue) loop
   if c->>'orderMode' is distinct from 'imposed' or cap=0 or n<cap then assigned:=assigned||jsonb_build_array(bid);end if;n:=n+1;
  end loop;
  plan:=plan||jsonb_build_object('priority',null,'run',run_id,'queue',queue,'assigned',assigned,'visit',jsonb_build_object('touched','[]'::jsonb,'pending',null,'id',null));
 end if;
 return p||jsonb_build_object('visitState',plan);
end $$;
revoke all on function co_private.visit_prepare(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.co_visit(request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 s co_private.sessions%rowtype; sid uuid:=(request->>'session')::uuid; eid uuid:=(request->>'event')::uuid;
 doc jsonb; p jsonb; plan jsonb; v jsonb; last_attempt jsonb; b jsonb; inv jsonb; item jsonb; arr jsonb; rec jsonb; result jsonb; receipt jsonb;
 idx int; cap int; command text:=request->>'command'; stamp text; expected text; good boolean; retry boolean; bid text; left_ids jsonb:='[]'; queue jsonb:='[]'; choices int; run_id text; elapsed numeric; duration numeric;
begin
 select * into s from co_private.sessions where id=sid for update;
 if not found or s.expires_at<now() then raise exception 'Séance introuvable ou expirée';end if;
 if s.student_hash<>encode(sha256(convert_to(coalesce(request->>'token',''),'UTF8')),'hex') then raise exception 'Accès borne requis';end if;
 if eid is null then raise exception 'Identifiant événement requis';end if;
 doc:=s.profile;
 select rr.result into receipt from co_private.receipts rr where rr.session_id=sid and rr.event_id=eid;
 if found then result:=receipt;
 else
  if not coalesce((doc->>'terrainModeActive')::boolean,false) or doc->>'sessionStartedAt' is null then raise exception 'Séance non lancée ou terminée';end if;
  select value,ordinality::int-1 into p,idx from jsonb_array_elements(doc->'pairs') with ordinality where value->>'id'=request->>'pair';
  if p is null or p->>'startAt' is null or p->>'endAt' is not null or p->>'end' is not null then raise exception 'Participant non démarré ou terminé';end if;
  if p->>'teacherPausedAt' is not null then raise exception 'Participant en pause';end if;
  if request->>'course' is distinct from p->>'courseId' then raise exception 'Parcours modifié';end if;
  duration:=coalesce((case when doc#>>'{settings,gradeFormat}'='third' then doc#>>'{settings,third,duration}' else doc#>>'{settings,duration}' end)::numeric,40);
  elapsed:=extract(epoch from(now()-(p->>'startAt')::timestamptz))*1000-coalesce((p->>'teacherPausedMs')::numeric,0);
  if elapsed>=duration*60000 then raise exception 'Temps réglementaire dépassé';end if;
  p:=co_private.visit_prepare(doc,p);plan:=p->'visitState';v:=plan->'visit';cap:=coalesce((doc#>>'{settings,maxBeaconsPerVisit}')::int,1);
  if request->>'visitRun' is distinct from plan->>'run' or plan->>'run' is null then raise exception 'Passage modifié : rechargez la carte';end if;
  select value into last_attempt from jsonb_array_elements(coalesce(doc->'attempts','[]')) where value->>'id'=v->>'pending' and value->>'pairId'=p->>'id';
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if command in ('answer','skip') then
   select value into b from jsonb_array_elements(doc->'beacons') where value->>'id'=request->>'beacon' and (case when coalesce(p->>'courseId','')<>'' then value->>'courseId'=p->>'courseId' else coalesce(p->'freeBeaconIds','[]') ? (value->>'id') end);
   if b is null then raise exception 'Balise hors parcours';end if;
   if exists(select 1 from jsonb_array_elements(doc->'attempts') where value->>'pairId'=p->>'id' and value->>'beaconId'=b->>'id' and coalesce((value->>'found')::boolean,false)) then raise exception 'Balise déjà validée';end if;
   retry:=false;
   if last_attempt is not null then raise exception 'Choisissez de continuer ou de repartir';end if;
   if not (plan->'assigned') ? (b->>'id') then raise exception 'Balise hors du lot attribué';end if;
   if not retry and (v->'touched') ? (b->>'id') then raise exception 'Balise déjà traitée pendant ce passage';end if;
   if not retry and cap>0 and jsonb_array_length(v->'touched')>=cap then raise exception 'Maximum atteint pour ce passage';end if;
   select value into inv from jsonb_array_elements(doc->'inventory') where value->>'id'=b->>'inventoryId';
   expected:=inv#>>array['codes',p->>'codeKey'];if expected is null or expected='' then raise exception 'Correction manquante';end if;
   if command='answer' and coalesce(request->>'code','') !~ '^[0-9]+$' then raise exception 'Code numérique requis';end if;
   good:=command='answer' and trim(request->>'code')=trim(expected);
   if v->>'id' is null then v:=v||jsonb_build_object('id',eid::text,'arrivalAt',stamp);end if;
   if not (v->'touched') ? (b->>'id') then v:=jsonb_set(v,'{touched}',(v->'touched')||jsonb_build_array(b->>'id'));end if;
   rec:=jsonb_build_object('id',eid::text,'pairId',p->>'id','beaconId',b->>'id','codeKey',p->>'codeKey','found',good,'skipped',command='skip','enteredCode',coalesce(request->>'code',''),'expectedCode',expected,'time',stamp,'arrivalAt',v->>'arrivalAt','returnId',v->>'id','nextDepartureAt',null,'passageRun',plan->>'run','thirdFormat',coalesce(doc#>>'{settings,gradeFormat}','sixth')='third');
   doc:=jsonb_set(doc,'{attempts}',coalesce(doc->'attempts','[]')||jsonb_build_array(rec));v:=v||jsonb_build_object('pending',eid::text);
   arr:='[]';for item in select value from jsonb_array_elements(coalesce(p->'runs','[]')) loop if item->>'endAt' is null then item:=item||jsonb_build_object('endAt',stamp);end if;arr:=arr||jsonb_build_array(item);end loop;p:=p||jsonb_build_object('runs',arr);
   result:=jsonb_build_object('found',good,'attempt',eid::text,'skipped',command='skip');
  elsif command='continue' then
   if last_attempt is null then raise exception 'Aucune tentative en attente';end if;
   select count(*) into choices from jsonb_array_elements_text(plan->'assigned') aa where not (v->'touched') ? aa.value and not exists(select 1 from jsonb_array_elements(doc->'attempts') where value->>'pairId'=p->>'id' and value->>'beaconId'=aa.value and coalesce((value->>'found')::boolean,false));
   if choices=0 or (cap>0 and jsonb_array_length(v->'touched')>=cap) then raise exception 'Maximum atteint ou lot terminé';end if;
   v:=v||jsonb_build_object('pending',null);result:=jsonb_build_object('continued',true);
  elsif command='depart' then
   if jsonb_array_length(v->'touched')=0 then raise exception 'Aucune balise traitée pendant ce passage';end if;
   for bid in select value from jsonb_array_elements_text(plan->'queue') loop
    if not exists(select 1 from jsonb_array_elements(doc->'attempts') where value->>'pairId'=p->>'id' and value->>'beaconId'=bid and coalesce((value->>'found')::boolean,false)) then left_ids:=left_ids||jsonb_build_array(bid);end if;
   end loop;
   for bid in select value from jsonb_array_elements_text(left_ids) loop if not (plan->'assigned') ? bid then queue:=queue||jsonb_build_array(bid);end if;end loop;
   for bid in select value from jsonb_array_elements_text(plan->'assigned') loop if left_ids ? bid then queue:=queue||jsonb_build_array(bid);end if;end loop;
   plan:=plan||jsonb_build_object('queue',queue);
   if coalesce((request->>'retry')::boolean,false) then
    if last_attempt is null or coalesce((last_attempt->>'found')::boolean,false) or coalesce((last_attempt->>'skipped')::boolean,false) then raise exception 'Aucune erreur à retenter au prochain lot';end if;
    plan:=plan||jsonb_build_object('priority',last_attempt->>'beaconId');
   end if;
   arr:='[]';for item in select value from jsonb_array_elements(doc->'attempts') loop if item->>'pairId'=p->>'id' and item->>'returnId'=v->>'id' and item->>'nextDepartureAt' is null then item:=item||jsonb_build_object('nextDepartureAt',stamp);end if;arr:=arr||jsonb_build_array(item);end loop;doc:=jsonb_set(doc,'{attempts}',arr);
   v:=v||jsonb_build_object('pending',null);if jsonb_array_length(left_ids)>0 then p:=p||jsonb_build_object('runs',coalesce(p->'runs','[]')||jsonb_build_array(jsonb_build_object('id',eid::text,'startAt',stamp,'endAt',null)));end if;
   result:=jsonb_build_object('departed',true);
  else raise exception 'Action de passage inconnue';end if;
  p:=p||jsonb_build_object('visitState',plan||jsonb_build_object('visit',v));
  if command='depart' then p:=co_private.visit_prepare(doc,p);end if;
  doc:=jsonb_set(doc,array['pairs',idx::text],p);
  update co_private.sessions set profile=doc,revision=revision+1,updated_at=now() where id=sid returning * into s;
  insert into co_private.receipts(session_id,event_id,result) values(sid,eid,result);
 end if;
 if request ? 'device' then insert into co_private.devices(session_id,device_id,name) values(sid,(request->>'device')::uuid,left(coalesce(request->>'deviceName','Borne'),60)) on conflict(session_id,device_id) do update set seen_at=now(),name=excluded.name;end if;
 -- Même filtrage des corrections que co_sync ; le reçu ne contient pas de profil périmé.
 doc:=doc-'lastSessionResults';doc:=jsonb_set(doc,'{settings}',(doc->'settings')-'teacherPin');
 select coalesce(jsonb_agg(value-'codes'),'[]') into arr from jsonb_array_elements(coalesce(doc->'inventory','[]'));doc:=jsonb_set(doc,'{inventory}',arr);
 select coalesce(jsonb_agg(value-'expectedCode'),'[]') into arr from jsonb_array_elements(coalesce(doc->'attempts','[]'));doc:=jsonb_set(doc,'{attempts}',arr);
 return result||jsonb_build_object('profile',doc,'mode',s.mode,'revision',s.revision,'serverTime',now());
end $$;
revoke all on function public.co_visit(jsonb) from public,anon,authenticated;
grant execute on function public.co_visit(jsonb) to anon,authenticated;
