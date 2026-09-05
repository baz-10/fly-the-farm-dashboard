-- Integrity failures are deterministic and must not be retried into storage.
create or replace function public.ftf_fail_report_generation_job(p_job_id uuid,p_artefact_id uuid,p_error_code text,p_error_message text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.report_generation_jobs%rowtype; v_terminal boolean:=p_error_code='FROZEN_REPORT_EVIDENCE_INVALID';
begin
  update public.report_generation_jobs set status=case when v_terminal or attempt_count>=max_attempts then'FAILED'else'QUEUED'end,
    available_at=now()+make_interval(secs=>least(300,attempt_count*30)),lease_owner=null,lease_expires_at=null,
    last_error_code=p_error_code,last_error_message=p_error_message,updated_at=now()
    where id=p_job_id and artefact_id=p_artefact_id returning*into j;
  perform set_config('app.report_worker_transition','allowed',true);
  update public.report_artefacts set status=case when j.status='FAILED'then'FAILED'else'QUEUED'end,
    error_code=p_error_code,error_message=p_error_message where id=p_artefact_id;
  return to_jsonb(j);
end $$;
revoke all on function public.ftf_fail_report_generation_job(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ftf_fail_report_generation_job(uuid,uuid,text,text) to service_role;
