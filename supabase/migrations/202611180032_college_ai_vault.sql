-- CampusClass 2.0: remove the extra Vercel master-key dependency for NEW college AI secrets.
-- Apply manually after 202611180031. Existing encrypted rows remain untouched
-- until the college admin re-enters its OpenRouter key; ciphertext cannot be
-- decrypted without its original OPENROUTER_ENCRYPTION_KEY.
begin;

create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;

alter table public.college_ai_settings add column if not exists api_key_vault_id uuid;

-- Keep the Data API unable to read college settings and raw vault tables.
revoke all on public.college_ai_settings from public, anon, authenticated;
grant select, insert, update, delete on public.college_ai_settings to service_role;

create or replace function public.set_college_ai_secret(
  p_college_id uuid, p_admin_id uuid, p_secret text, p_model text, p_enabled boolean
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if p_college_id is null or p_admin_id is null
    or p_secret is null or char_length(trim(p_secret)) < 20 or char_length(p_secret) > 300
    or p_model is null or p_model !~ '^[A-Za-z0-9._/-]{3,120}$' or p_enabled is null then
    raise exception 'Invalid college AI settings' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id=p_admin_id and p.college_id=p_college_id
      and p.role='admin' and p.status='active'
  ) then
    raise exception 'Only active college admins may change AI settings' using errcode='42501';
  end if;
  select s.api_key_vault_id into v_secret_id
  from public.college_ai_settings s where s.college_id=p_college_id for update;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_secret);
  else
    perform vault.update_secret(v_secret_id,p_secret);
  end if;

  insert into public.college_ai_settings (
    college_id,enabled,model,api_key_vault_id,
    api_key_ciphertext,api_key_iv,api_key_tag,updated_by,updated_at
  ) values (p_college_id,p_enabled,p_model,v_secret_id,null,null,null,p_admin_id,pg_catalog.clock_timestamp())
  on conflict (college_id) do update set
    enabled=excluded.enabled, model=excluded.model,
    api_key_vault_id=excluded.api_key_vault_id,
    api_key_ciphertext=null, api_key_iv=null, api_key_tag=null,
    updated_by=excluded.updated_by, updated_at=excluded.updated_at;
end $$;

create or replace function public.read_college_ai_secret(p_college_id uuid,p_user_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text;
begin
  if p_college_id is null or p_user_id is null or not exists (
    select 1 from public.profiles p
    where p.id=p_user_id and p.college_id=p_college_id and p.status='active'
  ) then return null; end if;
  select v.decrypted_secret into v_key
  from public.college_ai_settings s
  join vault.decrypted_secrets v on v.id=s.api_key_vault_id
  where s.college_id=p_college_id and s.enabled=true;
  return v_key;
end $$;

revoke all on function public.set_college_ai_secret(uuid,uuid,text,text,boolean)
  from public,anon,authenticated;
revoke all on function public.read_college_ai_secret(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.set_college_ai_secret(uuid,uuid,text,text,boolean) to service_role;
grant execute on function public.read_college_ai_secret(uuid,uuid) to service_role;

commit;

-- Verify (non-sensitive):
-- select college_id, enabled, api_key_vault_id is not null as uses_vault
-- from public.college_ai_settings;