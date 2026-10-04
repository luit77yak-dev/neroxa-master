-- Administrative RPCs are callable only by authenticated clients.
-- Authorization remains enforced inside each SECURITY INVOKER function.
revoke execute on function public.activate_neroxa_contract_and_subscription(uuid) from public, anon;
revoke execute on function public.prepare_neroxa_implementation_from_subscription(uuid, text, text) from public, anon;
revoke execute on function public.transition_neroxa_domain_status(uuid, public.neroxa_domain_status) from public, anon;
revoke execute on function public.update_neroxa_provisioning_job_status(uuid, public.neroxa_provisioning_status, text) from public, anon;

grant execute on function public.activate_neroxa_contract_and_subscription(uuid) to authenticated, service_role;
grant execute on function public.prepare_neroxa_implementation_from_subscription(uuid, text, text) to authenticated, service_role;
grant execute on function public.transition_neroxa_domain_status(uuid, public.neroxa_domain_status) to authenticated, service_role;
grant execute on function public.update_neroxa_provisioning_job_status(uuid, public.neroxa_provisioning_status, text) to authenticated, service_role;
