/**
 * Atribución de anuncios de Meta para conversaciones de WhatsApp.
 *
 * El problema que resuelve: el CRM no tiene píxel de navegador y los
 * mensajes llegan por la Cloud API, no por un clic directo al anuncio.
 * Lo único que Meta recibe normalmente es el teléfono hasheado, y el
 * emparejamiento por teléfono falla en muchísimos casos (número de
 * trabajo, segundo celular, perfil sin teléfono).
 *
 * La solución es no depender del teléfono: el clic del anuncio trae un
 * `fbclid` en la URL, se guarda en `ad_refs` bajo un token corto, el
 * token viaja en el mensaje pre-rellenado de WhatsApp y el webhook lo
 * devuelve a Meta como `fbc`. Eso es atribución determinista, la misma
 * que tendría un píxel de navegador.
 *
 * Ver docs/meta-ad-attribution.md y supabase/migrations/20261106000000_ad_refs.sql.
 */

import { randomInt } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Alfabeto sin caracteres ambiguos (0/O, 1/I/L). El token lo va a leer
 * una persona dentro de un chat, así que la legibilidad importa.
 */
const TOKEN_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const TOKEN_LENGTH = 8

/** Días que un token sigue siendo válido después de crearse. */
export const AD_REF_TTL_DAYS = 7

/**
 * Busca un `Ref: XXXX` dentro de un mensaje. Acepta las variantes que
 * la gente escribe a mano (`ref`, `Ref:`, `REF-`, `ref #`).
 *
 * Es deliberadamente laxo: si el token no existe en la tabla, la
 * búsqueda falla y no pasa nada. Por eso no importa que también
 * capture cadenas parecidas a un teléfono.
 */
const AD_REF_PATTERN = /\bref\b[\s:#=\-–]*([A-Za-z0-9]{6,12})\b/i

export function generateAdRefToken(): string {
  let token = ''
  for (let i = 0; i < TOKEN_LENGTH; i += 1) {
    token += TOKEN_ALPHABET[randomInt(0, TOKEN_ALPHABET.length)]
  }
  return token
}

/**
 * Formato que exige Meta para el click ID: `fb.1.<timestamp_ms>.<fbclid>`.
 * El timestamp es el momento del clic (aquí, el de la creación del
 * token, que es cuando el usuario aterrizó en la página).
 */
export function buildFbc(fbclid: string, clickedAtMs: number): string {
  return `fb.1.${clickedAtMs}.${fbclid}`
}

/** Extrae el token de referencia de un mensaje, o null si no hay. */
export function extractAdRefToken(text: string | null | undefined): string | null {
  if (!text) return null
  const match = AD_REF_PATTERN.exec(text)
  return match ? match[1].toUpperCase() : null
}

/**
 * Quita el `Ref: XXXX` del texto que se guarda y se muestra en el
 * inbox — es ruido para el agente. Si al quitarlo el mensaje queda
 * vacío (el cliente sólo mandó la referencia), se devuelve el original.
 */
export function stripAdRefToken(text: string): string {
  const cleaned = text
    .replace(AD_REF_PATTERN, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[\s,;.:\-–]+/, '')
    .replace(/[\s,;:\-–]+$/, '')
    .trim()
  return cleaned.length > 0 ? cleaned : text
}

export interface AdRefAttribution {
  token: string
  /** `fb.1.<ms>.<fbclid>`, listo para `user_data.fbc`. */
  fbc?: string
  /** Cookie `_fbp` original, si se capturó. */
  fbp?: string
  /**
   * IP del cliente tal como la vio la landing. Meta la usa para
   * reconocer a la persona (`user_data.client_ip_address`) y sube el
   * Event Match Quality. Es la IP del navegador, no la del servidor.
   */
  clientIp?: string
  /** User-Agent del navegador del cliente (`user_data.client_user_agent`). */
  clientUserAgent?: string
  clickedAtMs: number
}

interface AdRefRow {
  token: string
  fbclid: string | null
  fbp: string | null
  client_ip: string | null
  client_user_agent: string | null
  created_at: string
  expires_at: string
}

/**
 * Resuelve un token a sus datos de atribución y lo marca como usado.
 *
 * Devuelve null si el token no existe, ya caducó o el lookup falla —
 * en todos esos casos el llamador sigue adelante con el evento normal
 * (atribuido sólo por teléfono). Nunca lanza.
 */
export async function consumeAdRef(
  db: SupabaseClient,
  token: string,
  now: Date = new Date()
): Promise<AdRefAttribution | null> {
  const { data, error } = await db
    .from('ad_refs')
    .select('token, fbclid, fbp, client_ip, client_user_agent, created_at, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (error) {
    console.error('[ad-attribution] Error leyendo ad_refs:', error.message)
    return null
  }
  if (!data) return null

  const row = data as AdRefRow
  const clickedAtMs = new Date(row.created_at).getTime()
  if (new Date(row.expires_at).getTime() < now.getTime()) {
    return null
  }

  const attribution: AdRefAttribution = { token, clickedAtMs }
  if (row.fbclid) attribution.fbc = buildFbc(row.fbclid, clickedAtMs)
  if (row.fbp) attribution.fbp = row.fbp
  if (row.client_ip) attribution.clientIp = row.client_ip
  if (row.client_user_agent) attribution.clientUserAgent = row.client_user_agent

  // Best-effort: el sello es sólo auditoría, un fallo aquí no debe
  // impedir que el evento salga.
  void db
    .from('ad_refs')
    .update({ consumed_at: now.toISOString() })
    .eq('token', token)
    .then(({ error: updateError }: { error: { message: string } | null }) => {
      if (updateError) {
        console.warn('[ad-attribution] No se pudo marcar el token como usado:', updateError.message)
      }
    })

  return attribution
}

/** Datos que acepta `POST /api/ad-ref`. */
export interface AdRefInput {
  fbclid?: string | null
  fbp?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
  utmTerm?: string | null
  landingUrl?: string | null
}

/** Valida y normaliza lo que llega del cliente. */
export function normalizeAdRefInput(raw: unknown): AdRefInput {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (value: unknown, max: number): string | null => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed.slice(0, max) : null
  }
  return {
    fbclid: str(input.fbclid, 512),
    fbp: str(input.fbp, 256),
    utmSource: str(input.utmSource, 128),
    utmMedium: str(input.utmMedium, 128),
    utmCampaign: str(input.utmCampaign, 128),
    utmContent: str(input.utmContent, 128),
    utmTerm: str(input.utmTerm, 128),
    landingUrl: str(input.landingUrl, 1024),
  }
}
