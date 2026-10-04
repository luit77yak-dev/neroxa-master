-- Complete domain DNS validation result RPC.
-- The Edge Function is the only caller; authenticated clients must not invoke this directly.
create or replace function public.apply_neroxa_domain_validation_result(
  p_domain_id uuid,
  p_valid boolean
)
returns public.neroxa_domain_status
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_domain public.neroxa_system_domains%rowtype;
  v_instance public.neroxa_system_instances%rowtype;
  v_status public.neroxa_domain_status;
begin
  select * into v_domain from public.neroxa_system_domains where id = p_domain_id for update;
  if not found then raise exception using errcode='P0002', message='Domínio não encontrado'; end if;
  if v_domain.status <> 'VERIFYING'::public.neroxa_domain_status then
    raise exception using errcode='40900', message='O domínio precisa estar em validação antes de aplicar o resultado DNS';
  end if;

  select * into v_instance from public.neroxa_system_instances where id = v_domain.system_instance_id for update;
  if not found then raise exception using errcode='P0002', message='Instância do domínio não encontrada'; end if;
  if v_instance.status = 'ARCHIVED'::public.neroxa_instance_status then
    raise exception using errcode='P0001', message='Instâncias arquivadas não podem ter o domínio validado';
  end if;

  v_status := case when p_valid then 'VERIFIED'::public.neroxa_domain_status else 'FAILED'::public.neroxa_domain_status end;

  update public.neroxa_system_domains
  set status=v_status, verified_at=case when p_valid then now() else null end, updated_at=now()
  where id=p_domain_id;

  perform public.record_neroxa_audit(
    case when p_valid then 'DOMAIN_VALIDATED' else 'DOMAIN_VALIDATION_FAILED' end,
    'SYSTEM_DOMAIN', p_domain_id, v_instance.organization_id,
    jsonb_build_object('domain',v_domain.domain,'validation_result',p_valid,'previous_status',v_domain.status,'new_status',v_status,'system_instance_id',v_domain.system_instance_id)
  );
  return v_status;
end;
$function$;

revoke all on function public.apply_neroxa_domain_validation_result(uuid, boolean) from public, anon, authenticated;
grant execute on function public.apply_neroxa_domain_validation_result(uuid, boolean) to service_role;