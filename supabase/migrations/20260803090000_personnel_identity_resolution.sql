-- Authoritative administrative Personnel-to-authentication identity resolution.
create or replace function public.ftf_actor_has_permission(p_organisation_id uuid,p_actor_internal_user_id uuid,p_permission_code text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.memberships m join public.roles r on r.organisation_id=m.organisation_id and r.id=m.role_id join public.role_permissions rp on rp.organisation_id=r.organisation_id and rp.role_id=r.id and rp.archived_at is null join public.permissions p on p.organisation_id=rp.organisation_id and p.id=rp.permission_id and p.archived_at is null where m.organisation_id=p_organisation_id and m.internal_user_id=p_actor_internal_user_id and m.is_active and m.archived_at is null and r.archived_at is null and p.code=p_permission_code)
$$;

insert into public.permissions(organisation_id,code,description)
select id,'personnel.identity.manage','Resolve links between authoritative Personnel and login identities' from public.organisations
on conflict(organisation_id,code)do nothing;
insert into public.role_permissions(organisation_id,role_id,permission_id)
select r.organisation_id,r.id,p.id from public.roles r join public.permissions p on p.organisation_id=r.organisation_id and p.code='personnel.identity.manage' where r.code='admin'and r.archived_at is null
on conflict(organisation_id,role_id,permission_id)do nothing;

create or replace function public.ftf_provision_personnel_permissions()returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.permissions(organisation_id,code,description)select new.organisation_id,v.code,v.description from(values
 ('personnel.read','View operational Personnel'),('personnel.create','Create Personnel'),('personnel.update','Update Personnel'),('personnel.archive','Archive Personnel'),('personnel.assign','Assign Personnel to Missions'),('personnel.private.read','View restricted Personnel fields'),('personnel.identity.manage','Resolve links between authoritative Personnel and login identities'))v(code,description)on conflict(organisation_id,code)do nothing;
 if new.code='admin'then insert into public.role_permissions(organisation_id,role_id,permission_id)select new.organisation_id,new.id,p.id from public.permissions p where p.organisation_id=new.organisation_id and p.code like'personnel.%'on conflict(organisation_id,role_id,permission_id)do nothing;end if;return new;
end$$;

create function public.ftf_list_personnel_identity_candidates(p_organisation_id uuid,p_actor_internal_user_id uuid,p_personnel_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_person public.personnel%rowtype;
begin
 if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'personnel.identity.manage')then raise exception'PERSONNEL_IDENTITY_FORBIDDEN';end if;
 select * into v_person from public.personnel where organisation_id=p_organisation_id and id=p_personnel_id and archived_at is null;if not found then return jsonb_build_object('not_found',true);end if;
 return jsonb_build_object('personnel',jsonb_build_object('id',v_person.id,'fullName',v_person.full_name,'email',v_person.email,'phone',v_person.phone,'internalUserId',v_person.internal_user_id,'membershipId',v_person.membership_id,'rowVersion',v_person.row_version),'candidates',coalesce((select jsonb_agg(candidate order by candidate->>'displayName')from(
  select jsonb_build_object('internalUserId',u.id,'displayName',u.display_name,'membershipId',m.id,'roleCode',r.code,'seatStatus',coalesce((select s.status from public.internal_user_seat_assignments s where s.organisation_id=u.organisation_id and s.internal_user_id=u.id and s.archived_at is null order by s.assigned_at desc limit 1),'UNASSIGNED'),'alreadyLinkedPersonnelId',(select p.id from public.personnel p where p.organisation_id=u.organisation_id and p.internal_user_id=u.id and p.archived_at is null limit 1),'duplicateIndicators',coalesce((select jsonb_agg(distinct signal)from(
   select 'NAME' signal from public.personnel p where p.organisation_id=v_person.organisation_id and p.id<>v_person.id and p.archived_at is null and lower(trim(p.full_name))=lower(trim(v_person.full_name))
   union all select 'EMAIL' from public.personnel p where p.organisation_id=v_person.organisation_id and p.id<>v_person.id and p.archived_at is null and v_person.email is not null and lower(trim(p.email))=lower(trim(v_person.email))
   union all select 'PHONE' from public.personnel p where p.organisation_id=v_person.organisation_id and p.id<>v_person.id and p.archived_at is null and v_person.phone is not null and regexp_replace(p.phone,'[^0-9]','','g')=regexp_replace(v_person.phone,'[^0-9]','','g')
   union all select case when upper(c.credential_type)like'%ARN%'then'ARN'when upper(c.credential_type)like'%EMPLOYEE%'then'EMPLOYEE_NUMBER'else'LICENCE_NUMBER'end from public.personnel_credentials c join public.personnel_credentials other on other.organisation_id=c.organisation_id and other.personnel_id<>c.personnel_id and other.identifier=c.identifier and other.archived_at is null where c.organisation_id=v_person.organisation_id and c.personnel_id=v_person.id and c.identifier is not null and c.archived_at is null
  )signals),'[]'::jsonb))candidate
  from public.internal_users u join public.memberships m on m.organisation_id=u.organisation_id and m.internal_user_id=u.id and m.is_active and m.archived_at is null join public.roles r on r.organisation_id=m.organisation_id and r.id=m.role_id and r.archived_at is null
  where u.organisation_id=p_organisation_id and u.is_active and u.archived_at is null
 )c),'[]'::jsonb));
