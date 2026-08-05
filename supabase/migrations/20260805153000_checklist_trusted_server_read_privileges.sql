-- Trusted server read paths:
-- ChecklistsRepository.listTemplates reads templates and their immutable versions.
-- ChecklistsRepository.readMissionExecutions reads executions, evidence metadata,
-- and corrective actions. All mutations remain RPC-only. RLS remains forced.
grant select on table public.checklist_templates to service_role;
grant select on table public.checklist_template_versions to service_role;
grant select on table public.checklist_executions to service_role;
grant select on table public.checklist_execution_evidence to service_role;
grant select on table public.checklist_corrective_actions to service_role;
