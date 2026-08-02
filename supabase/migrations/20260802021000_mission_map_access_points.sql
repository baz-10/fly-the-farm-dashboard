-- Access points are distinct operational evidence from routes and annotations.
alter table public.mission_geometry_versions drop constraint mission_geometry_versions_geometry_role_check;
alter table public.mission_geometry_versions add constraint mission_geometry_versions_geometry_role_check
check(geometry_role in ('operational_boundary','treatment_area','exclusion_zone','no_fly_zone','obstacle','corridor','access_point','access_route','staging_area','launch_point','landing_point','water_point','point_annotation','line_annotation','polygon_annotation','imported_source_geometry','regulatory_overlay','safety_overlay'));
