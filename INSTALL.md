# NutriApp — Guía de instalación y configuración

## Requisitos previos
- Cuenta en [GitHub](https://github.com) (gratuita)
- Cuenta en [Supabase](https://supabase.com) (gratuita)
- Cuenta en [Vercel](https://vercel.com) (gratuita)
- Opcional: cuenta en [Anthropic Console](https://console.anthropic.com) para IA
- Opcional: cuenta en [EmailJS](https://emailjs.com) para envío de emails

---

## 1. Supabase — Base de datos

### 1.1 Crear proyecto
1. Ve a [supabase.com](https://supabase.com) → **Start your project**
2. Crea una organización (puede ser tu nombre)
3. Crea un proyecto: elige nombre, contraseña de base de datos y región (West EU)
4. Espera ~2 minutos a que se provisione

### 1.2 Ejecutar el esquema
1. En el dashboard ve a **SQL Editor** → **New query**
2. Abre el archivo `sql/schema.sql` de este proyecto
3. Copia todo el contenido y pégalo en el editor
4. Pulsa **Run** (o Ctrl+Enter)
5. Debe aparecer "Success"

### 1.3 Crear usuarios
1. Ve a **Authentication** → **Users** → **Add user**
2. Crea los usuarios (email + contraseña)
3. Tras crearlos, ve al **SQL Editor** y ejecuta:

```sql
insert into perfiles (id, nombre, rol)
select id, email, 'super_admin'::user_role
from auth.users
where email in ('correo1@ejemplo.com', 'correo2@ejemplo.com')
on conflict (id) do update set rol = 'super_admin';
```

### 1.4 Obtener las credenciales
1. Ve a **Settings** → **API**
2. Copia:
   - **Project URL** → es tu `SUPABASE_URL`
   - **anon public** key → es tu `SUPABASE_ANON`
3. Edita el archivo `js/config.js`:

```javascript
const SUPABASE_URL  = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON = 'tu-anon-key';
```

---

## 2. GitHub — Repositorio de código

1. Ve a [github.com](https://github.com) → **New repository**
2. Nombre: `nutriapp` (puede ser privado)
3. En tu terminal local, dentro de la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TU-USUARIO/nutriapp.git
git branch -M main
git push -u origin main
```

---

## 3. Vercel — Despliegue web

1. Ve a [vercel.com](https://vercel.com) → **Log in with GitHub**
2. Haz clic en **Add New Project**
3. Importa el repositorio `nutriapp`
4. Deja toda la configuración por defecto
5. Haz clic en **Deploy**
6. En ~1 minuto tendrás una URL pública (p.ej. `nutriapp-xxx.vercel.app`)

> Cada vez que hagas `git push` a `main`, Vercel desplegará automáticamente la nueva versión.

---

## 4. Claude API (Inteligencia Artificial) — Opcional

La API de Claude permite:
- Extraer datos automáticamente del PDF de la báscula
- Generar menús semanales con IA
- Traducir recetas al español con información nutricional
- Asistente de IA nutricional

### Obtener la clave
1. Ve a [console.anthropic.com](https://console.anthropic.com)
2. Crea una cuenta o inicia sesión
3. Añade un método de pago (mínimo $5 de crédito — para uso normal de una consulta dura meses)
4. Ve a **API Keys** → **Create Key**
5. Copia la clave (empieza por `sk-ant-...`)

### Configurar en la app
1. Entra en NutriApp como `super_admin`
2. Ve a ⚙️ **Configuración** → sección **API Claude**
3. Pega la clave y pulsa **Guardar**

---

## 5. EmailJS — Envío de emails — Opcional

EmailJS permite enviar emails directamente desde el navegador sin servidor propio.

### Crear cuenta y obtener credenciales
1. Ve a [emailjs.com](https://emailjs.com) → **Sign Up** (plan gratuito: 200 emails/mes)
2. Ve a **Email Services** → **Add New Service**
   - Elige tu proveedor (Gmail, Outlook, etc.)
   - Sigue los pasos para conectar tu cuenta de correo
   - Al finalizar obtienes el **Service ID** (p.ej. `service_abc123`)
3. Ve a **Email Templates** → **Create New Template**
   - Diseña el email. Usa estas variables que la app envía:
     - `{{to_name}}` — nombre del destinatario
     - `{{to_email}}` — email del destinatario
     - `{{from_name}}` — nombre del remitente (tu consulta)
     - `{{subject}}` — asunto del email
     - `{{message}}` — cuerpo del mensaje
   - Guarda y obtén el **Template ID** (p.ej. `template_xyz789`)
4. Ve a **Account** → **General** para obtener tu **Public Key** (p.ej. `user_AbCdEfGh`)

### Las tres claves que necesitas
| Campo en NutriApp | Dónde obtenerlo en EmailJS |
|---|---|
| **Public Key** | Account → General |
| **Service ID** | Email Services → tu servicio |
| **Template ID** | Email Templates → tu plantilla |

### Configurar en la app
1. Entra en NutriApp como `super_admin`
2. Ve a ⚙️ **Configuración** → sección **EmailJS**
3. Introduce las tres claves y pulsa **Guardar**

---

## 6. Instalación como PWA (app en el móvil/escritorio)

### En móvil (Android/iOS)
1. Abre la URL de la app en Chrome/Safari
2. Toca el menú del navegador (⋮ o compartir)
3. Selecciona **"Añadir a pantalla de inicio"**
4. La app aparecerá como icono nativo

### En escritorio (Windows/Mac)
1. Abre la URL en Chrome
2. En la barra de direcciones aparecerá un icono de instalación (⊕)
3. Haz clic e instala
4. La app se abrirá como ventana independiente sin barra del navegador

---

## 7. Roles de usuario

| Rol | Permisos |
|---|---|
| `super_admin` | Acceso total: crear, editar, eliminar, configuración |
| `nutricionista` | Crear y editar, sin eliminar |

Para cambiar el rol de un usuario, ejecuta en el SQL Editor de Supabase:

```sql
update perfiles set rol = 'super_admin' where id = (
  select id from auth.users where email = 'correo@ejemplo.com'
);
```

---

## Soporte y actualizaciones

Para actualizar la app basta con hacer `git push` — Vercel despliega automáticamente.
Los datos están en Supabase y nunca se pierden al actualizar el código.
