# Hermes — Contexto / Handoff

Nota de traspaso para el agente que retome este repo (desde Telegram). Estado al
**27-oct-2026**. Lee esto antes de tocar nada.

## Estado del push nativo (Android + FCM)

La cadena de push **ya está arreglada y el código completo está en `main`**.
Ruta que se siguió (por si algún error vuelve a aparecer):

1. `Internal server error` en `/api/push/test`
   → causa: `initVapid()` lanzaba con una **clave VAPID inválida** (44 chars) y
   mataba todo el push, incluido el FCM que no la necesita.
   → fix `b0ed5b3`: `initVapid()` ahora captura el error y deja el FCM seguir.
2. `Push not configured` / `received unexpected response code`
   → la clave VAPID estaba rota + suscripciones web viejas muertas en la DB.
   → **clave VAPID nueva y válida generada** (32 bytes) y puesta en easypanel;
   las 9 suscripciones `web` obsoletas se **borraron de la DB** (solo queda el
   token FCM Android, `provider='fcm'`).
3. `FCM 400`
   → causa: campo `priority` **inválido** dentro de `message.android.notification`.
   → fix **`30b4bbf`**: `src/lib/push/fcm.ts` quedó con `android.notification`
   solo con `channel_id`. Verificado localmente → `success: true`.

## ⚠️ LO ÚNICO PENDIENTE hoy

**easypanel aún no ha hecho Rebuild** del commit `30b4bbf`. Hasta que alguien
dispare **Implementar / Rebuild** (o el webhook) con ese commit, el botón de
prueba de push seguirá dando `FCM 400`. El código ya está en GitHub.

## Arquitectura que presupone Hermes (importante)

- La web es **Next.js 16** (`src/`), deploy vía easypanel → **Docker standalone**.
- La app **Android es un WebView de Capacitor** que carga la **URL remota**
  `https://wacrm-wacrm.pnp1lh.easypanel.host` (`app/capacitor.config.ts`).
  ⇒ **cambios de front/back = `git push` → easypanel Rebuild**. NO hay que
  recompilar el APK para cambios de código web.
- **APK**: solo se recompila para cambios nativos (p. ej. `presentationOptions`
  del push, ya horneado). Proyecto en `app/`, ahora **commiteado en git**.
  Build en este equipo: solo con **JDK 21** vía `app/android/gradle.properties`.

## Variables de entorno — NO están en git

`.env` está **excluido** de git (secreto). Las variables viven en **easypanel**:
- `FIREBASE_SERVICE_ACCOUNT` (base64 del service-account JSON). Ya seteada.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`: la **nueva clave válida**
  (regenerada 27-oct) ya está en easypanel y también reflejada en `.env` local.
- `SUPABASE_*`, `ENCRYPTION_KEY`, `META_APP_SECRET`, etc.

Si Hermes edita back y necesita las env, que NO las invente: **viven en
easypanel** (o en `.env` local, ignorado por git).

## To-dos útiles de referencia

- API FCM REST sin firebase-admin: `src/lib/push/fcm.ts` (RS256 JWT → OAuth → send).
- Canal con sonido: `NATIVE_CHANNEL_ID = 'wacrm-messages'` en
  `src/lib/push/capacitor.ts` (debe coincidir con el `channel_id` de fcm.ts).
- Switch persistente: `NATIVE_ENABLED_KEY` (localStorage) en
  `src/hooks/use-push-notifications.ts`.
- La tabla `push_subscriptions` ahora soporta `provider='fcm'` (token en `endpoint`)
  y `provider='web'`. Migración: `supabase/migrations/20261027000000_push_fcm.sql`.