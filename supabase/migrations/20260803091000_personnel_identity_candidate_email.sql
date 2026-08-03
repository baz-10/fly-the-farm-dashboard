-- Include the existing authentication email in the explicit administrator comparison.
create or replace function public.ftf_list_personnel_identity_candidates(p_organisation_id uuid,p_actor_internal_user_id uuid,p_personnel_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_person public.personnel%rowtype;
begin
 if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'personnel.identity.manage')then raise exception'PERSONNEL_IDENTITY_FORBIDDEN';end if;
 select * into v_person from public.personnel where organisation_id=p_organisation_id and id=p_personnel_id and archived_at is null;if not found then return jsonb_build_object('not_found',true);end if;
 return jsonb_build_object('personnel',jsonb_build_object('id',v_person.id,'fullName',v_person.full_name,'email',v_person.email,'phone',v_person.phone,'internalUserId',v_person.internal_user_id,'membershipId',v_person.membership_id,'rowVersion',v_person.row_version),'candidates',coalesce((select jsonb_agg(candidate order by candidate->>'displayName')from(
  select jsonb_build_object('internalUserId',u.id,'displayName',u.display_name,'email',to_jsonb(au)->>'email','membershipId',m.id,'roleCode',r.code,'seatStatus',coalesce((select s.status from public.internal_user_seat_assignments s where s.organisation_id=u.organisation_id and s.internal_user_id=u.id and s.archived_at is null order by s.assigned_at desc limit 1),'UNASSIGNED'),'alreadyLinkedPersonnelId',(select p.id from public.personnel p where p.organisation_id=u.organisation_id and p.internal_user_id=u.id and p.archived_at is null limit 1),'duplicateIndicators',coalesce((select jsonb_agg(distinct signal)from(
   select 'NAME' signal from public.personnel p where p.organisation_id=v_person.organisation_id and p.id<>v_person.id and p.archived_at is null and lower(trim(p.full_name))=lower(trim(v_person.full_name))
   union all select 'EMAIL' from public.personnel p where p.organisation_id=v_person.organisation_id and p.id<>v_person.id and p.archived_at is null and v_person.email is not null and lower(trim(p.email))=lower(trim(v_person.email))
   union all select 'PHONE' from public.personnel p where p.organisation_id=v_person.organisation_id and p.id<>v_person.id and p.archived_at is null and v_person.phone is not null and regexp_replace(p.phone,'[^0-9]','','g')=regexp_replace(v_person.phone,'[^0-9]','','g')
   union all select case when upper(c.credential_type)like'%ARN%'then'ARN'when upper(c.credential_type)like'%EMPLOYEE%'then'EMPLOYEE_NUMBER'else'LICENCE_NUMBER'end from public.personnel_credentials c join public.personnel_credentials other on other.organisation_id=c.organisation_id and other.personnel_id<>c.personnel_id and other.identifier=c.identifier and other.archived_at is null where c.organisation_id=v_person.organisation_id and c.personnel_id=v_person.id and c.identifier is not null and c.archived_at is null
  )signals),'[]'::jsonb))candidate
  from public.internal_users u join auth.users au on au.id=u.auth_user_id join public.memberships m on m.organisation_id=u.organisation_id and m.internal_user_id=u.id and m.is_active and m.archived_at is null join public.roles r on r.organisation_id=m.organisation_id and r.id=m.role_id and r.archived_at is null
  where u.organisation_id=p_organisation_id and u.is_active and u.archived_at is null
 )c),'[]'::jsonb));
end$$;
revoke all on function public.ftf_list_personnel_identity_candidates(uuid,uuid,uuid)from public,anon,authenticated;
grant execute on function public.ftf_list_personnel_identity_candidates(uuid,uuid,uuid)to service_role;
