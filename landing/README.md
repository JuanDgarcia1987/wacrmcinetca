# Landing de anuncios (servicio aparte)

Página mínima que recibe el clic del anuncio, captura el `fbclid` y manda a la
persona a WhatsApp. **No comparte nada con el CRM**: otro contenedor, otro
dominio, otro nombre. El visitante nunca ve ni deduce que existe un CRM detrás.

```
Anuncio de Meta
   ↓  https://wa.tunegocio.com/?fbclid=IwAR...
Landing (este servicio)
   ↓  POST https://<crm>/api/ad-ref       ← llamada en segundo plano
   ↓  recibe { waUrl: "https://wa.me/<número>?text=...Ref: XXXX" }
Botón "Abrir WhatsApp" → chat con el token
```

Si la API del CRM no responde, el botón abre WhatsApp igual con el enlace de
respaldo de `config.js`. El cliente nunca se queda atascado; sólo se pierde la
atribución de ese clic.

---

## Desplegar en EasyPanel

1. **Crea el servicio.** En el proyecto de EasyPanel → *+ Crear servicio* →
   **App**.
   - *Nombre*: `landing` (es lo que se verá en el panel, no en internet).
   - *Fuente*: mismo repositorio de GitHub.
   - *Rama*: `main`.
   - *Build*: **Dockerfile**.
   - *Ruta del Dockerfile*: `landing/Dockerfile`
     (si el panel pide contexto de build, `landing`).
2. **Puerto**: `80`.
3. **Dominio.** Pestaña *Domains* → añade el dominio del anuncio, por ejemplo
   `wa.tunegocio.com`, con **HTTPS / Let's Encrypt** activado.
4. **DNS.** En el proveedor de tu dominio crea un `CNAME`:

   | Nombre | Tipo  | Valor |
   |--------|-------|-------|
   | `wa`   | CNAME | el host que te da EasyPanel para el proyecto |

   Espera la propagación (de minutos a un par de horas) antes de pedir el
   certificado.
5. **Deploy.** EasyPanel construye la imagen y sirve la página en la raíz del
   dominio.

### Que se reconstruya solo

El servicio queda enganchado al repositorio. Cualquier `git push` a `main`
toca `landing/` y EasyPanel reconstruye.

---

## Configurar

Todo se edita en **`config.js`**:

| Campo | Qué hace |
|-------|----------|
| `businessName` | Nombre que aparece arriba |
| `accent` / `accentDark` | Colores de marca |
| `headline`, `subheadline`, `buttonText`, `bullets` | Textos |
| `whatsappNumber` | Número de respaldo (sólo dígitos, con código de país) |
| `whatsappMessage` | Mensaje precargado |
| `crmApiBase` | Dominio del CRM (para la llamada de atribución) |

---

## En el anuncio de Meta

URL del sitio web:

```
https://wa.tunegocio.com/
```

Sólo el dominio, sin rutas. Meta le añade `fbclid` y pasa a `utm_*` cuando
corresponda; la landing los lee de `location.search`.

---

## Comprobar que funciona

1. Abre `https://wa.tunegocio.com/?fbclid=PRUEBA123`.
2. El botón debe llevar a `https://wa.me/584126724977?text=...Ref%3A%20XXXXXXXX`.
3. Envía el mensaje desde un número **nuevo**.
4. En Supabase: `select * from ad_refs order by created_at desc limit 1;` →
   `fbclid = PRUEBA123`, `consumed_at` con fecha.
5. En Meta → Events Manager → *Probar eventos*, el evento `Contact` debe traer
   **Claves de datos de usuario: Fbc** además de Teléfono.

---

## Notas

- La página lleva `noindex, nofollow`: no aparece en Google ni en Meta.
- No guarda cookies ni datos del visitante en su propio dominio.
- El único rastro es la fila en `ad_refs` del CRM, que caduca a los 7 días.
- Si cambias de dominio, actualiza también la URL del anuncio en Meta.
