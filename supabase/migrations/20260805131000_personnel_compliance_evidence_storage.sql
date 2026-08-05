-- NEW-CMP-005: private, trusted-server-only storage for CASA Personnel evidence.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('personnel-compliance-evidence','personnel-compliance-evidence',false,10485760,array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- No authenticated storage policies are created. Upload/download remains behind
-- the trusted server, which applies tenant, permission and private-evidence checks.
