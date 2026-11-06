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
const META_EVENT_SOURCE_ID = process.env.META_EVENT_SOURCE_ID || '1136962248765532'

/**
 * Hashea un valor con SHA256 (requerido por Meta para datos personales).
 * Meta requiere que los datos de usuario (teléfono, email, etc.) se envíen hasheados.
 */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Formatea un número de teléfono para el hash de Meta.
 * Meta requiere que el teléfono se envíe en formato E.164 (con prefijo +)
 * y se haga hash sobre el string completo incluyendo el +.
 */
function normalizePhoneForHash(phone: string): string {
  // Quitamos espacios, guiones y paréntesis, pero SÍ conservamos el prefijo +
  // El hash debe calcularse sobre el string E.164 completo (con +)
  return phone.replace(/[\s\-\(\)]/g, '')
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
  status?: string
  messagingType?: string
  watermark?: string
  phoneNumberId?: string
  // Campos nuevos para validación de dispositivo expandida (error 2804043)
  os?: string       // ej: "Android", "iOS", "Windows"
  osVersion?: string // ej: "13", "17", "10"
  deviceName?: string // ej: "Pixel 7", "iPhone 15"
}): Promise<{ success: boolean; data?: any; error?: string }> {
  if (!META_ACCESS_TOKEN || !META_PIXEL_ID) {
    console.error(
      '[meta-conversions] Faltan variables de entorno META_ACCESS_TOKEN o META_PIXEL_ID'
    )
    return { success: false, error: 'Faltan variables de entorno' }
  }

  const eventTime = params.eventTime ?? Math.floor(Date.now() / 1000)
  const phoneHash = sha256(normalizePhoneForHash(params.phoneNumber))

  // Build user_data with required and recommended fields for Meta Conversions API
  // Especially for WhatsApp Business events, these fields are critical for device validation
  // Including expanded device information to prevent error 2804043
  const userData: Record<string, any> = {
    // Phone in E.164 format (with +), hashed via SHA256
    // Meta expects the raw E.164 string (including +) to be hashed
    phone: phoneHash,
    // client_user_id: your internal user ID or a hashed identifier.
    // HIGHLY RECOMMENDED for WhatsApp Business matching reliability
    client_user_id: params.clientUserId,
    // Expanded device information - CRITICAL for preventing error 2804043
    // These fields tell Meta the device OS and version format is correct
    // os: 'Android' | 'iOS' | 'Windows' | etc.
    // os_version: '13' | '17' | '10' | etc.
    // device_name: 'Pixel 7' | 'iPhone 15' | etc.
    ...(params.os && { os: params.os }),
    ...(params.osVersion && { os_version: params.osVersion }),
    ...(params.deviceName && { device_name: params.deviceName }),
    // Status helps with device validation (sent, delivered, read)
    // Only add if provided
    ...(params.status && { status: params.status }),
    // Messaging type (CONVERSATION, TEMPLATE) - important for WhatsApp Business
    // Only add if provided
    ...(params.messagingType && { messaging_type: params.messagingType }),
    // Watermark helps with deduplication of events
    // Only add if provided
    ...(params.watermark && { watermark: params.watermark }),
    // Phone number ID - identifies which WhatsApp number sent the message
    // Only add if provided
    ...(params.phoneNumberId && { phone_number_id: params.phoneNumberId }),
    // Optional: client IP address (helps with device validation)
    // ...(params.clientIpAddress && { client_ip_address: params.clientIpAddress }),
    // Optional: user agent (device fingerprint)
    // ...(params.clientUserAgent && { client_user_agent: params.clientUserAgent }),
  }

  // Add optional fields if provided
  if (params.fbp) userData.fbp = params.fbp
  if (params.fbc) userData.fbc = params.fbc
  // Uncomment below if you want to include IP and UA:
  // if (params.clientIpAddress) userData.client_ip_address = params.clientIpAddress
  // if (params.clientUserAgent) userData.client_user_agent = params.clientUserAgent

  const eventData: Record<string, any> = {
    event_name: params.eventName,
    event_time: eventTime,
    // action_source: 'chat' is valid, but for WhatsApp Business events,
    // 'whatsapp' may be more appropriate. However, 'chat' is accepted.
    action_source: params.actionSource ?? 'chat',
    event_source_id: META_EVENT_SOURCE_ID,
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
 *
 * Parámetros opcionales adicionales para mejorar el matching y validación de Meta:
 * - clientUserId: ID de usuario interno o identificador hasheado (recomendado)
 * - clientIpAddress: IP del cliente (ayuda con validación de dispositivo)
 * - clientUserAgent: User-Agent del navegador/aplicación (huella de dispositivo)
 * - os: Sistema operativo (Android, iOS, Windows, etc.) - CRITICAL para error 2804043
 * - osVersion: Versión del SO (13, 17, 10, etc.) - CRITICAL para error 2804043
 * - deviceName: Nombre del dispositivo (Pixel 7, iPhone 15, etc.) - CRITICAL para error 2804043
 * - status: Estado del mensaje (sent, delivered, read)
 * - messagingType: Tipo de mensaje (CONVERSATION, TEMPLATE)
 * - watermark: Marcador para deduplicación de eventos
 * - phoneNumberId: ID del número de WhatsApp Business
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
  os?: string
  osVersion?: string
  deviceName?: string
  status?: string
  messagingType?: string
  watermark?: string
  phoneNumberId?: string
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
    os: params.os,
    osVersion: params.osVersion,
    deviceName: params.deviceName,
    status: params.status,
    messagingType: params.messagingType,
    watermark: params.watermark,
    phoneNumberId: params.phoneNumberId,
  })
}

