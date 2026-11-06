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
const META_API_VERSION = 'v20.0'
const META_EVENT_SOURCE_URL = process.env.META_EVENT_SOURCE_URL || 'https://wacrm-wacrm.pnp1lh.easypanel.host/api/whatsapp/webhook'

/**
 * Hashea un valor con SHA256 (requerido por Meta para datos personales).
 * Meta requiere que los datos de usuario (teléfono, email, etc.) se envíen hasheados.
 */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Formatea un número de teléfono eliminando espacios, guiones y paréntesis,
 * y agregando el prefijo '+' si no lo tiene.
 */
function normalizePhoneForHash(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '')
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
}): Promise<{ success: boolean; data?: any; error?: string }> {
  if (!META_ACCESS_TOKEN || !META_PIXEL_ID) {
    console.error(
      '[meta-conversions] Faltan variables de entorno META_ACCESS_TOKEN o META_PIXEL_ID'
    )
    return { success: false, error: 'Faltan variables de entorno' }
  }

  const eventTime = params.eventTime ?? Math.floor(Date.now() / 1000)
  const phoneHash = sha256(normalizePhoneForHash(params.phoneNumber))

  const userData: Record<string, any> = {
    ph: [phoneHash],
  }

  if (params.fbp) userData.fbp = params.fbp
  if (params.fbc) userData.fbc = params.fbc

  const eventData: Record<string, any> = {
    event_name: params.eventName,
    event_time: eventTime,
    action_source: params.actionSource ?? 'whatsapp',
    event_source_url: META_EVENT_SOURCE_URL,
    user_data: userData,
  }

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
 */
export async function sendLeadEvent(params: {
  phoneNumber: string
  eventTime?: number
  eventId?: string
  clickId?: string
  fbp?: string
  fbc?: string
}) {
  return sendConversionEvent({
    eventName: 'Lead',
    phoneNumber: params.phoneNumber,
    eventTime: params.eventTime,
    eventId: params.eventId,
    clickId: params.clickId,
    fbp: params.fbp,
    fbc: params.fbc,
  })
}

/**
 * Envía un evento de Contact cuando un cliente inicia un chat.
 */
export async function sendContactEvent(params: {
  phoneNumber: string
  eventTime?: number
  eventId?: string
  clickId?: string
  fbp?: string
  fbc?: string
}) {
  return sendConversionEvent({
    eventName: 'Contact',
    phoneNumber: params.phoneNumber,
    eventTime: params.eventTime,
    eventId: params.eventId,
    clickId: params.clickId,
    fbp: params.fbp,
    fbc: params.fbc,
  })
}

/**
 * Envía un evento de registro completo (CompleteRegistration) cuando un cliente
 * completa su registro en el CRM.
 */
export async function sendCompleteRegistrationEvent(params: {
  phoneNumber: string
  eventTime?: number
  eventId?: string
  clickId?: string
  fbp?: string
  fbc?: string
}) {
  return sendConversionEvent({
    eventName: 'CompleteRegistration',
    phoneNumber: params.phoneNumber,
    eventTime: params.eventTime,
    eventId: params.eventId,
    clickId: params.clickId,
    fbp: params.fbp,
    fbc: params.fbc,
  })
}