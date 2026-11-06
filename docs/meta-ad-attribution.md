# Atribución de anuncios de Meta a conversaciones de WhatsApp

Cómo hacer que Meta sepa **qué clic de anuncio** produjo cada conversación,
en vez de intentar adivinar por número de teléfono.

## El problema

Este CRM no tiene píxel de navegador. Los eventos salen sólo del servidor
(`src/lib/meta-conversions.ts`) y el único identificador que Meta recibe del
cliente es el **teléfono hasheado**.

Ese emparejamiento falla en muchos casos reales:

- El número de WhatsApp no es el que la persona tiene en su perfil de Facebook.
- Números de trabajo, segundos celulares, teléfonos de familiares.
- Perfiles sin teléfono.

Cuando falla, la conversación existe y el evento `Contact` se envía, pero Meta
no lo atribuye al anuncio. La campaña optimiza con una muestra sesgada.

## La solución: referencia corta

```
Anuncio (fbclid en la URL)
   ↓
/contacto?fbclid=IwAR...
   ↓  POST /api/ad-ref  → fila en ad_refs, token "R7K2X9PQ"
   ↓
wa.me/<número>?text=Hola...Ref: R7K2X9PQ
   ↓
El cliente envía el mensaje
   ↓
Webhook: lee "Ref: R7K2X9PQ" → busca el fbclid → lo manda como `fbc`
   ↓
Meta atribuye la conversación al clic exacto
```

`fbc` es el mismo identificador que usaría un píxel de navegador:
`fb.1.<timestamp_ms>.<fbclid>`.

## Cómo activarlo

### 1. Aplicar la migración

```bash
supabase db push
# o aplica supabase/migrations/20261106000000_ad_refs.sql a mano
```

### 2. Configurar el número del negocio

Variable de entorno (runtime, no build):

```
WHATSAPP_BUSINESS_NUMBER=584121234567
```

Sólo dígitos, formato internacional, sin `+`.

### 3. Apuntar el anuncio a la landing

En el anuncio de Meta, la URL de destino:

```
https://tu-dominio.com/contacto
```

Meta añade `fbclid` automáticamente. La página lo captura sola.

### 4. Verificar

1. Abre `https://tu-dominio.com/contacto?fbclid=PRUEBA123`.
2. Toca "Abrir WhatsApp" → debe abrir el chat con `Ref: XXXXXXXX`.
3. Envía el mensaje desde un número nuevo.
4. En los logs debe salir el `Contact` enviado a Meta.
5. En Events Manager → Probar eventos, el evento debe traer
   **Claves de datos de usuario: Fbc** además de Teléfono.

## Usarlo desde una web externa

Si la landing vive en otro dominio (WordPress, Shopify, etc.), llama al
endpoint desde el navegador. Tiene CORS abierto:

```js
const fbclid = new URLSearchParams(location.search).get('fbclid')
const res = await fetch('https://tu-crm.com/api/ad-ref', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fbclid,
    fbp: document.cookie.match(/(?:^|; )_fbp=([^;]*)/)?.[1],
    utmSource: new URLSearchParams(location.search).get('utm_source'),
  }),
})
const { waUrl } = await res.json()
// usa waUrl como href del botón de WhatsApp
```

## Detalles que importan

- **Los tokens caducan a los 7 días.** Un token viejo en un chat guardado no
  atribuye nada; el evento sale igual, sólo por teléfono.
- **Es de un solo uso, pero no se borra.** `consumed_at` queda como auditoría.
- **Si el mensaje no trae `Ref:`** todo funciona igual que antes. La
  atribución es una mejora, no un requisito.
- **El `Ref:` se borra del mensaje guardado** para no ensuciar el inbox ni el
  contexto que se le pasa a la IA. Si el cliente sólo mandó la referencia, se
  conserva el texto original.
- **`action_source` sigue siendo `chat`.** El `fbc` no cambia eso; Meta
  acepta el click ID en eventos de chat y lo usa para atribuir.
- **Sólo el service role toca `ad_refs`.** RLS habilitado sin políticas.

## Coste

Una fila por clic que llega a la landing, ~200 bytes, y caduca a los 7 días.
En el peor caso son miles de filas al mes. No necesita mantenimiento; si
alguna vez molesta, `delete from ad_refs where expires_at < now() - interval '30 days';`.
