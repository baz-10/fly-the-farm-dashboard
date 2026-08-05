alter table public.internal_user_operations_preferences
  add column if not exists recent_weather_searches jsonb not null default '[]'::jsonb;

alter table public.internal_user_operations_preferences
  drop constraint if exists internal_user_operations_preferences_recent_weather_searches_check;

alter table public.internal_user_operations_preferences
  add constraint internal_user_operations_preferences_recent_weather_searches_check
  check (jsonb_typeof(recent_weather_searches) = 'array' and jsonb_array_length(recent_weather_searches) <= 5);

comment on column public.internal_user_operations_preferences.recent_weather_searches is
  'Up to five operator-selected advisory Weather Centre locations. These preferences never become Mission evidence or change the Home operating-location default.';
