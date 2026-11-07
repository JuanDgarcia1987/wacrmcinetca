// ============================================================
// POST /api/ad-ref — crea una referencia corta para atribuir un clic
// de anuncio de Meta a la conversación de WhatsApp que venga después.
//
// Lo llama la landing page (/contacto) o cualquier web externa que
// quiera usar este CRM como destino. Devuelve un token y el enlace de
// WhatsApp listo para usar, con el token dentro del mensaje
// pre-rellenado.
//
// CORS abierto a propósito: la gracia es que cualquier sitio propiedad
// del operador pueda invocarlo desde el navegador. No expone datos
// — sólo crea una fila efímera y devuelve un token aleatorio.
//
// Ver src/lib/meta/ad-attribution.ts y docs/meta-ad-attribution.md.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import {
  generateAdRefToken,
  normalizeAdRefInput,
} from '@/lib/meta/ad-attribution'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

// Lazy-init: evita reventar en build cuando faltan variables de entorno.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

/**
 * Número del negocio en formato internacional sin '+', tal como lo
 * espera wa.me. Se configura en el entorno (WHATSAPP_BUSINESS_NUMBER),
 * no en el build: la landing lo lee en cada request.
 */
function businessNumber(): string | null {
  const raw = process.env.WHATSAPP_BUSINESS_NUMBER || ''
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

/** Mensaje pre-rellenado. El `Ref:` es lo que el webhook buscará. */
function buildWhatsAppUrl(phone: string, token: string): string {
  const text = `Hola, quiero información. Ref: ${token}`
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  try {
    const limited = checkRateLimit(`ad-ref:${getClientIp(request)}`, {
      limit: 30,
      windowMs: 60_000,
    })
    if (!limited.success) {
      return json({ error: 'rate_limited' }, 429)
    }

    const body = (await request.json().catch(() => null)) as unknown
    const input = normalizeAdRefInput(body)

    // Señales de emparejamiento. La IP y el User-Agent son los del
    // NAVEGADOR del cliente (esta petición la origina su navegador, no
    // el servidor de la landing), que es exactamente lo que Meta espera
    // en user_data para reconocer a la persona y subir el EMQ.
    //
    // `unknown` significa que ningún proxy aportó la IP; en ese caso se
    // guarda NULL en vez de mandarle a Meta una IP inválida.
    const rawIp = getClientIp(request)
    const clientIp = rawIp && rawIp !== 'unknown' ? rawIp : null
    const clientUserAgent = request.headers.get('user-agent')?.slice(0, 512) ?? null

    const token = generateAdRefToken()
    const { error } = await supabaseAdmin().from('ad_refs').insert({
      token,
      fbclid: input.fbclid,
      fbp: input.fbp,
      utm_source: input.utmSource,
      utm_medium: input.utmMedium,
      utm_campaign: input.utmCampaign,
      utm_content: input.utmContent,
      utm_term: input.utmTerm,
      landing_url: input.landingUrl,
      client_ip: clientIp,
      client_user_agent: clientUserAgent,
    })

    if (error) {
      console.error('[ad-ref] Error creando la referencia:', error.message)
      return json({ error: 'insert_failed' }, 500)
    }

    const phone = businessNumber()
    return json({
      token,
      // Sin número configurado la página muestra un aviso en vez de un
      // enlace roto; el token se creó igual y no estorba.
      waUrl: phone ? buildWhatsAppUrl(phone, token) : null,
      phone,
      // Diagnóstico: dice si este token servirá para atribuir o sólo
      // como referencia interna.
      attributable: Boolean(input.fbclid || input.fbp),
    })
  } catch (error) {
    console.error('[ad-ref] Excepción:', error)
    return json({ error: 'internal' }, 500)
  }
}
