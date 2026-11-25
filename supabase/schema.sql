-- tablas
--interesados, adoptantes y administradores en un solo lugar.
create table public.usuarios (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique references auth.users(id) on delete set null, -- solo administradores
  nombre      text not null check (char_length(nombre) between 3 and 80),
  email       text not null,
  telefono    text not null check (telefono ~ '^[0-9]{10}$'),
  rol         text not null default 'interesado'
              check (rol in ('interesado', 'adoptante', 'admin')),
  created_at  timestamptz not null default now()
);
-- Un correo = una persona (sin distinguir mayusculas)
create unique index usuarios_email_uk on public.usuarios (lower(email));


-- perritos catalogo estatus
create table public.perritos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (char_length(nombre) between 1 and 60),
  raza        text not null default 'Mestizo',
  edad_anios  numeric(3,1) not null check (edad_anios >= 0 and edad_anios <= 30),
  tamano      text not null check (tamano in ('Pequeño', 'Mediano', 'Grande')),
  salud       text not null default 'Sin información',
  descripcion text,
  foto_url    text,
  estatus     text not null default 'disponible'
              check (estatus in ('disponible', 'en_proceso', 'adoptado')),
  created_at  timestamptz not null default now()
);


-- visitas la agenda,cada visita liga un interesado con un perrito.
create table public.visitas (
  id          uuid primary key default gen_random_uuid(),
  perro_id    uuid not null references public.perritos(id) on delete cascade,
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  fecha_hora  timestamptz not null,
  motivo      text not null default 'visita' check (motivo in ('visita', 'adopcion')),
  mensaje     text,
  estado      text not null default 'programada'
              check (estado in ('programada', 'realizada', 'cancelada', 'adopcion_concretada')),
  created_at  timestamptz not null default now()
);
-- no puede haber dos visitas programadas en el mismo horario.
-- Lo garantiza la propia base de datos, aunque dos personas den clic al mismo tiempo.
create unique index visitas_horario_uk on public.visitas (fecha_hora) where estado = 'programada';
create index visitas_perro_idx   on public.visitas (perro_id);
create index visitas_usuario_idx on public.visitas (usuario_id);


--adopciones solicitudes y adopciones concretadas.
create table public.adopciones (
  id             uuid primary key default gen_random_uuid(),
  perro_id       uuid not null references public.perritos(id) on delete cascade,
  usuario_id     uuid not null references public.usuarios(id) on delete cascade,
  visita_id      uuid references public.visitas(id) on delete set null,
  estado         text not null default 'solicitada'
                 check (estado in ('solicitada', 'completada', 'cancelada')),
  fecha_solicitud timestamptz not null default now(),
  fecha_adopcion  timestamptz,
  notas          text
);
-- Un perrito solo puede adoptarse una vez
create unique index adopciones_una_completada_uk on public.adopciones (perro_id) where estado = 'completada';
-- Una persona no repite la misma solicitud abierta para el mismo perrito
create unique index adopciones_solicitud_uk on public.adopciones (perro_id, usuario_id) where estado = 'solicitada';
create index adopciones_usuario_idx on public.adopciones (usuario_id);


--administrador
create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios where auth_id = auth.uid() and rol = 'admin'
  );
$$;


