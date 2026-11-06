/**
 * Meta Conversions API (Conversiones de Meta)
 *
 * Envía eventos de conversión desde el backend del CRM a la API de
 * Conversiones de Meta para medir interacciones y conversiones en tiempo real.
 *
 * Documentación: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

import { createHash } from 'crypto'

/**
 * Variables de entorno requeridas:
 * - META_ACCESS_TOKEN: Token de acceso permanente de la API de Meta
 * - META_PIXEL_ID: ID del píxel o ID del conjunto de datos (Dataset ID)
 *
 * Agregar en EasyPanel como variables de entorno:
 *   META_ACCESS_TOKEN=tu_token_de_acceso
 *   META_PIXEL_ID=tu_pixel_o_dataset_id
 */

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN
const META_PIXEL_ID = process.env.META_PIXEL_ID
// Graph API versions live ~2 years. v20.0 (May 2024) is past its window;
// override with META_API_VERSION if the account is pinned to another version.
const META_API_VERSION = process.env.META_API_VERSION || 'v26.0'
// Opt-in. `event_source_id` is NOT part of the documented /events schema and
// was present in the payload while every call failed with 2804043, so it is
// off unless META_EVENT_SOURCE_ID is explicitly set in the environment.
const META_EVENT_SOURCE_ID = process.env.META_EVENT_SOURCE_ID || ''

/**
 * Hashea un valor con SHA256 (requerido por Meta para datos personales).
 * Meta requiere que los datos de usuario (teléfono, email, etc.) se envíen hasheados.
 */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Formatea un número de teléfono para el hash de Meta.
 * Meta normaliza a E.164 y exige hashear SOLO los dígitos: sin '+',
 * sin espacios, sin guiones ni paréntesis. Un '+' en el string cambia
 * el SHA256 y hace que el número nunca coincida con el de Meta.
 */
