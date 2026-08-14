do $$
declare
  v_acl text[];
  v_default_acl text[];
  v_inherited_paths bigint;
  v_public_privileges bigint;
  v_direct_maintain boolean;
  v_default_maintain boolean;
begin
  select array_agg(acl::text order by acl::text) into v_acl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace,
  lateral unnest(coalesce(c.relacl,acldefault('r',c.relowner))) acl
  where n.nspname='public' and c.relname='ftf_store' and c.relkind='r';

  if v_acl is distinct from array['postgres=arwdDxtm/postgres','service_role=arwdm/postgres']::text[]
    and v_acl is distinct from array['postgres=arwdDxtm/postgres','service_role=arwd/postgres']::text[]
  then
    raise exception 'PRODUCTION_PRIVILEGE_PROVENANCE: direct ACL mismatch';
  end if;

  with recursive inherited(roleid) as (
    select membership.roleid from pg_catalog.pg_auth_members membership
    where membership.member=(select oid from pg_catalog.pg_roles where rolname='service_role')
    union
    select membership.roleid from pg_catalog.pg_auth_members membership
    join inherited on inherited.roleid=membership.member
  )
  select count(*) into v_inherited_paths from inherited;
  if v_inherited_paths<>0
    or (select rolsuper from pg_catalog.pg_roles where rolname='service_role')
  then
    raise exception 'PRODUCTION_PRIVILEGE_PROVENANCE: inherited or superuser authority present';
  end if;

  select array_agg(acl::text order by acl::text) into v_default_acl
  from pg_catalog.pg_default_acl def
  join pg_catalog.pg_namespace namespace on namespace.oid=def.defaclnamespace
  cross join lateral unnest(def.defaclacl) acl
  where pg_get_userbyid(def.defaclrole)='postgres'
    and namespace.nspname='public'
    and def.defaclobjtype='r';
  if v_default_acl is distinct from array[
      'anon=Dxtm/postgres','authenticated=Dxtm/postgres',
      'postgres=arwdDxtm/postgres','service_role=Dxtm/postgres'
    ]::text[]
    and v_default_acl is distinct from array[
      'anon=Dxtm/postgres','authenticated=Dxtm/postgres',
      'postgres=arwdDxtm/postgres','service_role=Dxt/postgres'
    ]::text[]
  then
    raise exception 'PRODUCTION_PRIVILEGE_PROVENANCE: governed default ACL mismatch';
  end if;

  v_direct_maintain := has_table_privilege('service_role','public.ftf_store','maintain');
  select exists(
    select 1
    from pg_catalog.pg_default_acl def
    join pg_catalog.pg_namespace namespace on namespace.oid=def.defaclnamespace
    cross join lateral aclexplode(def.defaclacl) acl
    where pg_get_userbyid(def.defaclrole)='postgres'
      and namespace.nspname='public'
      and def.defaclobjtype='r'
      and acl.grantee=(select oid from pg_catalog.pg_roles where rolname='service_role')
      and acl.privilege_type='MAINTAIN'
  ) into v_default_maintain;
  if v_direct_maintain is distinct from v_default_maintain then
    raise exception 'PRODUCTION_PRIVILEGE_PROVENANCE: partial privilege reconciliation';
  end if;

  select count(*) into v_public_privileges
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
  where n.nspname='public' and c.relname='ftf_store' and c.relkind='r'
    and acl.grantee=0;
  if v_public_privileges<>0 then
    raise exception 'PRODUCTION_PRIVILEGE_PROVENANCE: PUBLIC direct privilege present';
  end if;

  if not has_table_privilege('service_role','public.ftf_store','select,insert,update,delete')
    or has_table_privilege('service_role','public.ftf_store','truncate,references,trigger')
    or has_table_privilege('anon','public.ftf_store','select,insert,update,delete,truncate,references,trigger,maintain')
    or has_table_privilege('authenticated','public.ftf_store','select,insert,update,delete,truncate,references,trigger,maintain')
  then
    raise exception 'PRODUCTION_PRIVILEGE_PROVENANCE: effective privilege mismatch';
  end if;
end
$$;

with recursive membership_chain as (
  select member.rolname as member,inherited.rolname as inherited_role,membership.roleid,membership.admin_option,1 as depth
  from pg_catalog.pg_auth_members membership
  join pg_catalog.pg_roles member on member.oid=membership.member
  join pg_catalog.pg_roles inherited on inherited.oid=membership.roleid
  where member.rolname='service_role'
  union all
  select chain.inherited_role,inherited.rolname,membership.roleid,membership.admin_option,chain.depth+1
  from membership_chain chain
  join pg_catalog.pg_auth_members membership on membership.member=chain.roleid
  join pg_catalog.pg_roles inherited on inherited.oid=membership.roleid
), target as (
  select c.oid,c.relowner,c.relacl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='ftf_store' and c.relkind='r'
), direct_acl as (
  select pg_get_userbyid(acl.grantor) as grantor,
    case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
    acl.privilege_type,acl.is_grantable
  from target, lateral aclexplode(coalesce(target.relacl,acldefault('r',target.relowner))) acl
), role_attributes as (
  select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls
  from pg_catalog.pg_roles where rolname='service_role'
), defaults as (
  select pg_get_userbyid(def.defaclrole) as owner,coalesce(namespace.nspname,'') as schema,
    case def.defaclobjtype when 'r' then 'table' else def.defaclobjtype::text end as object_type,
    case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
    pg_get_userbyid(acl.grantor) as grantor,acl.privilege_type,acl.is_grantable
  from pg_catalog.pg_default_acl def
  left join pg_catalog.pg_namespace namespace on namespace.oid=def.defaclnamespace
  cross join lateral aclexplode(def.defaclacl) acl
  where pg_get_userbyid(def.defaclrole)='postgres'
    and namespace.nspname='public'
    and def.defaclobjtype='r'
), effective as (
  select role_name,privilege,has_table_privilege(role_name,'public.ftf_store',privilege) as allowed
  from (values ('postgres'),('service_role'),('anon'),('authenticated')) roles(role_name)
  cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) privileges(privilege)
), phase as (
  select case when has_table_privilege('service_role','public.ftf_store','MAINTAIN')
    then 'PRE_CORRECTION' else 'POST_CORRECTION' end as value
)
select jsonb_build_object(
  'serverVersion',current_setting('server_version'),'phase',(select value from phase),
  'owner',(select pg_get_userbyid(relowner) from target),
  'directAcl',coalesce((select jsonb_agg(to_jsonb(direct_acl) order by grantee,privilege_type) from direct_acl),'[]'::jsonb),
  'roleAttributes',(select to_jsonb(role_attributes) from role_attributes),
  'memberships',coalesce((select jsonb_agg(to_jsonb(membership_chain) order by depth,inherited_role) from membership_chain),'[]'::jsonb),
  'governedDefaultTablePrivileges',coalesce((select jsonb_agg(to_jsonb(defaults) order by owner,schema,object_type,grantee,privilege_type) from defaults),'[]'::jsonb),
  'effectivePrivileges',coalesce((select jsonb_agg(to_jsonb(effective) order by role_name,privilege) from effective),'[]'::jsonb)
)::text;
