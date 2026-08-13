with target_functions as (
  select
    n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' as identity,
    pg_get_function_result(p.oid) as "returnType",
    p.prosrc as definition,
    pg_get_functiondef(p.oid) as "pgGetFunctionDef",
    p.prosecdef as "securityDefiner",
    case p.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as volatility,
    case p.proparallel when 's' then 'safe' when 'r' then 'restricted' else 'unsafe' end as "parallelSafety",
    p.proleakproof as leakproof,
    coalesce(to_jsonb(p.proconfig), '[]'::jsonb) as configuration,
    pg_get_userbyid(p.proowner) as owner,
    coalesce((select jsonb_agg(acl::text order by acl::text) from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) acl), '[]'::jsonb) as acl,
    has_function_privilege('public', p.oid, 'execute') as "publicExecute",
    has_function_privilege('service_role', p.oid, 'execute') as "serviceRoleExecute"
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (
      'ftf_archive_controlled_commercial_onboarding',
      'ftf_archive_controlled_commercial_onboarding_without_legacy_sto',
      'ftf_project_controlled_onboarding_legacy_store'
    )
    and pg_get_function_identity_arguments(p.oid)='p_evidence jsonb'
), target_table as (
  select
    'public.ftf_store' as identity,
    coalesce((select jsonb_agg(acl::text order by acl::text) from unnest(coalesce(c.relacl, acldefault('r', c.relowner))) acl), '[]'::jsonb) as acl,
    coalesce((select jsonb_agg(privilege_type order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='ftf_store' and grantee='PUBLIC'), '[]'::jsonb) as "publicPrivileges",
    coalesce((select jsonb_agg(privilege_type order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='ftf_store' and grantee='service_role'), '[]'::jsonb) as "serviceRolePrivileges"
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='ftf_store' and c.relkind='r'
)
select jsonb_build_object(
  'functions', coalesce((select jsonb_agg(to_jsonb(target_functions) order by identity) from target_functions), '[]'::jsonb),
  'tablePrivileges', coalesce((select jsonb_agg(to_jsonb(target_table) order by identity) from target_table), '[]'::jsonb)
)::text;