/**
 * Envía un evento de Contact cuando un cliente inicia un chat.
 *
 * Parámetros opcionales adicionales para mejorar el matching y validación de Meta:
 * - clientUserId: ID de usuario interno o identificador hasheado (recomendado)
 * - clientIpAddress: IP del cliente (ayuda con validación de dispositivo)
 * - clientUserAgent: User-Agent del navegador/aplicación (huella de dispositivo)
 * - os: Sistema operativo (Android, iOS, Windows, etc.) - CRITICAL para error 2804043
 * - osVersion: Versión del SO (13, 17, 10, etc.) - CRITICAL para error 2804043
 * - deviceName: Nombre del dispositivo (Pixel 7, iPhone 15, etc.) - CRITICAL para error 2804043
 * - status: Estado del mensaje (sent, delivered, read)
 * - messagingType: Tipo de mensaje (CONVERSATION, TEMPLATE)
 * - watermark: Marcador para deduplicación de eventos
 * - phoneNumberId: ID del número de WhatsApp Business
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
  os?: string
  osVersion?: string
  deviceName?: string
  status?: string
  messagingType?: string
  watermark?: string
  phoneNumberId?: string
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
    os: params.os,
    osVersion: params.osVersion,
    deviceName: params.deviceName,
    status: params.status,
    messagingType: params.messagingType,
    watermark: params.watermark,
    phoneNumberId: params.phoneNumberId,
  })
}

/**
 * Envía un evento de registro completo (CompleteRegistration) cuando un cliente
 * completa su registro en el CRM.
 *
 * Parámetros opcionales adicionales para mejorar el matching y validación de Meta:
 * - clientUserId: ID de usuario interno o identificador hasheado (recomendado)
 * - clientIpAddress: IP del cliente (ayuda con validación de dispositivo)
 * - clientUserAgent: User-Agent del navegador/aplicación (huella de dispositivo)
 * - os: Sistema operativo (Android, iOS, Windows, etc.) - CRITICAL para error 2804043
 * - osVersion: Versión del SO (13, 17, 10, etc.) - CRITICAL para error 2804043
 * - deviceName: Nombre del dispositivo (Pixel 7, iPhone 15, etc.) - CRITICAL para error 2804043
 * - status: Estado del mensaje (sent, delivered, read)
 * - messagingType: Tipo de mensaje (CONVERSATION, TEMPLATE)
 * - watermark: Marcador para deduplicación de eventos
 * - phoneNumberId: ID del número de WhatsApp Business
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
  os?: string
  osVersion?: string
  deviceName?: string
  status?: string
  messagingType?: string
  watermark?: string
  phoneNumberId?: string
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
    os: params.os,
    osVersion: params.osVersion,
    deviceName: params.deviceName,
    status: params.status,
    messagingType: params.messagingType,
    watermark: params.watermark,
    phoneNumberId: params.phoneNumberId,
  })
}