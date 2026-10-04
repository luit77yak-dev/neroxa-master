-- Safe physical deletion for Neroxa system instances.
-- Only archived, never-used instances may be physically deleted.
-- Operational history is preserved by refusing deletion when dependencies exist.

create or replace function public.delete_neroxa_system_instance_safely(
  p_instance_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_instance public.neroxa_system_instances%rowtype;
begin
  if not public.neroxa_has_platform_role(
    array[
      'SUPER_ADMIN'::public.neroxa_platform_role,
      'ADMIN'::public.neroxa_platform_role,
      'SUPPORT'::public.neroxa_platform_role
    ]
  ) then
    raise exception using
      errcode = '42501',
      message = 'Você não tem permissão para excluir instâncias.';
  end if;

  select *
    into v_instance
  from public.neroxa_system_instances
  where id = p_instance_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'INSTANCE_NOT_FOUND: A instância não foi encontrada ou já foi removida.';
  end if;

  if v_instance.status <> 'ARCHIVED'::public.neroxa_instance_status then
    raise exception using
      errcode = 'P0001',
      message = format(
        'INSTANCE_STATUS_NOT_ARCHIVED: A instância está em %s e só pode ser excluída quando estiver ARCHIVED.',
        v_instance.status
      );
  end if;

  if v_instance.subscription_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'INSTANCE_HAS_SUBSCRIPTION: Esta instância está vinculada a uma assinatura e não pode ser excluída.';
  end if;

  if v_instance.system_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'INSTANCE_HAS_SYSTEM: Esta instância está vinculada a um sistema e não pode ser excluída.';
  end if;

  if exists (
    select 1
    from public.neroxa_system_domains d
    where d.system_instance_id = v_instance.id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INSTANCE_HAS_DOMAINS: Esta instância possui domínios vinculados e não pode ser excluída.';
  end if;

  if exists (
    select 1
    from public.neroxa_provisioning_jobs j
    where j.system_instance_id = v_instance.id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INSTANCE_HAS_PROVISIONING_HISTORY: Esta instância possui histórico de implantação e não pode ser excluída.';
  end if;

  delete from public.neroxa_system_instances
  where id = v_instance.id;

  return jsonb_build_object(
    'deleted', true,
    'instance_id', v_instance.id,
    'status', v_instance.status
  );
end;
$function$;

revoke execute on function public.delete_neroxa_system_instance_safely(uuid) from public;
revoke execute on function public.delete_neroxa_system_instance_safely(uuid) from anon;
grant execute on function public.delete_neroxa_system_instance_safely(uuid) to authenticated;
