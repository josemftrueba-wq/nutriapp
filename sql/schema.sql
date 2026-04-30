-- ╔══════════════════════════════════════════════════════════╗
-- ║           NutriApp — Schema Supabase (PostgreSQL)        ║
-- ║  Ejecutar en: Supabase Dashboard → SQL Editor            ║
-- ╚══════════════════════════════════════════════════════════╝

-- ── Extensiones ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Tipo de rol ───────────────────────────────────────────────
do $$ begin
  create type user_role as enum ('super_admin', 'nutricionista');
exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════
--  TABLA: perfiles  (extiende auth.users con rol)
-- ════════════════════════════════════════════════════════════
create table if not exists perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  nombre    text,
  rol       user_role not null default 'nutricionista',
  created_at timestamptz default now()
);

-- Poblar perfil automáticamente al registrar usuario
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into perfiles (id, nombre, rol)
  values (new.id, new.raw_user_meta_data->>'nombre', 'nutricionista');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Helper: obtener rol del usuario actual
create or replace function get_user_role()
returns user_role language sql security definer as $$
  select rol from perfiles where id = auth.uid();
$$;

-- ════════════════════════════════════════════════════════════
--  TABLA: clientes
-- ════════════════════════════════════════════════════════════
create table if not exists clientes (
  id          uuid primary key default uuid_generate_v4(),
  nombre      text not null,
  apellidos   text not null,
  fnac        date,
  sexo        char(1),
  altura      numeric,
  telefono    text,
  email       text,
  objetivo    text,
  notas       text,
  created_at  timestamptz default now(),
  created_by  uuid references auth.users(id)
);

-- ════════════════════════════════════════════════════════════
--  TABLA: mediciones
-- ════════════════════════════════════════════════════════════
create table if not exists mediciones (
  id               uuid primary key default uuid_generate_v4(),
  cliente_id       uuid references clientes(id) on delete cascade,
  fecha            timestamptz,
  -- Composición corporal
  peso             numeric,
  puntuacion       numeric,
  agua             numeric,
  proteina         numeric,
  minerales        numeric,
  masa_grasa       numeric,
  pct_grasa        numeric,
  grasa_subcut     numeric,
  pct_grasa_sub    numeric,
  gv               numeric,
  mlg              numeric,
  masa_musc        numeric,
  -- Musculoesquelético
  musc_esq         numeric,
  pct_musc_esq     numeric,
  osea             numeric,
  fc               numeric,
  -- Hidratación y metabolismo
  agua_ec          numeric,
  agua_ic          numeric,
  tmb              numeric,
  ingesta_rec      numeric,
  -- Índices
  imc              numeric,
  nivel_adip       numeric,
  pct_proteinas    numeric,
  cc               numeric,
  edad_corp        numeric,
  peso_estandar    numeric,
  control_peso     numeric,
  grado_obesidad   text,
  -- Adjuntos
  nota             text,
  pdf_base64       text,
  pdf_name         text,
  report_url       text,
  created_at       timestamptz default now(),
  created_by       uuid references auth.users(id)
);

-- ════════════════════════════════════════════════════════════
--  TABLA: menus
-- ════════════════════════════════════════════════════════════
create table if not exists menus (
  id           uuid primary key default uuid_generate_v4(),
  cliente_id   uuid references clientes(id) on delete set null,
  nombre       text,
  fecha_inicio date,
  fecha_fin    date,
  notas        text,
  created_at   timestamptz default now(),
  created_by   uuid references auth.users(id)
);

-- ════════════════════════════════════════════════════════════
--  TABLA: menu_dias (grid del menú semanal)
-- ════════════════════════════════════════════════════════════
create table if not exists menu_dias (
  id       uuid primary key default uuid_generate_v4(),
  menu_id  uuid references menus(id) on delete cascade,
  dia      text,          -- "Lunes", "Martes", etc.
  datos    jsonb          -- {desayuno, almuerzo, comida, merienda, cena}
);

-- ════════════════════════════════════════════════════════════
--  TABLA: platos  (banco de platos)
-- ════════════════════════════════════════════════════════════
create table if not exists platos (
  id           uuid primary key default uuid_generate_v4(),
  nombre       text,
  categoria    text,   -- Desayuno, Almuerzo, Comida, Merienda, Cena, General
  tiempo       numeric,
  kcal         numeric,
  proteinas    numeric,
  hidratos     numeric,
  ingredientes text,
  preparacion  text,
  notas        text,
  imagen       text,
  created_at   timestamptz default now(),
  created_by   uuid references auth.users(id)
);

-- ════════════════════════════════════════════════════════════
--  TABLA: recetas  (favoritas TheMealDB)
-- ════════════════════════════════════════════════════════════
create table if not exists recetas (
  id          uuid primary key default uuid_generate_v4(),
  id_meal     text unique,
  nombre      text,
  categoria   text,
  imagen      text,
  datos       jsonb,
  is_favorita boolean default true,
  created_at  timestamptz default now()
);

-- ════════════════════════════════════════════════════════════
--  TABLA: citas  (agenda)
-- ════════════════════════════════════════════════════════════
create table if not exists citas (
  id          uuid primary key default uuid_generate_v4(),
  cliente_id  uuid references clientes(id) on delete cascade,
  fecha       date,
  hora        time,
  motivo      text,
  notas       text,
  wa_enviado  boolean default false,
  created_at  timestamptz default now(),
  created_by  uuid references auth.users(id)
);

