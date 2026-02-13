-- SUMO: posts solo vinculados a un spot/ruta.
-- Ejecuta este script una sola vez en la BD del proyecto sumo.

begin;

-- Si quedan posts antiguos sin route_id, se eliminan para permitir la restriccion NOT NULL.
delete from public.posts
where route_id is null;

-- Reconfigura FK para que al borrar una ruta se borren sus posts.
alter table public.posts
  drop constraint if exists posts_route_id_fkey;

alter table public.posts
  add constraint posts_route_id_fkey
  foreign key (route_id)
  references public.routes(id)
  on delete cascade;

alter table public.posts
  alter column route_id set not null;

commit;
