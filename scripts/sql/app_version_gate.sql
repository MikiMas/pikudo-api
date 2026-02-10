-- Control de version de app (fila unica).
-- Flujo:
-- - revision_version: version que esta en revision en stores.
-- - client_version: version que ya esta publicada para usuarios.
-- La app permite entrar si su version coincide con cualquiera de las dos.

create table if not exists public.app_version_gate (
  id boolean primary key default true,
  revision_version text not null,
  client_version text not null,
  updated_at timestamptz not null default now(),
  constraint app_version_gate_single_row check (id = true),
  constraint app_version_gate_revision_not_empty check (length(trim(revision_version)) > 0),
  constraint app_version_gate_client_not_empty check (length(trim(client_version)) > 0)
);

-- Seed inicial: ambas en 1.0.1.
insert into public.app_version_gate (id, revision_version, client_version)
values (true, '1.0.1', '1.0.1')
on conflict (id) do update
set
  revision_version = excluded.revision_version,
  client_version = excluded.client_version,
  updated_at = now();

