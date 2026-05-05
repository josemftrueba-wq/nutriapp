-- ════════════════════════════════════════════════════════════
--  Fase 2 RGPD — Columnas de consentimiento en tabla clientes
--  Ejecutar en Supabase → SQL Editor → New query → Run
-- ════════════════════════════════════════════════════════════

-- Añadir columna de consentimiento explícito (Art. 9.2.a RGPD)
alter table clientes
  add column if not exists consentimiento_rgpd   boolean   not null default false,
  add column if not exists consentimiento_fecha  timestamptz;

-- Comentarios descriptivos para el esquema
comment on column clientes.consentimiento_rgpd  is 'Consentimiento explícito al tratamiento de datos de salud (Art. 9.2.a RGPD)';
comment on column clientes.consentimiento_fecha is 'Fecha y hora en que se registró el consentimiento';
