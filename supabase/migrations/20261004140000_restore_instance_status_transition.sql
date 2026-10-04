-- Restore the controlled instance lifecycle RPC in the production migration chain.
-- The frontend uses this RPC for every manual status change.

create or replace function public.transition_neroxa_instance_status(
  p_instance_id uuid,
  p_status public.neroxa_instance_status
)
returns public.neroxa_instance_status
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_instance public.neroxa_system_instances%rowtype;
begin
  if not public.neroxa_has_platform_role(array[
    'SUPER_ADMIN'::public.neroxa_platform_role,
    'ADMIN'::public.neroxa_platform_role,
    'SUPPORT'::public.neroxa_platform_role
  ]) then
    raise exception 'Sem permissão para alterar o status da instância';
  end if;

  select * into v_instance
    from public.neroxa_system_instances
   where id = p_instance_id
   for update;

  if not found then raise exception 'Instância não encontrada'; end if;
  if v_instance.status = p_status then return v_instance.status; end if;
  if v_instance.status = 'ARCHIVED' then
    raise exception 'Uma instância arquivada não pode ter o status alterado';
  end if;

  if v_instance.status = 'PROVISIONING'
     and p_status not in ('ACTIVE', 'SUSPENDED', 'ARCHIVED') then
    raise exception 'Uma instância em provisionamento só pode ficar ativa, suspensa ou arquivada';
  end if;

  if v_instance.status = 'ACTIVE'
     and p_status not in ('SUSPENDED', 'ARCHIVED') then
    raise exception 'Uma instância ativa só pode ser suspensa ou arquivada';
  end if;

  if v_instance.status = 'SUSPENDED'
     and p_status not in ('ACTIVE', 'ARCHIVED') then
    raise exception 'Uma instância suspensa só pode ser reativada ou arquivada';
  end if;

  update public.neroxa_system_instances
     set status = p_status, updated_at = now()
   where id = p_instance_id;

  return p_status;
end;
$$;

revoke execute on function public.transition_neroxa_instance_status(uuid, public.neroxa_instance_status) from public, anon;
grant execute on function public.transition_neroxa_instance_status(uuid, public.neroxa_instance_status) to authenticated, service_role;