end$$;

create function public.ftf_link_personnel_identity(p_organisation_id uuid,p_actor_internal_user_id uuid,p_personnel_id uuid,p_expected_version integer,p_internal_user_id uuid,p_membership_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_person public.personnel%rowtype;v_previous jsonb;v_new jsonb;
begin
 if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'personnel.identity.manage')then raise exception'PERSONNEL_IDENTITY_FORBIDDEN';end if;
 if nullif(trim(p_reason),'')is null then raise exception'PERSONNEL_IDENTITY_REASON_REQUIRED';end if;
 select * into v_person from public.personnel where organisation_id=p_organisation_id and id=p_personnel_id and archived_at is null for update;if not found then return jsonb_build_object('not_found',true);end if;
 if v_person.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_person.row_version);end if;
 if not exists(select 1 from public.memberships m where m.organisation_id=p_organisation_id and m.id=p_membership_id and m.internal_user_id=p_internal_user_id and m.is_active and m.archived_at is null)then return jsonb_build_object('relationship_conflict',true);end if;
 if exists(select 1 from public.personnel p where p.organisation_id=p_organisation_id and p.id<>p_personnel_id and p.archived_at is null and(p.internal_user_id=p_internal_user_id or p.membership_id=p_membership_id))then return jsonb_build_object('duplicate_conflict',true);end if;
 v_previous=jsonb_build_object('internalUserId',v_person.internal_user_id,'membershipId',v_person.membership_id,'rowVersion',v_person.row_version);
 update public.personnel set internal_user_id=p_internal_user_id,membership_id=p_membership_id,row_version=row_version+1,updated_at=now(),updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=p_personnel_id returning * into v_person;
 v_new=jsonb_build_object('internalUserId',v_person.internal_user_id,'membershipId',v_person.membership_id,'rowVersion',v_person.row_version);
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'personnel.identity_linked','personnel',v_person.id,jsonb_build_object('reason',trim(p_reason),'previous_state',v_previous,'new_state',v_new));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'operational.personnel.identity_linked','personnel',v_person.id,jsonb_build_object('reason',trim(p_reason),'previous_state',v_previous,'new_state',v_new));
 return jsonb_build_object('record',to_jsonb(v_person));
end$$;

create function public.ftf_unlink_personnel_identity(p_organisation_id uuid,p_actor_internal_user_id uuid,p_personnel_id uuid,p_expected_version integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_person public.personnel%rowtype;v_previous jsonb;v_new jsonb;
begin
 if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'personnel.identity.manage')then raise exception'PERSONNEL_IDENTITY_FORBIDDEN';end if;
 if nullif(trim(p_reason),'')is null then raise exception'PERSONNEL_IDENTITY_REASON_REQUIRED';end if;
 select * into v_person from public.personnel where organisation_id=p_organisation_id and id=p_personnel_id and archived_at is null for update;if not found then return jsonb_build_object('not_found',true);end if;
 if v_person.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_person.row_version);end if;
 v_previous=jsonb_build_object('internalUserId',v_person.internal_user_id,'membershipId',v_person.membership_id,'rowVersion',v_person.row_version);
 update public.personnel set internal_user_id=null,membership_id=null,row_version=row_version+1,updated_at=now(),updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=p_personnel_id returning * into v_person;
 v_new=jsonb_build_object('internalUserId',null,'membershipId',null,'rowVersion',v_person.row_version);
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'personnel.identity_unlinked','personnel',v_person.id,jsonb_build_object('reason',trim(p_reason),'previous_state',v_previous,'new_state',v_new));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'operational.personnel.identity_unlinked','personnel',v_person.id,jsonb_build_object('reason',trim(p_reason),'previous_state',v_previous,'new_state',v_new));
 return jsonb_build_object('record',to_jsonb(v_person));
end$$;

alter table public.personnel force row level security;
revoke all on function public.ftf_actor_has_permission(uuid,uuid,text),public.ftf_list_personnel_identity_candidates(uuid,uuid,uuid),public.ftf_link_personnel_identity(uuid,uuid,uuid,integer,uuid,uuid,text),public.ftf_unlink_personnel_identity(uuid,uuid,uuid,integer,text)from public,anon,authenticated;
grant execute on function public.ftf_list_personnel_identity_candidates(uuid,uuid,uuid),public.ftf_link_personnel_identity(uuid,uuid,uuid,integer,uuid,uuid,text),public.ftf_unlink_personnel_identity(uuid,uuid,uuid,integer,text)to service_role;
