'use client'

import { useEffect, useState } from 'react'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

interface Props {
  /** Número del negocio sin '+', o null si no está configurado. */
  businessNumber: string | null
}

export default function ContactoLanding({ businessNumber }: Props) {
  // Enlace de respaldo, sin token: funciona desde el primer pintado
  // aunque el fetch tarde o falle. Cuando llega el token se reemplaza
  // por la versión con `Ref:`, que es la que da atribución exacta.
  const [waUrl, setWaUrl] = useState<string | null>(
    businessNumber ? `https://wa.me/${businessNumber}` : null
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fbclid = params.get('fbclid')
    const utmSource = params.get('utm_source')
    const utmCampaign = params.get('utm_campaign')
    const fbp = readCookie('_fbp')

    let cancelled = false

    void (async () => {
      try {
        const res = await fetch('/api/ad-ref', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fbclid, fbp, utmSource, utmCampaign }),
        })
        if (!res.ok) return
        const data = (await res.json()) as { waUrl?: string | null }
        if (!cancelled && data.waUrl) setWaUrl(data.waUrl)
      } catch {
        // Sin token: el enlace de respaldo sigue sirviendo. Se pierde
        // la atribución exacta, no el contacto.
      } finally {
        if (!cancelled) setReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366]">
            <svg
              viewBox="0 0 24 24"
              className="h-9 w-9 fill-white"
              aria-hidden="true"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold tracking-tight mb-3">
            Escríbenos por WhatsApp
          </h1>
          <p className="text-muted-foreground mb-8">
            Cuéntanos qué necesitas y te respondemos en minutos. Sin
            formularios, sin esperas.
          </p>

          {waUrl ? (
            <a
              href={waUrl}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-8 py-4 text-lg font-semibold text-white transition-opacity hover:opacity-90"
            >
              Abrir WhatsApp
            </a>
          ) : (
            <div className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
              El número de WhatsApp todavía no está configurado en esta
              instalación.
            </div>
          )}

          <p className="mt-8 text-xs text-muted-foreground" aria-live="polite">
            {waUrl && !ready
              ? 'Preparando el chat…'
              : 'Al abrir el chat, el mensaje ya viene escrito. Solo tienes que enviarlo.'}
          </p>
        </div>
      </main>
    </div>
  )
}
