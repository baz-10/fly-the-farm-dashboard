with target as (
  select c.oid,c.relowner,c.relacl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='ftf_store' and c.relkind='r'
), defaults as (
  select
    pg_get_userbyid(def.defaclrole) as owner,
    coalesce(namespace.nspname,'') as schema,
    def.defaclobjtype::text as object_type,
    case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
    pg_get_userbyid(acl.grantor) as grantor,
    acl.privilege_type,
    acl.is_grantable,
    def.defaclacl::text as exact_acl
  from pg_catalog.pg_default_acl def
  left join pg_catalog.pg_namespace namespace on namespace.oid=def.defaclnamespace
  cross join lateral aclexplode(def.defaclacl) acl
  where acl.privilege_type='MAINTAIN'
     or acl.grantee=(select oid from pg_catalog.pg_roles where rolname='service_role')
), memberships as (
  with recursive chain as (
    select member.rolname as member,inherited.rolname as inherited_role,membership.roleid,membership.admin_option,1 as depth
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles member on member.oid=membership.member
    join pg_catalog.pg_roles inherited on inherited.oid=membership.roleid
    where member.rolname='service_role'
    union all
    select chain.inherited_role,inherited.rolname,membership.roleid,membership.admin_option,chain.depth+1
    from chain
    join pg_catalog.pg_auth_members membership on membership.member=chain.roleid
    join pg_catalog.pg_roles inherited on inherited.oid=membership.roleid
  ) select * from chain
), direct_acl as (
  select
    case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
    pg_get_userbyid(acl.grantor) as grantor,
    acl.privilege_type,
    acl.is_grantable
  from target
  cross join lateral aclexplode(coalesce(target.relacl,acldefault('r',target.relowner))) acl
)
select jsonb_build_object(
  'targetOwner',(select pg_get_userbyid(relowner) from target),
  'targetExactAcl',(select relacl::text from target),
  'serviceRoleAttributes',(select to_jsonb(r) from pg_catalog.pg_roles r where rolname='service_role'),
  'serviceRoleMemberships',coalesce((select jsonb_agg(to_jsonb(memberships) order by depth,inherited_role) from memberships),'[]'::jsonb),
  'serviceRoleEffectiveMaintain',has_table_privilege('service_role','public.ftf_store','MAINTAIN'),
  'targetDirectAcl',coalesce((select jsonb_agg(to_jsonb(direct_acl) order by grantee,privilege_type) from direct_acl),'[]'::jsonb),
  'relevantDefaultAcl',coalesce((select jsonb_agg(to_jsonb(defaults) order by owner,schema,object_type,grantee,privilege_type) from defaults),'[]'::jsonb)
)::text;
