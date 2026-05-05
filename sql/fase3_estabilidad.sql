-- ════════════════════════════════════════════════════════════
--  Fase 3 — Estabilidad
--  Ejecutar en Supabase → SQL Editor → New query → Run
-- ════════════════════════════════════════════════════════════

-- 3.4 Eliminar plantilla FODMAP duplicada
-- Busca el ID de la copia antes de eliminar (para verificar):
-- select id, nombre from menus where nombre ilike '%copia%' or nombre ilike '%(copia)%';

delete from menus
where nombre ilike '%copia%'
  and nombre ilike '%fodmap%';

-- Si el comando anterior borra más de lo esperado, usa este más específico:
-- delete from menus where nombre = 'Plantilla FODMAP · Sin gluten, sin lactosa (copia)';
