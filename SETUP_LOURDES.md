# 🚀 NutriApp — Manual de Configuración Final para Lourdes

**Estado actual**: App deployada en producción. Tareas pendientes: 4 (todas en este manual).

---

## 1️⃣ ANTHROPIC API KEY en Vercel (⏱️ 5 min)

### Paso 1: Obtener tu API Key
1. Ve a https://console.anthropic.com/account/keys
2. Copia tu API Key (o crea una nueva si no tienes)
   - Debería empezar por `sk-ant-...`

### Paso 2: Añadirla en Vercel
1. Ve a https://vercel.com/dashboard
2. Selecciona proyecto `nutriapp`
3. Haz clic en **Settings** (arriba)
4. En el menú izquierdo: **Environment Variables**
5. Haz clic en **Add New**
6. **Name**: `ANTHROPIC_API_KEY`
7. **Value**: Pega tu API Key
8. Selecciona todos los **Environments** (Production, Preview, Development)
9. **Save**

### Paso 3: Redeploy
1. En el dashboard de Vercel, ve a **Deployments**
2. Haz clic en el último deploy (arriba)
3. En la esquina superior derecha: **Redeploy** (no toques "Redeploy with cache")
4. Espera a que se ponga verde ✅ (unos 30 segundos)

**Verificación**: Ve a https://nutriapp-two-rose.vercel.app/app.html
- Abre la app → Settings ⚙️
- Debajo de "Claude API" debería aparecer un panel con instrucciones sobre que la clave está configurada en Vercel (no en la app)
- Si aparece verde ✅ → Listo

---

## 2️⃣ Ejecutar SQL en Supabase (⏱️ 10 min)

### Paso 1: Acceder a Supabase
1. Ve a https://app.supabase.com
2. Selecciona tu proyecto NutriApp
3. En el menú izquierdo: **SQL Editor**

### Paso 2: Ejecutar Fase 2 (GDPR)
1. Haz clic en **New Query**
2. Copia y pega esto:

```sql
alter table clientes
  add column if not exists consentimiento_rgpd   boolean   not null default false,
  add column if not exists consentimiento_fecha  timestamptz;

comment on column clientes.consentimiento_rgpd  is 'Consentimiento explícito al tratamiento de datos de salud (Art. 9.2.a RGPD)';
comment on column clientes.consentimiento_fecha is 'Fecha y hora en que se registró el consentimiento';
```

3. Haz clic en **Run** (o presiona Ctrl+Enter)
4. Debería aparecer ✅ sin errores

### Paso 3: Ejecutar Fase 3 (Limpiar plantillas duplicadas)
1. **New Query** (otra pestaña nueva)
2. Copia y pega esto:

```sql
delete from menus
where nombre ilike '%copia%'
  and nombre ilike '%fodmap%';
```

3. **Run**
4. Debería aparecer "Delete 1 row" o "Delete 0 rows" (sin errores)

**Verificación**: 
- En Supabase, ve a **Table Editor** → `clientes` → debería haber 2 columnas nuevas: `consentimiento_rgpd` y `consentimiento_fecha`

---

## 3️⃣ EmailJS (Seguimiento por Email) (⏱️ 15 min)

### Paso 1: Crear cuenta EmailJS
1. Ve a https://www.emailjs.com
2. **Sign up** (o **Sign in** si ya tienes)
3. Verifica tu email

### Paso 2: Obtener credenciales
1. Haz clic en **Public Key** (esquina arriba a la derecha)
   - Copia tu **Public Key** (ej: `abcd1234...`)
2. En el menú izquierdo: **Email Services**
3. Haz clic en **Add Service** (o usa uno existente)
   - Selecciona tu proveedor de email (Gmail, Outlook, etc.)
   - Sigue los pasos para conectar
   - Copia el **Service ID** (ej: `service_abc123`)
4. En el menú: **Email Templates**
5. Haz clic en **Create Template**
   - **Template ID**: `nutriapp_seguimiento` (importante: exactamente así)
   - **Subject**: `Tu seguimiento nutricional — {{nombre}}`
   - **Body**: Personaliza con el contenido que quieras
     ```
     Hola {{nombre}},
     
     Aquí va tu medición de esta semana:
     {{medicion}}
     
     Sigue adelante 💪
     Lourdes
     ```
   - Haz clic en **Save**

