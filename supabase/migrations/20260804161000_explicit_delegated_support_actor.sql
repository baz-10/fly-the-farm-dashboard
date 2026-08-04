-- Explicit delegated support actor for the bounded generic operational command set.
-- The approving organisation administrator is used only as the compatibility
-- authority required by the legacy write function. Persisted attribution is
-- replaced atomically with the Platform actor and Support Session authority.

create function public.attribute_delegated_support_audit()returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session_id uuid:=nullif(current_setting('spray_command.support_session_id',true),'')::uuid;v_platform_user_id uuid:=nullif(current_setting('spray_command.platform_user_id',true),'')::uuid;v_session public.support_sessions%rowtype;v_approval public.support_approval_events%rowtype;
begin
  if v_session_id is null or v_platform_user_id is null then return new;end if;
  select*into v_session from public.support_sessions where id=v_session_id and platform_user_id=v_platform_user_id and organisation_id=new.organisation_id and state='ACTIVE'and expires_at>now();
  if not found then raise exception'DELEGATED_SUPPORT_CONTEXT_INVALID';end if;
  select*into v_approval from public.support_approval_events where support_request_id=v_session.support_request_id and decision='APPROVE'order by approval_timestamp desc limit 1;
  if new.actor_internal_user_id is distinct from v_approval.approved_by_internal_user_id then return new;end if;
  new.actor_internal_user_id:=null;new.actor_type:='PLATFORM_SUPPORT';new.actor_platform_user_id:=v_platform_user_id;new.support_session_id:=v_session_id;
  new.authority_snapshot:=jsonb_build_object('approvingOrganisationUserId',v_approval.approved_by_internal_user_id,'approvedScope',v_session.scope_type,'accessMode',v_session.access_mode,'reason',v_session.reason,'expiresAt',v_session.expires_at,'supportRequestId',v_session.support_request_id);
  return new;
end$$;
create trigger audit_events_delegated_support_attribution before insert on public.audit_events for each row execute function public.attribute_delegated_support_audit();

create function public.ftf_delegated_support_write(
  p_session_id uuid,p_platform_user_id uuid,p_resource text,p_operation text,
  p_entity_id uuid default null,p_expected_version integer default null,p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_session public.support_sessions%rowtype;
  v_approval public.support_approval_events%rowtype;
  v_access jsonb;
  v_result jsonb;
  v_resource_id uuid;
  v_audit_id uuid;
  v_activity jsonb;
  v_supported constant text[]:=array['operating_locations','clients','properties','fields','jobs','missions','aircraft','equipment-kits'];
  v_table text;
begin
  if not (p_resource=any(v_supported)) or p_operation not in('create','update','archive') then
    return jsonb_build_object('denial_code','SUPPORT_COMMAND_UNSUPPORTED');
  end if;
  select * into v_session from public.support_sessions where id=p_session_id and platform_user_id=p_platform_user_id for update;
  if not found then return jsonb_build_object('denial_code','SUPPORT_SESSION_NOT_FOUND');end if;
  v_access:=public.support_access_allowed(v_session.id,v_session.organisation_id,'WRITE',p_resource,null,null,now());
  if not coalesce((v_access->>'allowed')::boolean,false) then return v_access;end if;
  select a.* into v_approval from public.support_approval_events a where a.support_request_id=v_session.support_request_id and a.decision='APPROVE' order by a.approval_timestamp desc limit 1;
  if not found then return jsonb_build_object('denial_code','SUPPORT_APPROVAL_MISSING');end if;

  perform set_config('spray_command.support_session_id',v_session.id::text,true);perform set_config('spray_command.platform_user_id',p_platform_user_id::text,true);
  v_result:=public.ftf_write_operational_resource(v_session.organisation_id,v_approval.approved_by_internal_user_id,p_resource,p_operation,p_entity_id,p_expected_version,coalesce(p_data,'{}'::jsonb));
  v_resource_id:=nullif(v_result#>>'{record,id}','')::uuid;
  if v_resource_id is null then return v_result;end if;

  select id into v_audit_id from public.audit_events where organisation_id=v_session.organisation_id and actor_type='PLATFORM_SUPPORT'and actor_platform_user_id=p_platform_user_id and support_session_id=v_session.id and entity_type=p_resource and entity_id=v_resource_id and event_type=p_resource||'.'||p_operation order by created_at desc,id desc limit 1;
  if v_audit_id is null then raise exception 'DELEGATED_SUPPORT_AUDIT_MISSING';end if;

  if p_operation='archive' then
    v_table=case p_resource when'equipment-kits'then'equipment_kits'else replace(p_resource,'-','_')end;
    execute format('update public.%I set archived_by_internal_user_id=null where organisation_id=$1 and id=$2',v_table) using v_session.organisation_id,v_resource_id;
  end if;

  v_activity:=public.record_delegated_support_activity(v_session.id,p_platform_user_id,p_operation,p_resource,p_resource,v_resource_id,'SUCCEEDED',jsonb_build_object('authoritativeAuditEventId',v_audit_id));
  if not coalesce((v_activity->>'recorded')::boolean,false) then raise exception 'DELEGATED_SUPPORT_ACTIVITY_MISSING';end if;
  return v_result||jsonb_build_object('delegated_actor',jsonb_build_object('actorType','PLATFORM_SUPPORT','platformUserId',p_platform_user_id,'supportSessionId',v_session.id));
end$$;

revoke all on function public.ftf_delegated_support_write(uuid,uuid,text,text,uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.attribute_delegated_support_audit() from public,anon,authenticated,service_role;
grant execute on function public.ftf_delegated_support_write(uuid,uuid,text,text,uuid,integer,jsonb) to service_role;
