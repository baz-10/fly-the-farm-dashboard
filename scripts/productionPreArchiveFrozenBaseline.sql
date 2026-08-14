do $pre_archive_frozen_baseline$
begin
  if (select count(*) from public.clients row
      where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>27
    or (select md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by id::text),''))
      from public.clients row where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'361ec0ed3203caf8f71f5a0e580fb98f'
    or (select count(*) from public.properties row
      where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>23
    or (select md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by id::text),''))
      from public.properties row where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'8481208a52acf250dcb45d8ddd954297'
    or (select count(*) from public.fields row
      where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>20
    or (select md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by id::text),''))
      from public.fields row where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'ac6d293bc50227acac86e26feaaac141'
    or (select count(*) from public.jobs row
      where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>18
    or (select md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by id::text),''))
      from public.jobs row where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'e2c080779ebb0c3eda4f6ba63eb7a712'
    or (select count(*) from public.missions row
      where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>18
    or (select md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by id::text),''))
      from public.missions row where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'341a30e6f87afdcaaab99d8622c95ba8'
    or (select count(*) from public.organisations row
      where id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>7
    or (select md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by id::text),''))
      from public.organisations row where id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'7544fdbf2a4820630183588eaa0d542a'
    or (select count(*) from public.personnel row
      where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>3
    or (select md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by id::text),''))
      from public.personnel row where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'ea98f788724f969e823071afdcbb1ec4'
    or (select count(*) from public.ftf_store row
      where tenant_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>6
    or (select md5(coalesce(string_agg(md5(row_to_json(row)::text),'' order by tenant_id::text,collection,record_id),''))
      from public.ftf_store row where tenant_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'f29ee3e6379136074b2f69dc715e2d46'
  then
    raise exception 'PRE_ARCHIVE_FROZEN_BASELINE: mismatch';
  end if;
end
$pre_archive_frozen_baseline$;
