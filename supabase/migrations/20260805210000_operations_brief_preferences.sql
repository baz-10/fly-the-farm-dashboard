create table public.internal_user_operations_preferences(
 organisation_id uuid not null references public.organisations(id),
 internal_user_id uuid not null,
 selected_operating_location_id uuid,
 updated_at timestamptz not null default now(),
 primary key(organisation_id,internal_user_id),
 foreign key(organisation_id,internal_user_id)references public.internal_users(organisation_id,id),
 foreign key(organisation_id,selected_operating_location_id)references public.operating_locations(organisation_id,id)
);
alter table public.internal_user_operations_preferences enable row level security;
alter table public.internal_user_operations_preferences force row level security;
revoke all on public.internal_user_operations_preferences from anon,authenticated;
grant select,insert,update on public.internal_user_operations_preferences to service_role;
