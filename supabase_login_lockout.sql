-- Rodar no SQL Editor do Supabase (projeto MNPK-painel).
-- Bloqueia login por 30 min apos 2 tentativas de senha erradas seguidas.

create table if not exists public.login_tentativas (
  email text primary key,
  tentativas_falhas int not null default 0,
  bloqueado_ate timestamptz
);

alter table public.login_tentativas enable row level security;
-- Sem grants diretos na tabela: só as funções abaixo (security definer) podem mexer nela.

create or replace function public.verificar_bloqueio(p_email text)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  select bloqueado_ate
  from public.login_tentativas
  where email = lower(p_email)
    and bloqueado_ate is not null
    and bloqueado_ate > now();
$$;

create or replace function public.registrar_tentativa_falha(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(p_email);
  v_tentativas int;
begin
  insert into public.login_tentativas (email, tentativas_falhas)
  values (v_email, 1)
  on conflict (email) do update
    set tentativas_falhas = case
      when public.login_tentativas.bloqueado_ate is not null and public.login_tentativas.bloqueado_ate > now()
        then public.login_tentativas.tentativas_falhas
      else public.login_tentativas.tentativas_falhas + 1
    end
  returning tentativas_falhas into v_tentativas;

  if v_tentativas >= 2 then
    update public.login_tentativas
    set bloqueado_ate = now() + interval '30 minutes',
        tentativas_falhas = 0
    where email = v_email;
  end if;
end;
$$;

create or replace function public.limpar_bloqueio()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.login_tentativas
  where email = lower(coalesce(auth.email(), ''));
end;
$$;

grant execute on function public.verificar_bloqueio(text) to anon, authenticated;
grant execute on function public.registrar_tentativa_falha(text) to anon, authenticated;
grant execute on function public.limpar_bloqueio() to authenticated;
