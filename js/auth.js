// ════════════════════════════════════════════════════════════
//  NutriApp — Módulo de Autenticación
// ════════════════════════════════════════════════════════════

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// Usuario y rol en memoria (no en localStorage por seguridad)
let _currentUser = null;
let _currentRole = null;

// ── Login ─────────────────────────────────────────────────────
async function authLogin(email, password) {
  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await _loadUserProfile(data.user);
  return data.user;
}

// ── Logout ────────────────────────────────────────────────────
async function authLogout() {
  await _supabase.auth.signOut();
  _currentUser = null;
  _currentRole = null;
  window.location.href = 'index.html';
}

// ── Sesión actual ─────────────────────────────────────────────
async function authGetSession() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (!session) return null;
  await _loadUserProfile(session.user);
  return session.user;
}

// ── Cargar perfil y rol ───────────────────────────────────────
async function _loadUserProfile(user) {
  _currentUser = user;
  try {
    const { data } = await _supabase
      .from('perfiles')
      .select('rol, nombre')
      .eq('id', user.id)
      .single();
    _currentRole = data?.rol || 'nutricionista';
  } catch {
    _currentRole = 'nutricionista';
  }
}

// ── Getters ───────────────────────────────────────────────────
function authUser()  { return _currentUser; }
function authRole()  { return _currentRole; }
function isSuperAdmin() { return _currentRole === 'super_admin'; }

// ── Guard: redirige al login si no hay sesión ─────────────────
async function requireAuth() {
  const user = await authGetSession();
  if (!user) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

// ── Cambiar contraseña ────────────────────────────────────────
async function authChangePassword(newPassword) {
  const { error } = await _supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ── Crear usuario (solo super_admin, vía admin API) ───────────
// Nota: Supabase Free no expone la Admin API directamente desde el browser.
// La invitación se hace por email desde el dashboard de Supabase,
// o implementando un Edge Function que use la service_role key.
async function authInviteUser(email, nombre, rol) {
  // Esta función requiere una Edge Function en Supabase
  // Por ahora muestra instrucciones
  throw new Error('Crear usuarios: ve al Dashboard de Supabase → Authentication → Users → Invite user');
}

// ── Escuchar cambios de sesión ────────────────────────────────
function authOnStateChange(callback) {
  _supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) { _currentUser = null; _currentRole = null; }
    callback(session);
  });
}

// Exportar instancia del cliente para usarla en db.js
function getSupabaseClient() { return _supabase; }
