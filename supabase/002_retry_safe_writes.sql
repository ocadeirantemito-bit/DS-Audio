begin;

alter table public.workspaces
  add column last_write_id uuid,
  add column last_write_hash text;

-- A resposta HTTP pode se perder mesmo depois de o PostgreSQL confirmar a transação.
create function public.save_workspace(payload jsonb, expected_revision bigint, write_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  current_revision bigint;
  previous_id uuid;
  previous_hash text;
  payload_hash text := md5(payload::text);
begin
  if caller is null or write_id is null or expected_revision is null or payload is null then
    raise exception 'Sessão ou solicitação inválida.';
  end if;

  insert into public.workspaces(owner_id) values (caller) on conflict do nothing;
  select revision, last_write_id, last_write_hash
    into current_revision, previous_id, previous_hash
    from public.workspaces where owner_id = caller for update;

  if previous_id = write_id then
    if payload_hash is distinct from previous_hash or current_revision <> expected_revision + 1 then
      raise exception 'Os dados da tentativa anterior foram alterados.';
    end if;
    return current_revision;
  end if;

  current_revision := public.save_workspace(payload, expected_revision);
  update public.workspaces set last_write_id = write_id, last_write_hash = payload_hash where owner_id = caller;
  return current_revision;
end $$;

revoke execute on function public.save_workspace(jsonb, bigint) from authenticated;
revoke all on function public.save_workspace(jsonb, bigint, uuid) from public, anon;
grant execute on function public.save_workspace(jsonb, bigint, uuid) to authenticated;

commit;