-- ════════════════════════════════════════════════════════════
--  TABLA: bitacora  (notas por cliente)
-- ════════════════════════════════════════════════════════════
create table if not exists bitacora (
  id          uuid primary key default uuid_generate_v4(),
  cliente_id  uuid references clientes(id) on delete cascade,
  fecha       timestamptz default now(),
  texto       text,
  tipo        text,   -- nota, objetivo, alerta, etc.
  created_at  timestamptz default now(),
  created_by  uuid references auth.users(id)
);

-- ════════════════════════════════════════════════════════════
--  TABLA: dias_bloqueados  (agenda)
-- ════════════════════════════════════════════════════════════
create table if not exists dias_bloqueados (
  id        uuid primary key default uuid_generate_v4(),
  fecha     date unique,
  tipo      text,
  motivo    text,
  created_at timestamptz default now()
);

-- ════════════════════════════════════════════════════════════
--  TABLA: configuracion  (API keys, logo — una sola fila)
-- ════════════════════════════════════════════════════════════
create table if not exists configuracion (
  id              integer primary key default 1,
  claude_api_key  text,
  ejs_key         text,
  ejs_service     text,
  ejs_template    text,
  logo_base64     text,
  nombre_app      text default 'NutriApp',
  subtitulo_app   text default 'Lourdes · Nutrición',
  updated_at      timestamptz default now(),
  constraint solo_una_fila check (id = 1)
);

-- Insertar fila vacía de configuración
insert into configuracion (id) values (1) on conflict do nothing;

-- ════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════

alter table perfiles       enable row level security;
alter table clientes       enable row level security;
alter table mediciones     enable row level security;
alter table menus          enable row level security;
alter table menu_dias      enable row level security;
alter table platos         enable row level security;
alter table recetas        enable row level security;
alter table citas          enable row level security;
alter table bitacora       enable row level security;
alter table dias_bloqueados enable row level security;
alter table configuracion  enable row level security;

-- ── perfiles ─────────────────────────────────────────────────
create policy "Usuario ve su propio perfil"
  on perfiles for select using (id = auth.uid());

create policy "Solo super_admin gestiona perfiles"
  on perfiles for all
  using (get_user_role() = 'super_admin');

-- ── clientes ─────────────────────────────────────────────────
create policy "Autenticados ven clientes"
  on clientes for select using (auth.role() = 'authenticated');

create policy "Autenticados crean clientes"
  on clientes for insert with check (auth.role() = 'authenticated');

create policy "Autenticados editan clientes"
  on clientes for update using (auth.role() = 'authenticated');

create policy "Solo super_admin elimina clientes"
  on clientes for delete using (get_user_role() = 'super_admin');

-- ── mediciones ───────────────────────────────────────────────
create policy "Autenticados ven mediciones"
  on mediciones for select using (auth.role() = 'authenticated');

create policy "Autenticados crean mediciones"
  on mediciones for insert with check (auth.role() = 'authenticated');

create policy "Autenticados editan mediciones"
  on mediciones for update using (auth.role() = 'authenticated');

create policy "Solo super_admin elimina mediciones"
  on mediciones for delete using (get_user_role() = 'super_admin');

-- ── menus ────────────────────────────────────────────────────
create policy "Autenticados gestionan menus"
  on menus for all using (auth.role() = 'authenticated');

-- ── menu_dias ────────────────────────────────────────────────
create policy "Autenticados gestionan menu_dias"
  on menu_dias for all using (auth.role() = 'authenticated');

-- ── platos ───────────────────────────────────────────────────
create policy "Autenticados gestionan platos"
  on platos for all using (auth.role() = 'authenticated');

-- ── recetas ──────────────────────────────────────────────────
create policy "Autenticados gestionan recetas"
  on recetas for all using (auth.role() = 'authenticated');

-- ── citas ────────────────────────────────────────────────────
create policy "Autenticados gestionan citas"
  on citas for all using (auth.role() = 'authenticated');

-- ── bitacora ─────────────────────────────────────────────────
create policy "Autenticados gestionan bitacora"
  on bitacora for all using (auth.role() = 'authenticated');

-- ── dias_bloqueados ──────────────────────────────────────────
create policy "Autenticados ven dias bloqueados"
  on dias_bloqueados for select using (auth.role() = 'authenticated');

create policy "Solo super_admin gestiona dias bloqueados"
  on dias_bloqueados for insert with check (get_user_role() = 'super_admin');

create policy "Solo super_admin elimina dias bloqueados"
  on dias_bloqueados for delete using (get_user_role() = 'super_admin');

-- ── configuracion ────────────────────────────────────────────
create policy "Autenticados leen configuracion"
  on configuracion for select using (auth.role() = 'authenticated');

create policy "Solo super_admin escribe configuracion"
  on configuracion for update using (get_user_role() = 'super_admin');

-- ════════════════════════════════════════════════════════════
--  ÍNDICES para rendimiento
-- ════════════════════════════════════════════════════════════
create index if not exists idx_mediciones_cliente_id on mediciones(cliente_id);
create index if not exists idx_mediciones_fecha      on mediciones(fecha desc);
create index if not exists idx_menus_cliente_id      on menus(cliente_id);
create index if not exists idx_menu_dias_menu_id     on menu_dias(menu_id);
create index if not exists idx_citas_fecha           on citas(fecha);
create index if not exists idx_citas_cliente_id      on citas(cliente_id);
create index if not exists idx_bitacora_cliente_id   on bitacora(cliente_id);
create index if not exists idx_clientes_nombre       on clientes(nombre, apellidos);