### Paso 3: Guardar en NutriApp
1. Ve a https://nutriapp-two-rose.vercel.app/app.html
2. Haz clic en **Settings** ⚙️
3. Scroll hasta **EmailJS**
4. Rellena:
   - **Public Key**: `abcd1234...` (del paso 2.1)
   - **Service ID**: `service_abc123` (del paso 2.3)
   - **Template ID**: `nutriapp_seguimiento` (del paso 2.5)
5. Haz clic en **Guardar EmailJS**
   - Debería aparecer ✅ verde

**Verificación**: 
- En la ficha de un cliente → **Informes y envío** → debería haber un botón 📧 "Enviar por email"

---

## 4️⃣ Logo y Política de Privacidad (⏱️ 10 min)

### Parte A: Logo
1. Ve a https://nutriapp-two-rose.vercel.app/app.html
2. **Settings** ⚙️
3. Scroll a **Apariencia**
4. Haz clic en **📤 Subir logo**
   - Selecciona un PNG/JPG (recomendado: 400×400px cuadrado, <500KB)
   - Se guardará automáticamente
5. Debería aparecer en el Dashboard y en el header

### Parte B: Política de Privacidad
1. La política está en: https://nutriapp-two-rose.vercel.app/privacidad.html
   - Texto ya incluido (RGPD completo)
2. **Revisar con asesor legal** (importante):
   - ¿Datos correctos de tu consulta?
   - ¿Ubicación de servidores OK?
   - ¿Terceros declarados correctamente?
3. Si hay cambios, avísame para editarla

---

## ✅ Checklist Final

Marca cuando hagas cada cosa:

- [ ] 1.1 Copié API Key de Anthropic Console
- [ ] 1.2 Añadí ANTHROPIC_API_KEY en Vercel env vars
- [ ] 1.3 Hice Redeploy en Vercel
- [ ] 1.4 Verifiqué que funciona (Settings muestra clave configurada)
- [ ] 2.1 Ejecuté SQL Fase 2 (consentimiento_rgpd)
- [ ] 2.2 Ejecuté SQL Fase 3 (limpiar FODMAP)
- [ ] 2.3 Verifiqué que las columnas aparecen en Supabase
- [ ] 3.1 Creé cuenta EmailJS
- [ ] 3.2 Obtuve Public Key, Service ID, Template ID
- [ ] 3.3 Guardé credenciales en NutriApp Settings
- [ ] 3.4 Verifiqué que aparece botón 📧 en ficha cliente
- [ ] 4.1 Subí logo
- [ ] 4.2 Revisé Política de Privacidad con abogado
- [ ] 4.3 Solicitaste cambios (si aplica)

---

## 🆘 Problemas Comunes

### "La app no carga después de Redeploy"
- Espera 2-3 minutos (Vercel sigue desplegando)
- Abre en navegador privado (Ctrl+Shift+P) para evitar caché antiguo
- Si sigue fallando: revisa que la API Key sea válida en Anthropic Console

### "SQL da error 'column already exists'"
- Tranquilo, es normal si ya las añadiste antes
- El comando tiene `if not exists` para evitarlo
- Puedes ejecutarlo de nuevo sin problema

### "EmailJS no envía emails"
- Verifica que el **Service ID** esté conectado (Email Services)
- Prueba enviando un email de prueba desde EmailJS primero
- Revisa que el **Template ID** sea exacto: `nutriapp_seguimiento`

### "El logo no aparece"
- Logo debe ser <500KB
- Formatos: PNG, JPG, WEBP
- Si aún no aparece, prueba con otro navegador (F5 para refrescar)

---

## 📞 Próximos Pasos

Una vez todo configurado:

1. **Prueba con un cliente ficticio**:
   - Crea un cliente de prueba
   - Agrega una medición
   - Envía un email (debería recibirse)

2. **Invita a tus primeros pacientes**:
   - Comparte el link: https://nutriapp-two-rose.vercel.app/app.html
   - Ellos crearán cuenta con su email
   - Tú gestionas fichas, mediciones, menús desde tu login

3. **Customización futura**:
   - Cambia el nombre/subtítulo de la app (Settings)
   - Actualiza logo si quieres
   - Revisa reportes en Informes y envío

---

**¡Listo! NutriApp está en producción.** 🎉

Si surge algo, escribe el error y lo resolvemos juntos.
