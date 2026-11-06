import type { Metadata } from 'next'
import ContactoLanding from './contacto-landing'

// La landing se renderiza por request: el número de WhatsApp sale del
// entorno en tiempo de ejecución, no del build.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Escríbenos por WhatsApp',
  description: 'Contáctanos por WhatsApp y te respondemos al instante.',
  // Página de aterrizaje para anuncios: no queremos que compita en
  // búsqueda con el sitio principal.
  robots: { index: false, follow: false },
}

function businessNumber(): string | null {
  const digits = (process.env.WHATSAPP_BUSINESS_NUMBER || '').replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

export default function ContactoPage() {
  return <ContactoLanding businessNumber={businessNumber()} />
}
