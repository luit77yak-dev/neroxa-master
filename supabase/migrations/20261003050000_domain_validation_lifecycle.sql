-- Domain validation lifecycle for Neroxa Master
create or replace function public.transition_neroxa_domain_status(
  p_domain_id uuid,
  p_new_status public.neroxa_domain_status
)
returns public.neroxa_domain_status
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_domain public.neroxa_system_domains%rowtype;
  v_instance public.neroxa_system_instances%rowtype;
  v_allowed boolean := false;
begin
  if not public.neroxa_has_platform_role(array[
    'SUPER_ADMIN'::public.neroxa_platform_role,
    'ADMIN'::public.neroxa_platform_role,
    'SUPPORT'::public.neroxa_platform_role
  ]) then
    raise exception 'Sem permissão para gerenciar domínios';
  end if;

  select * into v_domain from public.neroxa_system_domains where id = p_domain_id for update;
  if not found then raise exception 'Domínio não encontrado'; end if;

  select * into v_instance from public.neroxa_system_instances where id = v_domain.system_instance_id for update;
  if not found then raise exception 'Instância do domínio não encontrada'; end if;

  if v_instance.status = 'ARCHIVED' then
    raise exception 'Instâncias arquivadas não podem ter o domínio validado';
  end if;

  v_allowed := case v_domain.status
    when 'PENDING' then p_new_status in ('VERIFYING','DISABLED')
    when 'VERIFYING' then p_new_status in ('VERIFIED','FAILED','DISABLED')
    when 'FAILED' then p_new_status in ('VERIFYING','DISABLED')
    when 'VERIFIED' then p_new_status = 'DISABLED'
    when 'DISABLED' then p_new_status = 'VERIFYING'
    else false
  end;

  if not v_allowed then
    raise exception 'Transição de domínio não permitida: % -> %', v_domain.status, p_new_status;
  end if;

  update public.neroxa_system_domains
  set status = p_new_status,
      verified_at = case when p_new_status = 'VERIFIED' then now() else null end,
      updated_at = now()
  where id = p_domain_id;

  perform public.record_neroxa_audit(
    case
      when p_new_status = 'VERIFYING' then 'DOMAIN_VALIDATION_STARTED'
      when p_new_status = 'VERIFIED' then 'DOMAIN_VALIDATED'
      when p_new_status = 'FAILED' then 'DOMAIN_VALIDATION_FAILED'
      when p_new_status = 'DISABLED' then 'DOMAIN_DISABLED'
      else 'DOMAIN_STATUS_CHANGED'
    end,
    'SYSTEM_DOMAIN',
    p_domain_id,
    v_instance.organization_id,
    jsonb_build_object(
      'domain', v_domain.domain,
      'previous_status', v_domain.status,
      'new_status', p_new_status,
      'system_instance_id', v_domain.system_instance_id
    )
  );

  return p_new_status;
end;
$$;

revoke execute on function public.transition_neroxa_domain_status(uuid,public.neroxa_domain_status) from public;
grant execute on function public.transition_neroxa_domain_status(uuid,public.neroxa_domain_status) to authenticated;
