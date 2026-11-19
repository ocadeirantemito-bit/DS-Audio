begin;

create function public.restore_workspace(payload jsonb, expected_revision bigint, write_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from auth.users
    where id = auth.uid() and raw_app_meta_data->'ds_audio_owner' = 'true'::jsonb
  ) then
    raise exception 'A restauração exige a conta autorizada do proprietário.' using errcode = '42501';
  end if;
  return public.save_workspace(payload, expected_revision, write_id);
end $$;

revoke all on function public.restore_workspace(jsonb, bigint, uuid) from public, anon;
grant execute on function public.restore_workspace(jsonb, bigint, uuid) to authenticated;

commit;
