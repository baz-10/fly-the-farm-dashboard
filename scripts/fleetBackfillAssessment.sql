-- Protected Production-shaped Fleet backfill inventory. This file is SELECT-only.
with source_stores as (
  select store.tenant_id, store.payload
  from public.ftf_store store
  where store.collection = 'ftf_work_packs'
    and store.record_id = '__value__'
    and (
      (jsonb_typeof(store.payload->'assets') = 'array' and jsonb_array_length(store.payload->'assets') > 0)
      or (jsonb_typeof(store.payload->'trucks') = 'array' and jsonb_array_length(store.payload->'trucks') > 0)
    )
), inventory as (
  select jsonb_build_object(
    'organisationId', source.tenant_id,
    'organisationName', organisation.name,
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id', location.id, 'name', location.name) order by location.id)
      from public.operating_locations location
      where location.organisation_id = source.tenant_id and location.archived_at is null
    ), '[]'::jsonb),
    'payload', source.payload,
    'snapshotDigest', encode(digest(convert_to(source.payload::text, 'UTF8'), 'sha256'), 'hex'),
    'fleetAssetsTableExists', to_regclass('public.fleet_assets') is not null
  ) as item
  from source_stores source
  join public.organisations organisation on organisation.id = source.tenant_id
  where organisation.archived_at is null
)
select coalesce(jsonb_agg(item order by item->>'organisationId'), '[]'::jsonb)::text
from inventory;
