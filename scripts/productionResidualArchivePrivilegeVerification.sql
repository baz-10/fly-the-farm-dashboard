do $archive_privilege_state$
declare
  direct_acl text[];
  governed_default_acl text[];
begin
  if (select count(*) from supabase_migrations.schema_migrations where version='20260813140000')<>1
    or (select max(version) from supabase_migrations.schema_migrations)<>'20260813140000'
    or exists(select 1 from supabase_migrations.schema_migrations where version>'20260813140000')
  then
    raise exception 'RESIDUAL_ARCHIVE_PRIVILEGE: migration head mismatch';
  end if;

  select array_agg(acl::text order by acl::text) into direct_acl
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace,
  lateral unnest(coalesce(relation.relacl,acldefault('r',relation.relowner))) acl
  where namespace.nspname='public' and relation.relname='ftf_store' and relation.relkind='r';
  if direct_acl is distinct from array['postgres=arwdDxtm/postgres','service_role=arwdm/postgres']::text[] then
    raise exception 'RESIDUAL_ARCHIVE_PRIVILEGE: direct ACL differs';
  end if;

  select array_agg(acl::text order by acl::text) into governed_default_acl
  from pg_catalog.pg_default_acl defaults
  join pg_catalog.pg_namespace namespace on namespace.oid=defaults.defaclnamespace,
  lateral unnest(defaults.defaclacl) acl
  where pg_get_userbyid(defaults.defaclrole)='postgres'
    and namespace.nspname='public' and defaults.defaclobjtype='r';
  if governed_default_acl is distinct from array[
    'anon=Dxtm/postgres','authenticated=Dxtm/postgres',
    'postgres=arwdDxtm/postgres','service_role=Dxtm/postgres'
  ]::text[] then
    raise exception 'RESIDUAL_ARCHIVE_PRIVILEGE: governed default ACL differs';
  end if;

  if not has_table_privilege('service_role','public.ftf_store','select,insert,update,delete,maintain')
    or has_table_privilege('service_role','public.ftf_store','truncate,references,trigger')
  then
    raise exception 'RESIDUAL_ARCHIVE_PRIVILEGE: effective state differs';
  end if;
end
$archive_privilege_state$;

select jsonb_build_object(
  'phase','PRE_CORRECTION',
  'migrationHead','20260813140000',
  'ftfStoreMaintain',has_table_privilege('service_role','public.ftf_store','MAINTAIN')
)::text;
