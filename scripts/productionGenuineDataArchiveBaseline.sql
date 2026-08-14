with excluded(organisation_id) as (
  values
    ('0218251e-be2d-4e5c-96ca-29eff71b3a4a'::uuid),
    ('25a9353b-ed90-468b-9ae5-31a55d8f88dc'::uuid),
    ('e0f8ba14-ec34-45db-87b4-8429c2ea6288'::uuid),
    ('acfa5923-0edd-46ee-b81b-49d9deedc123'::uuid),
    ('4096dbd0-b538-4e8a-aaaa-76338125908a'::uuid),
    ('961a4354-40f5-479d-a577-74839596ad14'::uuid),
    ('72b15c85-d1bf-4ef4-91fb-c90472637270'::uuid),
    ('2955b919-9cb2-4eb6-883a-a476ae6afc60'::uuid)
), evidence(name,row_count,row_digest) as (
  select 'clients',count(*),md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by row.id::text),''))
    from public.clients row where not exists(select 1 from excluded where organisation_id=row.organisation_id)
  union all
  select 'properties',count(*),md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by row.id::text),''))
    from public.properties row where not exists(select 1 from excluded where organisation_id=row.organisation_id)
  union all
  select 'fields',count(*),md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by row.id::text),''))
    from public.fields row where not exists(select 1 from excluded where organisation_id=row.organisation_id)
  union all
  select 'jobs',count(*),md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by row.id::text),''))
    from public.jobs row where not exists(select 1 from excluded where organisation_id=row.organisation_id)
  union all
  select 'missions',count(*),md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by row.id::text),''))
    from public.missions row where not exists(select 1 from excluded where organisation_id=row.organisation_id)
  union all
  select 'organisations',count(*),md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by row.id::text),''))
    from public.organisations row where not exists(select 1 from excluded where organisation_id=row.id)
  union all
  select 'personnel',count(*),md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by row.id::text),''))
    from public.personnel row where not exists(select 1 from excluded where organisation_id=row.organisation_id)
  union all
  select 'ftf_store',count(*),md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by row.tenant_id::text,row.collection,row.record_id),''))
    from public.ftf_store row where not exists(select 1 from excluded where organisation_id=row.tenant_id)
)
select jsonb_agg(jsonb_build_object('name',name,'count',row_count,'digest',row_digest) order by name)::text
from evidence;
