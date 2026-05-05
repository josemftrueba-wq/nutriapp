// ════════════════════════════════════════════════════════════
//  NutriApp — Capa de base de datos (Supabase wrapper)
//  Reemplaza Dexie/IndexedDB con la misma API simplificada
// ════════════════════════════════════════════════════════════

// ── Conversión camelCase ↔ snake_case ─────────────────────────
function _toSnake(s) {
  return s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
}
function _toCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function _objToSnake(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const r = {};
  for (const [k, v] of Object.entries(obj)) r[_toSnake(k)] = v;
  return r;
}
function _objToCamel(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const r = {};
  for (const [k, v] of Object.entries(obj)) r[_toCamel(k)] = v;
  return r;
}
function _arrToCamel(arr) {
  return (arr || []).map(_objToCamel);
}

const _sb = () => getSupabaseClient();

// ════════════════════════════════════════════════════════════
//  API pública del módulo DB
// ════════════════════════════════════════════════════════════
const DB = {

  // ── Obtener un registro por ID ──────────────────────────────
  async get(table, id) {
    const { data, error } = await _sb()
      .from(table)
      .select('*')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return _objToCamel(data);
  },

  // ── Obtener todos los registros ─────────────────────────────
  async list(table, opts = {}) {
    let q = _sb().from(table).select('*');
    if (opts.orderBy)   q = q.order(_toSnake(opts.orderBy), { ascending: opts.asc ?? true });
    if (opts.limit)     q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw error;
    return _arrToCamel(data);
  },

  // ── Filtrar por un campo ────────────────────────────────────
  async where(table, field, value, opts = {}) {
    let q = _sb().from(table).select('*').eq(_toSnake(field), value);
    if (opts.orderBy)   q = q.order(_toSnake(opts.orderBy), { ascending: opts.asc ?? true });
    if (opts.limit)     q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw error;
    return _arrToCamel(data);
  },

  // ── Filtrar con múltiples condiciones ───────────────────────
  async whereMulti(table, conditions, opts = {}) {
    let q = _sb().from(table).select('*');
    for (const [field, value] of Object.entries(conditions)) {
      q = q.eq(_toSnake(field), value);
    }
    if (opts.orderBy) q = q.order(_toSnake(opts.orderBy), { ascending: opts.asc ?? true });
    if (opts.limit)   q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw error;
    return _arrToCamel(data);
  },

  // ── Registros más recientes (fecha > X) ─────────────────────
  async whereAfter(table, field, isoDate, opts = {}) {
    let q = _sb().from(table).select('*').gt(_toSnake(field), isoDate);
    if (opts.orderBy) q = q.order(_toSnake(opts.orderBy), { ascending: opts.asc ?? true });
    if (opts.limit)   q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw error;
    return _arrToCamel(data);
  },

  // ── Insertar ─────────────────────────────────────────────────
  async add(table, obj) {
    const payload = _objToSnake({ ...obj, createdBy: authUser()?.id });
    delete payload.id; // dejar que Supabase genere el UUID
    const { data, error } = await _sb()
      .from(table)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return _objToCamel(data);
  },

  // ── Actualizar (por ID) ──────────────────────────────────────
  async update(table, id, obj) {
    const payload = _objToSnake(obj);
    delete payload.id;
    delete payload.created_at;
    delete payload.created_by;
    const { data, error } = await _sb()
      .from(table)
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return _objToCamel(data);
  },

  // ── Upsert (add o update según si tiene id) ──────────────────
  async put(table, obj) {
    if (obj.id) {
      return DB.update(table, obj.id, obj);
    } else {
      return DB.add(table, obj);
    }
  },

  // ── Eliminar ─────────────────────────────────────────────────
  async remove(table, id) {
    const { error } = await _sb().from(table).delete().eq('id', id);
    if (error) throw error;
  },

  // ── Contar ───────────────────────────────────────────────────
  async count(table, field = null, value = null) {
    let q = _sb().from(table).select('id', { count: 'exact', head: true });
    if (field && value !== null) q = q.eq(_toSnake(field), value);
    const { count, error } = await q;
    if (error) throw error;
    return count || 0;
  },

  // ── Búsqueda de texto (un campo) ────────────────────────────
  async search(table, field, term, opts = {}) {
    let q = _sb().from(table).select('*').ilike(_toSnake(field), `%${term}%`);
    if (opts.orderBy) q = q.order(_toSnake(opts.orderBy), { ascending: opts.asc ?? true });
    const { data, error } = await q;
    if (error) throw error;
    return _arrToCamel(data);
  },

  // ── Búsqueda en múltiples campos (5.3 server-side search) ──────
  async searchMulti(table, fields, term, opts = {}) {
    let q = _sb().from(table).select('*');
    // Construir condición OR: el primer campo como or(), los demás con or()
    if (fields && fields.length > 0) {
      q = q.or(
        fields.map(f => `${_toSnake(f)}.ilike.%${term}%`).join(',')
      );
    }
    if (opts.orderBy) q = q.order(_toSnake(opts.orderBy), { ascending: opts.asc ?? true });
    const { data, error } = await q;
    if (error) throw error;
    return _arrToCamel(data);
  },

  // ── Configuración (fila única) ───────────────────────────────
  async getConfig() {
    const { data } = await _sb().from('configuracion').select('*').eq('id', 1).single();
    return _objToCamel(data) || {};
  },
  async updateConfig(fields) {
    const payload = _objToSnake({ ...fields, updatedAt: new Date().toISOString() });
    delete payload.id;
    const { error } = await _sb().from('configuracion').update(payload).eq('id', 1);
    if (error) throw error;
  },

  // ── Perfiles / usuarios ──────────────────────────────────────
  async listUsuarios() {
    const { data, error } = await _sb()
      .from('perfiles')
      .select('id, nombre, rol, created_at');
    if (error) throw error;
    return _arrToCamel(data);
  },
  async updateRol(userId, rol) {
    const { error } = await _sb()
      .from('perfiles')
      .update({ rol })
      .eq('id', userId);
    if (error) throw error;
  },
};
