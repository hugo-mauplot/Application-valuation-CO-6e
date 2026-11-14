begin;
do $test$
declare sid uuid:=gen_random_uuid(); e1 uuid:=gen_random_uuid(); e2 uuid:=gen_random_uuid(); req jsonb; doc jsonb:='{"sessionStartedAt": "replace", "terrainModeActive": true, "settings": {"maxBeaconsPerVisit": 2, "duration": 40}, "courses": [{"id": "c", "orderMode": "imposed", "variantOrders": {"A": [1, 2, 3, 4, 5]}}], "beacons": [{"id": "b1", "courseId": "c::A", "courseNumber": 1, "inventoryId": "i1"}, {"id": "b2", "courseId": "c::A", "courseNumber": 2, "inventoryId": "i2"}, {"id": "b3", "courseId": "c::A", "courseNumber": 3, "inventoryId": "i3"}, {"id": "b4", "courseId": "c::A", "courseNumber": 4, "inventoryId": "i4"}, {"id": "b5", "courseId": "c::A", "courseNumber": 5, "inventoryId": "i5"}], "inventory": [{"id": "i1", "codes": {"A1": "001"}}, {"id": "i2", "codes": {"A1": "002"}}, {"id": "i3", "codes": {"A1": "003"}}, {"id": "i4", "codes": {"A1": "004"}}, {"id": "i5", "codes": {"A1": "005"}}], "pairs": [{"id": "p", "courseId": "c::A", "codeKey": "A1", "startAt": "replace", "runs": [{"id": "r1", "startAt": "replace", "endAt": null}]}], "attempts": []}'::jsonb; answer jsonb; runid text; stamp text:=to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); rejected boolean; amount int; j int;
begin
 doc:=jsonb_set(doc,'{sessionStartedAt}',to_jsonb(stamp));doc:=jsonb_set(doc,'{pairs,0,startAt}',to_jsonb(stamp));doc:=jsonb_set(doc,'{pairs,0,runs,0,startAt}',to_jsonb(stamp));
 insert into co_private.sessions(id,teacher_hash,student_hash,profile,mode) values(sid,encode(sha256(convert_to(repeat('t',64),'UTF8')),'hex'),encode(sha256(convert_to(repeat('s',64),'UTF8')),'hex'),doc,'evaluation');
 req:=jsonb_build_object('session',sid,'token',repeat('s',64),'pair','p','course','c::A','visitRun','r1','action','visit');
 answer:=public.co_visit(req||jsonb_build_object('event',e1,'command','answer','beacon','b2','code','002'));
 if not (answer->>'found')::boolean or answer#>'{profile,inventory,0,codes}' is not null or answer#>'{profile,attempts,0,expectedCode}' is not null then raise exception 'Validation/filtrage incorrect';end if;
 answer:=public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'command','continue'));
 answer:=public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'command','answer','beacon','b1','code','001'));
 if jsonb_array_length(answer#>'{profile,pairs,0,visitState,visit,touched}')<>2 then raise exception 'Retenter consomme une place';end if;
 rejected:=false;begin perform public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'command','continue'));exception when others then rejected:=true;end;if not rejected then raise exception 'Dépassement du maximum autorisé';end if;
 rejected:=false;begin perform public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'command','answer','beacon','b1','code','001'));exception when others then rejected:=true;end;if not rejected then raise exception 'Double validation autorisée';end if;
 answer:=public.co_visit(req||jsonb_build_object('event',e2,'command','depart'));
 if answer#>'{profile,pairs,0,visitState,assigned}'<>'["b3","b4"]'::jsonb then raise exception 'Lot suivant incorrect : %',answer#>'{profile,pairs,0,visitState,assigned}';end if;
 answer:=public.co_visit(req||jsonb_build_object('event',e1,'command','answer','beacon','b2','code','002'));
 if jsonb_array_length(answer#>'{profile,attempts}')<>2 or answer#>>'{profile,pairs,0,visitState,run}'<>e2::text then raise exception 'Rejeu non idempotent ou profil périmé';end if;
 -- Un élève ne peut pas contourner le maximum en utilisant l'ancien protocole.
 rejected:=false;begin perform public.co_sync(req||jsonb_build_object('action','student','event',gen_random_uuid(),'kind','attempt','beacon','b3','code','003'));exception when others then rejected:=true;end;if not rejected then raise exception 'Ancien protocole non bloqué';end if;
 -- Retenter exige un départ et une place dans le nouveau lot.
 update co_private.sessions set profile=doc where id=sid;
 answer:=public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'command','answer','beacon','b1','code','999'));
 rejected:=false;begin perform public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'command','answer','beacon','b1','code','001'));exception when others then rejected:=true;end;if not rejected then raise exception 'Retentative sur place autorisée';end if;
 answer:=public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'command','depart','retry',true));
 if answer#>'{profile,pairs,0,visitState,assigned}'<>'["b1","b3"]'::jsonb then raise exception 'Retentative absente du prochain lot : %',answer#>'{profile,pairs,0,visitState,assigned}';end if;
 -- Rapport d'erreur puis départ anticipé : l'échec revient après les balises non proposées.
 update co_private.sessions set profile=doc where id=sid;
 answer:=public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'command','answer','beacon','b1','code','999'));
 answer:=public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'command','depart'));
 if answer#>'{profile,pairs,0,visitState,assigned}'<>'["b3","b4"]'::jsonb then raise exception 'Erreur reproposée trop tôt';end if;
 runid:=answer#>>'{profile,pairs,0,visitState,run}';
 answer:=public.co_visit(req||jsonb_build_object('visitRun',runid,'event',gen_random_uuid(),'command','answer','beacon','b3','code','003'));
 answer:=public.co_visit(req||jsonb_build_object('visitRun',runid,'event',gen_random_uuid(),'command','depart'));
 if answer#>'{profile,pairs,0,visitState,assigned}'<>'["b5","b1"]'::jsonb then raise exception 'Erreur non réintroduite après les autres propositions';end if;
 -- Paramètre absent : le protocole historique continue de fonctionner.
 update co_private.sessions set profile=jsonb_set(doc,'{settings,maxBeaconsPerVisit}','1') where id=sid;
 answer:=public.co_sync(req||jsonb_build_object('action','student','event',gen_random_uuid(),'kind','attempt','beacon','b1','code','001'));
 if not (answer->>'found')::boolean then raise exception 'Régression du protocole 1 balise';end if;
 -- Libre : plus de deux codes sans limite artificielle par passage.
 update co_private.sessions set profile=jsonb_set(doc,'{settings,maxBeaconsPerVisit}','0') where id=sid;
 for j in 1..5 loop
  answer:=public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'command','answer','beacon','b'||j,'code','00'||j));
  if j<5 then answer:=public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'command','continue'));end if;
 end loop;
 if jsonb_array_length(answer#>'{profile,attempts}')<>5 then raise exception 'Libre limité artificiellement';end if;
 -- Pause : une saisie doit rester impossible.
 update co_private.sessions set profile=jsonb_set(doc,'{pairs,0,teacherPausedAt}',to_jsonb(stamp)) where id=sid;
 rejected:=false;begin perform public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'command','answer','beacon','b1','code','001'));exception when others then rejected:=true;end;if not rejected then raise exception 'Saisie en pause autorisée';end if;
 -- Parcours et visite obsolètes, authentification et limite du temps.
 update co_private.sessions set profile=doc where id=sid;
 rejected:=false;begin perform public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'course','old','command','answer','beacon','b1','code','001'));exception when others then rejected:=true;end;if not rejected then raise exception 'Ancien parcours accepté';end if;
 rejected:=false;begin perform public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'visitRun','old','command','answer','beacon','b1','code','001'));exception when others then rejected:=true;end;if not rejected then raise exception 'Ancien passage accepté';end if;
 rejected:=false;begin perform public.co_visit(req||jsonb_build_object('event',gen_random_uuid(),'token','wrong','command','answer','beacon','b1','code','001'));exception when others then rejected:=true;end;if not rejected then raise exception 'Jeton invalide accepté';end if;
 -- Droits : RPC accessible aux bornes, helper privé inaccessible.
 if not has_function_privilege('anon','public.co_visit(jsonb)','execute') or has_function_privilege('anon','co_private.visit_prepare(jsonb,jsonb)','execute') then raise exception 'Droits incorrects';end if;
 raise notice 'PASSAGES_OK';
end $test$;
rollback;
select 'Tests transactionnels réussis ; données fictives annulées' as verification;
