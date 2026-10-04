-- Protected domain deletion with audit trail
create or replace function public.delete_neroxa_system_domain_safely(p_domain_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_domain public.neroxa_system_domains%rowtype;
  v_instance public.neroxa_system_instances%rowtype;
begin
  if not public.neroxa_has_platform_role(array[
    'SUPER_ADMIN'::public.neroxa_platform_role,
    'ADMIN'::public.neroxa_platform_role,
    'SUPPORT'::public.neroxa_platform_role
  ]) then
    raise exception using errcode='42501', message='Você não tem permissão para excluir domínios.';
  end if;

  select * into v_domain
  from public.neroxa_system_domains
  where id = p_domain_id
  for update;

  if not found then
    raise exception using errcode='P0002', message='DOMAIN_NOT_FOUND: O domínio não foi encontrado.';
  end if;

  if v_domain.is_primary then
    raise exception using errcode='P0001', message='DOMAIN_IS_PRIMARY: O domínio principal não pode ser excluído.';
  end if;

  if v_domain.status <> 'DISABLED'::public.neroxa_domain_status then
    raise exception using errcode='P0001', message='DOMAIN_NOT_DISABLED: O domínio precisa estar desativado antes da exclusão.';
  end if;

  select * into v_instance
  from public.neroxa_system_instances
  where id = v_domain.system_instance_id
  for update;

  if not found then
    raise exception using errcode='P0002', message='INSTANCE_NOT_FOUND: A instância do domínio não foi encontrada.';
  end if;

  if v_instance.status = 'ARCHIVED'::public.neroxa_instance_status then
    raise exception using errcode='P0001', message='INSTANCE_ARCHIVED: O domínio de uma instância arquivada não pode ser excluído.';
  end if;

  delete from public.neroxa_system_domains where id = p_domain_id;

  perform public.record_neroxa_audit(
    'DOMAIN_DELETED',
    'SYSTEM_DOMAIN',
    p_domain_id,
    v_instance.organization_id,
    jsonb_build_object(
      'domain', v_domain.domain,
      'status', v_domain.status,
      'is_primary', v_domain.is_primary,
      'system_instance_id', v_domain.system_instance_id
    )
  );

  return jsonb_build_object('deleted', true, 'domain_id', p_domain_id);
end;
$function$;

revoke execute on function public.delete_neroxa_system_domain_safely(uuid) from public, anon;
grant execute on function public.delete_neroxa_system_domain_safely(uuid) to authenticated;