-- estatus del perrito
create or replace function public.recalcular_estatus_perrito(p_perro uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_estatus text;
begin
  if exists (select 1 from adopciones where perro_id = p_perro and estado = 'completada') then
    v_estatus := 'adoptado';
  elsif exists (select 1 from adopciones where perro_id = p_perro and estado = 'solicitada')
     or exists (select 1 from visitas    where perro_id = p_perro and estado = 'programada') then
    v_estatus := 'en_proceso';
  else
    v_estatus := 'disponible';
  end if;

  update perritos set estatus = v_estatus
   where id = p_perro and estatus is distinct from v_estatus;
end;
$$;

-- Se dispara con cada cambio en visitas o adopciones
create or replace function public.trg_recalcular_estatus()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform recalcular_estatus_perrito(old.perro_id);
  else
    perform recalcular_estatus_perrito(new.perro_id);
  end if;
  return null;
end;
$$;

create trigger visitas_estatus
  after insert or update of estado, perro_id or delete on public.visitas
  for each row execute function public.trg_recalcular_estatus();

create trigger adopciones_estatus
  after insert or update of estado, perro_id or delete on public.adopciones
  for each row execute function public.trg_recalcular_estatus();

-- Al registrar un perrito, siempre nace "disponible" (nadie puede forzar otro valor)
create or replace function public.trg_perrito_nuevo()
returns trigger language plpgsql as $$
begin
  new.estatus := 'disponible';
  return new;
end;
$$;
create trigger perritos_nuevo
  before insert on public.perritos
  for each row execute function public.trg_perrito_nuevo();

-- Al completarse una adopcion: se guarda la fecha y la persona pasa a rol "adoptante"
create or replace function public.trg_adopcion_completada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_when = 'BEFORE' then
    if new.estado = 'completada' and (tg_op = 'INSERT' or old.estado is distinct from 'completada') then
      new.fecha_adopcion := now();
    end if;
    return new;
  end if;

  if new.estado = 'completada' then
    update usuarios set rol = 'adoptante' where id = new.usuario_id and rol = 'interesado';
  end if;
  return null;
end;
$$;
create trigger adopciones_fecha
  before insert or update of estado on public.adopciones
  for each row execute function public.trg_adopcion_completada();
create trigger adopciones_rol
  after insert or update of estado on public.adopciones
  for each row execute function public.trg_adopcion_completada();


--horarios ocupados de un dia (publico). Devuelve solo las horas, sin datos personales.
create or replace function public.horarios_ocupados(p_fecha date)
returns setof text
language sql stable security definer set search_path = public as $$
  select to_char(fecha_hora at time zone 'America/Mexico_City', 'HH24:MI')
    from visitas
   where estado = 'programada'
     and fecha_hora >= (p_fecha::timestamp at time zone 'America/Mexico_City')
     and fecha_hora <  ((p_fecha + 1)::timestamp at time zone 'America/Mexico_City');
$$;

--agendar visita (publico). Crea/reutiliza al usuario, valida y bloquea el horario.
--     Horario de atención: lunes a sabado, citas de 1 hora desde 10:00 hasta 16:00
create or replace function public.agendar_visita(
  p_nombre     text,
  p_email      text,
  p_telefono   text,
  p_perro      uuid,
  p_fecha_hora timestamptz,
  p_motivo     text default 'visita',
  p_mensaje    text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_usuario uuid;
  v_visita  uuid;
  v_local   timestamp;
  v_estatus text;
begin
  p_nombre   := btrim(coalesce(p_nombre, ''));
  p_email    := lower(btrim(coalesce(p_email, '')));
  p_telefono := btrim(coalesce(p_telefono, ''));

  if char_length(p_nombre) < 3 then raise exception 'Escribe tu nombre completo.'; end if;
  if p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$' then
    raise exception 'El correo no es válido.';
  end if;
  if p_telefono !~ '^[0-9]{10}$' then raise exception 'El teléfono debe tener 10 dígitos.'; end if;
  if p_motivo not in ('visita', 'adopcion') then raise exception 'Motivo no válido.'; end if;

  select estatus into v_estatus from perritos where id = p_perro;
  if v_estatus is null then raise exception 'El perrito no existe.'; end if;
  if v_estatus = 'adoptado' then raise exception 'Este perrito ya fue adoptado.'; end if;

  -- Validar horario
  v_local := p_fecha_hora at time zone 'America/Mexico_City';
  if p_fecha_hora <= now() then raise exception 'Elige una fecha y hora futuras.'; end if;
  if extract(dow from v_local) = 0 then raise exception 'No abrimos los domingos.'; end if;
  if extract(minute from v_local) <> 0 or extract(second from v_local) <> 0
     or extract(hour from v_local) not between 10 and 16 then
    raise exception 'Horario no válido: citas de 10:00 a 16:00, en punto.';
  end if;

  -- Usuario: si el correo ya existe se reutiliza (no se sobrescriben sus datos
  -- para que nadie pueda alterar el registro de otra persona desde la web).
  insert into usuarios (nombre, email, telefono)
  values (p_nombre, p_email, p_telefono)
  on conflict (lower(email)) do nothing;
  select id into v_usuario from usuarios where lower(email) = p_email;

  --maximo 3 visitas programadas por persona
  if (select count(*) from visitas where usuario_id = v_usuario and estado = 'programada') >= 3 then
    raise exception 'Ya tienes 3 visitas programadas. Espera a que se realicen o cancela alguna.';
  end if;

  begin
    insert into visitas (perro_id, usuario_id, fecha_hora, motivo, mensaje)
    values (p_perro, v_usuario, p_fecha_hora, p_motivo, nullif(btrim(coalesce(p_mensaje, '')), ''))
    returning id into v_visita;
  exception when unique_violation then
    raise exception 'Ese horario acaba de ser ocupado. Elige otro, por favor.';
  end;

  -- Si quiere adoptar, tambien queda registrada la solicitud de adopcion
  if p_motivo = 'adopcion' then
    insert into adopciones (perro_id, usuario_id, visita_id)
    values (p_perro, v_usuario, v_visita)
    on conflict (perro_id, usuario_id) where estado = 'solicitada' do nothing;
  end if;

  return v_visita;
end;
$$;

-- adopcion completada
create or replace function public.completar_adopcion(p_adopcion uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a adopciones%rowtype;
begin
  select * into a from adopciones where id = p_adopcion for update;
  if not found then raise exception 'La adopción no existe.'; end if;
  if a.estado <> 'solicitada' then raise exception 'Esta solicitud ya fue %.', a.estado; end if;
  if exists (select 1 from adopciones where perro_id = a.perro_id and estado = 'completada') then
    raise exception 'Este perrito ya fue adoptado.';
  end if;

  update adopciones set estado = 'completada' where id = a.id;
  update visitas    set estado = 'adopcion_concretada' where id = a.visita_id and estado = 'programada';
  -- Lo demas que estuviera pendiente para ese perrito se cancela
  update adopciones set estado = 'cancelada'
   where perro_id = a.perro_id and estado = 'solicitada' and id <> a.id;
  update visitas set estado = 'cancelada'
   where perro_id = a.perro_id and estado = 'programada';
end;
$$;

--administrador resolver una visita realizada, cancelada o adopcion_concretada
create or replace function public.admin_resolver_visita(p_visita uuid, p_accion text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v  visitas%rowtype;
  ad uuid;
begin
  if not es_admin() then raise exception 'No autorizado.'; end if;
  if p_accion not in ('realizada', 'cancelada', 'adopcion_concretada') then
    raise exception 'Acción no válida.';
  end if;

  select * into v from visitas where id = p_visita for update;
  if not found then raise exception 'La visita no existe.'; end if;
  if v.estado <> 'programada' then raise exception 'Esta visita ya está %.', v.estado; end if;

  if p_accion = 'realizada' then
    update visitas set estado = 'realizada' where id = v.id;

  elsif p_accion = 'cancelada' then
    update visitas set estado = 'cancelada' where id = v.id;
    update adopciones set estado = 'cancelada' where visita_id = v.id and estado = 'solicitada';

  else -- adopcion_concretada
    select id into ad from adopciones
     where perro_id = v.perro_id and usuario_id = v.usuario_id and estado = 'solicitada'
     limit 1;
    if ad is null then
      insert into adopciones (perro_id, usuario_id, visita_id)
      values (v.perro_id, v.usuario_id, v.id) returning id into ad;
    else
      update adopciones set visita_id = v.id where id = ad;
    end if;
    perform completar_adopcion(ad);
  end if;
end;
$$;

-- administrador resolver una solicitud de adopcion completada o cancelada
create or replace function public.admin_resolver_adopcion(p_adopcion uuid, p_accion text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'No autorizado.'; end if;
  if p_accion = 'completada' then
    perform completar_adopcion(p_adopcion);
  elsif p_accion = 'cancelada' then
    update adopciones set estado = 'cancelada' where id = p_adopcion and estado = 'solicitada';
    if not found then raise exception 'La solicitud no existe o ya fue resuelta.'; end if;
  else
    raise exception 'Acción no válida.';
  end if;
end;
$$;


-- seguridad
-- publico solo vea el catalogo y agenda
-- administrador ve todo y gestiona perritos, las visitas y adopciones
alter table public.usuarios   enable row level security;
alter table public.perritos   enable row level security;
alter table public.visitas    enable row level security;
alter table public.adopciones enable row level security;

-- permisos de tabla: se quitan todos y se otorgan solo los necesarios
revoke all on public.usuarios, public.perritos, public.visitas, public.adopciones from anon, authenticated;

grant select on public.perritos to anon, authenticated;
grant insert (nombre, raza, edad_anios, tamano, salud, descripcion, foto_url) on public.perritos to authenticated;
grant update (nombre, raza, edad_anios, tamano, salud, descripcion, foto_url) on public.perritos to authenticated;
grant delete on public.perritos to authenticated;
grant select on public.usuarios, public.visitas, public.adopciones to authenticated;

-- Politicas
create policy perritos_lectura  on public.perritos for select to anon, authenticated using (true);
create policy perritos_admin_i  on public.perritos for insert to authenticated with check (public.es_admin());
create policy perritos_admin_u  on public.perritos for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy perritos_admin_d  on public.perritos for delete to authenticated using (public.es_admin());
create policy usuarios_admin_s  on public.usuarios   for select to authenticated using (public.es_admin());
create policy visitas_admin_s   on public.visitas    for select to authenticated using (public.es_admin());
create policy adopciones_admin_s on public.adopciones for select to authenticated using (public.es_admin());

-- Permisos de funciones: quien puede llamar a cada una
revoke all on function public.es_admin()                               from public, anon, authenticated;
revoke all on function public.recalcular_estatus_perrito(uuid)         from public, anon, authenticated;
revoke all on function public.completar_adopcion(uuid)                 from public, anon, authenticated;
revoke all on function public.horarios_ocupados(date)                  from public, anon, authenticated;
revoke all on function public.agendar_visita(text, text, text, uuid, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.admin_resolver_visita(uuid, text)        from public, anon, authenticated;
revoke all on function public.admin_resolver_adopcion(uuid, text)      from public, anon, authenticated;

grant execute on function public.es_admin()                            to authenticated;
grant execute on function public.horarios_ocupados(date)               to anon, authenticated;
grant execute on function public.agendar_visita(text, text, text, uuid, timestamptz, text, text) to anon, authenticated;
grant execute on function public.admin_resolver_visita(uuid, text)     to authenticated;
grant execute on function public.admin_resolver_adopcion(uuid, text)   to authenticated;


-- fotos, solo el administrador puede subir
insert into storage.buckets (id, name, public)
values ('perritos', 'perritos', true)
on conflict (id) do nothing;

create policy fotos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'perritos' and public.es_admin());
create policy fotos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'perritos' and public.es_admin());
create policy fotos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'perritos' and public.es_admin());


-- datos de cada perrito
insert into public.perritos (nombre, raza, edad_anios, tamano, salud, foto_url) values
  ('Conchita', 'Mestiza',   2, 'Mediano',  'Vacunada y desparasitada',  'conchita1.jpg'),
  ('Max',      'Labrador',  3, 'Grande',   'Vacunado y desparasitado',  'max2.jpg'),
  ('Chikis',   'Chihuahua', 4, 'Pequeño',  'Vacunada y desparasitada',  'chikis3.jpg'),
  ('Rocky',    'Pastor',    3, 'Grande',   'Vacunado y desparasitado',  'rocky4.jpg'),
  ('Nala',     'Criolla',   1, 'Mediano',  'Vacunada y esterilizada',   'nala5.jpg'),
  ('Toby',     'Schnauzer', 5, 'Pequeño',  'Vacunado y desparasitado',  'toby6.jpg');

