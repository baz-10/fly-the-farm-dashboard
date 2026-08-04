-- IMP-REP-001: new report artefacts use the commercial lifecycle layout.
-- Existing immutable artefacts retain their original template version and output.
alter table public.report_artefacts
  alter column template_version set default 2;
