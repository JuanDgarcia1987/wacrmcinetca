// ============================================================
// GET /ir — puente invisible entre un clic de anuncio y WhatsApp.
//
// Existe porque una campaña con ubicación de conversión "Sitio web"
// necesita una URL, pero el resultado que buscamos es que el cliente
// caiga directamente en el chat. Esta ruta no pinta nada: guarda el
// `fbclid` que Meta añade a la URL del anuncio, lo convierte en un
// token corto y responde con un 302 a wa.me con el token dentro del
// mensaje pre-rellenado.
//
// Para el usuario es un salto instantáneo al chat. Para Meta es una
// URL de sitio web normal. Para el CRM es atribución determinista:
// el token se canjea en el webhook y viaja como `fbc` al evento
// Contact.
//
// Se excluye del middleware (src/middleware.ts) a propósito: un clic
// de anuncio no debe pagar el coste de un getUser() de Supabase.
//
// Ver docs/meta-ad-attribution.md.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { generateAdRefToken } from '@/lib/meta/ad-attribution'

export const dynamic = 'force-dynamic'

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

function businessNumber(): string | null {
  const digits = (process.env.WHATSAPP_BUSINESS_NUMBER || '').replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(header)
  return match ? decodeURIComponent(match[1]) : null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const fbclid = url.searchParams.get('fbclid')
  const fbp = readCookie(request.headers.get('cookie'), '_fbp')

  const phone = businessNumber()
  if (!phone) {
    // Sin número configurado no hay a dónde mandar al usuario. Es un
    // error de configuración del operador, no del visitante.
    console.error('[ad-ref] WHATSAPP_BUSINESS_NUMBER no está configurado')
    return new Response('WhatsApp no configurado', { status: 500 })
  }

  // Un token sólo sirve para atribuir; sin fbclid ni _fbp no hay nada
  // que atribuir, así que no se crea fila. Se sigue redirigiendo igual:
  // el contacto es más importante que la métrica.
  let token: string | null = null
  if (fbclid || fbp) {
    try {
      const candidate = generateAdRefToken()
      const { error } = await supabaseAdmin().from('ad_refs').insert({
        token: candidate,
        fbclid,
        fbp,
        utm_source: url.searchParams.get('utm_source'),
        utm_campaign: url.searchParams.get('utm_campaign'),
      })
      if (error) {
        console.error('[ad-ref] No se pudo guardar la referencia:', error.message)
      } else {
        token = candidate
      }
    } catch (error) {
      // Nunca bloquear la redirección por un fallo de base de datos.
      console.error('[ad-ref] Excepción guardando la referencia:', error)
    }
  }

  const text = token
    ? `Hola, quiero información. Ref: ${token}`
    : 'Hola, quiero información.'

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
      // Un clic de anuncio no debe cachearse: cada visita necesita su
      // propio token.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
