-- NEW-REP-001: separate concise completed-Mission Summary report.
alter table public.report_artefacts drop constraint if exists report_artefacts_report_type_check;
alter table public.report_artefacts add constraint report_artefacts_report_type_check check(report_type in('MISSION_PACK','MISSION_SUMMARY','MISSION_RECORD'));

insert into public.permissions(organisation_id,code,description)
select id,'mission.summary.generate','Generate concise post-completion Mission Summaries' from public.organisations
on conflict(organisation_id,code)do update set description=excluded.description;
insert into public.role_permissions(organisation_id,role_id,permission_id)
select r.organisation_id,r.id,p.id from public.roles r join public.permissions p on p.organisation_id=r.organisation_id and p.code='mission.summary.generate'
where r.code='admin'and r.archived_at is null on conflict(organisation_id,role_id,permission_id)do nothing;

create function public.ftf_provision_mission_summary_permission()returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 insert into public.permissions(organisation_id,code,description)values(new.id,'mission.summary.generate','Generate concise post-completion Mission Summaries')on conflict(organisation_id,code)do nothing;return new;
end$$;
create trigger provision_mission_summary_permission after insert on public.organisations for each row execute function public.ftf_provision_mission_summary_permission();
create function public.ftf_assign_mission_summary_permission()returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if new.code='admin'then insert into public.role_permissions(organisation_id,role_id,permission_id)select new.organisation_id,new.id,id from public.permissions where organisation_id=new.organisation_id and code='mission.summary.generate'on conflict(organisation_id,role_id,permission_id)do nothing;end if;return new;
end$$;
create trigger assign_mission_summary_permission after insert on public.roles for each row execute function public.ftf_assign_mission_summary_permission();

create or replace function public.ftf_request_report_artefact(p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_report_type text,p_idempotency_key text)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.missions%rowtype;existing public.report_artefacts%rowtype;c public.mission_completion_revisions%rowtype;n integer;a public.report_artefacts%rowtype;branding jsonb;evidence jsonb;
begin
 select*into existing from public.report_artefacts where organisation_id=p_organisation_id and idempotency_key=p_idempotency_key;if found then return jsonb_build_object('artefact',to_jsonb(existing),'reused',true);end if;
 select*into m from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null;if not found then return jsonb_build_object('not_found',true);end if;
 if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,m.operating_location_id)then return jsonb_build_object('location_forbidden',true);end if;
 if p_report_type='MISSION_PACK'and exists(select 1 from public.mission_operational_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id)then return jsonb_build_object('operation_started',true);end if;
 if p_report_type in('MISSION_SUMMARY','MISSION_RECORD')then select*into c from public.mission_completion_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id order by version_number desc limit 1;if not found then return jsonb_build_object('completion_required',true);end if;end if;
 if p_report_type='MISSION_RECORD'then
  evidence=jsonb_build_object('schemaVersion',1,'missionId',m.id,'completionRevision',to_jsonb(c),'missionOutcomes',coalesce((select jsonb_agg(to_jsonb(x)order by x.sequence_number)from public.mission_outcome_observations x where x.organisation_id=p_organisation_id and x.mission_id=m.id),'[]'),'customerOutcomes',coalesce((select jsonb_agg(to_jsonb(x)order by x.sequence_number)from public.customer_acceptance_records x where x.organisation_id=p_organisation_id and x.mission_id=m.id),'[]'));
 elsif p_report_type='MISSION_SUMMARY'then
  evidence=jsonb_build_object('schemaVersion',1,'missionId',m.id,'mission',to_jsonb(m)-'organisation_id','completionRevision',to_jsonb(c),'operationalRevision',(select to_jsonb(x)from public.mission_operational_revisions x where x.organisation_id=p_organisation_id and x.id=c.operational_revision_id),'actualResources',(select to_jsonb(x)from public.mission_operational_resource_revisions x join public.mission_operational_revisions o on o.resource_revision_id=x.id where o.organisation_id=p_organisation_id and o.id=c.operational_revision_id),'actualChemicals',(select to_jsonb(x)from public.mission_operational_chemical_revisions x join public.mission_operational_revisions o on o.chemical_revision_id=x.id where o.organisation_id=p_organisation_id and o.id=c.operational_revision_id),'imports',coalesce((select jsonb_agg(to_jsonb(i)order by i.version_number)from public.mission_operational_imports i join public.mission_operational_revisions o on i.id=any(o.source_file_ids)where o.organisation_id=p_organisation_id and o.id=c.operational_revision_id),'[]'),'events',coalesce((select jsonb_agg(to_jsonb(e)order by e.event_index)from public.mission_operational_events e join public.mission_operational_revisions o on e.id=any(o.event_ids)where o.organisation_id=p_organisation_id and o.id=c.operational_revision_id),'[]'),'customerOutcomes',coalesce((select jsonb_agg(to_jsonb(x)order by x.sequence_number)from public.customer_acceptance_records x where x.organisation_id=p_organisation_id and x.mission_id=m.id),'[]'));
 else
  evidence=jsonb_build_object('schemaVersion',1,'missionId',m.id,'missionPackRevision',(select to_jsonb(x)from public.mission_pack_revisions x where x.organisation_id=p_organisation_id and x.mission_id=m.id order by x.version_number desc limit 1));
 end if;
 branding=public.ftf_read_organisation_branding(p_organisation_id)||jsonb_build_object('attribution','Generated by Spray Command');
 select coalesce(max(version_number),0)+1 into n from public.report_artefacts where organisation_id=p_organisation_id and mission_id=m.id and report_type=p_report_type;
 insert into public.report_artefacts(organisation_id,operating_location_id,mission_id,report_type,version_number,template_version,idempotency_key,branding_snapshot,evidence_manifest,requested_by_internal_user_id)values(p_organisation_id,m.operating_location_id,m.id,p_report_type,n,case when p_report_type='MISSION_PACK'then 3 when p_report_type='MISSION_SUMMARY'then 1 else 2 end,p_idempotency_key,branding,evidence,p_actor_internal_user_id)returning*into a;
 insert into public.report_generation_jobs(organisation_id,artefact_id)values(p_organisation_id,a.id);
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'report.requested','report_artefact',a.id,jsonb_build_object('report_type',p_report_type,'version',n));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'reports.generation.requested','report_artefact',a.id,jsonb_build_object('report_type',p_report_type,'version',n));
 return jsonb_build_object('artefact',to_jsonb(a),'reused',false);
end$$;