function normalizePhoneForHash(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Envía un evento a la API de Conversiones de Meta.
 *
 * @param params - Parámetros del evento
 * @param params.eventName - Nombre del evento (ej: 'Lead', 'Contact', 'CompleteRegistration', 'Purchase')
 * @param params.phoneNumber - Teléfono del cliente en formato internacional (ej: '+584123456789')
 * @param params.eventTime - Timestamp Unix en segundos (opcional, usa ahora si no se pasa)
 * @param params.actionSource - Origen de la acción ('app', 'website', 'phone_call', etc.)
 * @param params.eventId - ID único del evento para evitar duplicados (opcional)
 * @param params.clickId - ID de clic de anuncio (opcional)
 * @param params.fbp - Facebook click ID (opcional)
 * @param params.fbc - Facebook click ID (opcional)
 * @returns Respuesta de la API de Meta o null si falla
 */
export async function sendConversionEvent(params: {
  eventName: string
  phoneNumber: string
  eventTime?: number
  actionSource?: string
  eventId?: string
  clickId?: string
  fbp?: string
  fbc?: string
  clientUserId?: string
  clientIpAddress?: string
  clientUserAgent?: string
  /** object_id: required by some Meta event sources; omitted by default. */
  objectId?: string
  /** custom_data: value/currency/contents for e-commerce events. */
  customData?: Record<string, unknown>
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  if (!META_ACCESS_TOKEN || !META_PIXEL_ID) {
    console.error(
      '[meta-conversions] Faltan variables de entorno META_ACCESS_TOKEN o META_PIXEL_ID'
    )
    return { success: false, error: 'Faltan variables de entorno' }
  }

  const eventTime = params.eventTime ?? Math.floor(Date.now() / 1000)
  const phoneHash = sha256(normalizePhoneForHash(params.phoneNumber))

  // user_data only accepts the fields Meta documents for customer matching.
  // Anything else (os, os_version, device_name, status, messaging_type,
  // watermark, phone_number_id) is silently dropped by the API — device
  // information lives in `app_data.extinfo`, which is only validated when
  // action_source is 'app'.
  const userData: Record<string, unknown> = {
    // `ph` is the documented customer-matching key and accepts an array.
    ph: [phoneHash],
    client_user_id: params.clientUserId,
  }

  if (params.fbp) userData.fbp = params.fbp
  if (params.fbc) userData.fbc = params.fbc
  if (params.clientIpAddress) userData.client_ip_address = params.clientIpAddress
  if (params.clientUserAgent)
    userData.client_user_agent = params.clientUserAgent

  const eventData: Record<string, unknown> = {
    event_name: params.eventName,
    event_time: eventTime,
    // 'chat' is correct for messenger/WhatsApp conversations. 'app' triggers
    // app_data.extinfo validation and fails with subcode 2804043 when the
    // extinfo array is absent.
    action_source: params.actionSource ?? 'chat',
    user_data: userData,
  }

  // Only app/website events carry this; sending it for chat events is noise.
  if (params.objectId) eventData.object_id = params.objectId

  // e-commerce fields (value, currency, contents) are NOT top-level event
  // parameters — Meta only reads them from `custom_data`. Sending them at the
  // top level is silently ignored and the purchase reports as zero revenue.
  if (params.customData && Object.keys(params.customData).length > 0) {
    eventData.custom_data = params.customData
  }

  if (META_EVENT_SOURCE_ID) eventData.event_source_id = META_EVENT_SOURCE_ID

  if (params.eventId) eventData.event_id = params.eventId
  if (params.clickId) eventData.click_id = params.clickId

  const payload = {
    data: [eventData],
    access_token: META_ACCESS_TOKEN,
  }

  try {
    const url = `https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const errorBody = await resp.text()
      console.error(
        `[meta-conversions] Error HTTP ${resp.status} al enviar evento a Meta:`,
        errorBody
      )
      return { success: false, error: `HTTP ${resp.status}: ${errorBody}` }
    }

    const result = await resp.json()
    console.log(
      `[meta-conversions] Evento enviado a Meta: ${params.eventName} - ` +
        JSON.stringify(result)
    )
    return { success: true, data: result }
  } catch (error) {
    console.error('[meta-conversions] Excepción al enviar evento a Meta:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Envía un evento de Lead cuando un cliente nuevo nos escribe por primera vez.
 * Ideal para usar en el webhook de WhatsApp cuando llega un mensaje entrante
 * de un contacto nuevo.
 *
 * Parámetros opcionales adicionales para mejorar el matching y validación de Meta:
 * - clientUserId: ID de usuario interno o identificador hasheado (recomendado)
 * - clientIpAddress: IP del cliente (mejora el matching)
 * - clientUserAgent: User-Agent del cliente (mejora el matching)
 *
 * Nota: el error 2804043 NO se arregla añadiendo campos de dispositivo a
 * user_data — esos campos no existen en el esquema de la API. Se produce
 * cuando action_source es 'app' y falta app_data.extinfo.
 */
export async function sendLeadEvent(params: {
  phoneNumber: string
  eventTime?: number
  eventId?: string
  clickId?: string
  fbp?: string
  fbc?: string
  clientUserId?: string
  clientIpAddress?: string
  clientUserAgent?: string
}) {
  return sendConversionEvent({
    eventName: 'Lead',
    phoneNumber: params.phoneNumber,
    eventTime: params.eventTime,
    eventId: params.eventId,
    clickId: params.clickId,
    fbp: params.fbp,
    fbc: params.fbc,
    clientUserId: params.clientUserId,
    clientIpAddress: params.clientIpAddress,
    clientUserAgent: params.clientUserAgent,
  })
}

/**
 * Envía un evento de Contact cuando un cliente inicia un chat.
 *
 * Parámetros opcionales adicionales para mejorar el matching y validación de Meta:
 * - clientUserId: ID de usuario interno o identificador hasheado (recomendado)
 * - clientIpAddress: IP del cliente (mejora el matching)
 * - clientUserAgent: User-Agent del cliente (mejora el matching)
 *
 * Nota: el error 2804043 NO se arregla añadiendo campos de dispositivo a
 * user_data — esos campos no existen en el esquema de la API. Se produce
 * cuando action_source es 'app' y falta app_data.extinfo.
 */
export async function sendContactEvent(params: {
  phoneNumber: string
  eventTime?: number
  eventId?: string
  clickId?: string
  fbp?: string
  fbc?: string
  clientUserId?: string
  clientIpAddress?: string
  clientUserAgent?: string
}) {
  return sendConversionEvent({
    eventName: 'Contact',
    phoneNumber: params.phoneNumber,
    eventTime: params.eventTime,
    eventId: params.eventId,
    clickId: params.clickId,
    fbp: params.fbp,
    fbc: params.fbc,
    clientUserId: params.clientUserId,
    clientIpAddress: params.clientIpAddress,
    clientUserAgent: params.clientUserAgent,
  })
}

/**
 * Envía un evento de registro completo (CompleteRegistration) cuando un cliente
 * completa su registro en el CRM.
 *
 * Parámetros opcionales adicionales para mejorar el matching y validación de Meta:
 * - clientUserId: ID de usuario interno o identificador hasheado (recomendado)
 * - clientIpAddress: IP del cliente (mejora el matching)
 * - clientUserAgent: User-Agent del cliente (mejora el matching)
 *
 * Nota: el error 2804043 NO se arregla añadiendo campos de dispositivo a
 * user_data — esos campos no existen en el esquema de la API. Se produce
 * cuando action_source es 'app' y falta app_data.extinfo.
 */
export async function sendCompleteRegistrationEvent(params: {
  phoneNumber: string
  eventTime?: number
  eventId?: string
  clickId?: string
  fbp?: string
  fbc?: string
  clientUserId?: string
  clientIpAddress?: string
  clientUserAgent?: string
}) {
  return sendConversionEvent({
    eventName: 'CompleteRegistration',
    phoneNumber: params.phoneNumber,
    eventTime: params.eventTime,
    eventId: params.eventId,
    clickId: params.clickId,
    fbp: params.fbp,
    fbc: params.fbc,
    clientUserId: params.clientUserId,
    clientIpAddress: params.clientIpAddress,
    clientUserAgent: params.clientUserAgent,
  })
}

/** Un renglón de la compra. `id` es el SKU; `title` el nombre del producto. */
export interface PurchaseItem {
  /** SKU del producto (se envía como `contents[].id`). */
  id: string
  /** Nombre visible del producto (opcional, `contents[].title`). */
  title?: string
  quantity?: number
  /** Precio unitario. */
  itemPrice: number
}

/**
 * Envía un evento Purchase cuando un cliente compra.
 *
 * `value` y `currency` van dentro de `custom_data` — Meta NO lee esos campos
 * en la raíz del evento, y si se envían ahí la compra se reporta con valor 0.
 *
 * Si no se pasa `value`, se calcula como la suma de `quantity * itemPrice`.
 */
export async function sendPurchaseEvent(params: {
  phoneNumber: string
  /** Monto total. Si falta, se deriva de `items`. */
  value?: number
  /** Código ISO 4217, ej: 'USD'. Default 'USD'. */
  currency?: string
  items?: PurchaseItem[]
  /** ID de la orden en tu sistema, útil para deduplicar. */
  orderId?: string
  eventTime?: number
  eventId?: string
  clickId?: string
  fbp?: string
  fbc?: string
  clientUserId?: string
  clientIpAddress?: string
  clientUserAgent?: string
}) {
  const contents = (params.items ?? []).map((item) => ({
    id: item.id,
    quantity: item.quantity ?? 1,
    item_price: item.itemPrice,
    ...(item.title ? { title: item.title } : {}),
  }))

  const derivedValue = contents.reduce(
    (sum, c) => sum + c.item_price * c.quantity,
    0
  )
  const value = params.value ?? derivedValue

  const customData: Record<string, unknown> = {
    value,
    currency: params.currency ?? 'USD',
  }
  if (contents.length > 0) {
    customData.content_type = 'product'
    customData.contents = contents
    customData.content_ids = contents.map((c) => c.id)
    customData.num_items = contents.reduce((n, c) => n + c.quantity, 0)
  }
  if (params.orderId) customData.order_id = params.orderId

  return sendConversionEvent({
    eventName: 'Purchase',
    phoneNumber: params.phoneNumber,
    eventTime: params.eventTime,
    eventId: params.eventId,
    clickId: params.clickId,
    fbp: params.fbp,
    fbc: params.fbc,
    clientUserId: params.clientUserId,
    clientIpAddress: params.clientIpAddress,
    clientUserAgent: params.clientUserAgent,
    customData,
  })
}