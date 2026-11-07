// ------------------------------------------------------------------
// Configuración de la landing. Es el ÚNICO archivo que necesitas tocar
// para cambiar textos, colores o el número de WhatsApp.
// Después de editarlo: commit + push, y EasyPanel reconstruye solo.
// ------------------------------------------------------------------
window.LANDING_CONFIG = {
  // Marca
  businessName: 'CINETCA',
  accent: '#25d366',
  accentDark: '#128c4a',

  // Textos
  headline: 'Escríbenos por WhatsApp',
  subheadline:
    'Cuéntanos qué necesitas y te respondemos en minutos. Sin formularios, sin esperas.',
  buttonText: 'Abrir WhatsApp',
  bullets: [
    'Respuesta inmediata',
    'Atención personalizada',
    'Sin compromiso',
  ],

  // Número del negocio (sólo dígitos, formato internacional).
  // Se usa SOLO si la API del CRM no responde.
  whatsappNumber: '584126724977',
  whatsappMessage: 'Hola, quiero información.',

  // Dónde vive el CRM. La landing le pide aquí el enlace con el token
  // de atribución (esto es lo que le dice a Meta qué anuncio trajo a
  // esta persona). El cliente nunca ve esta dirección: es una llamada
  // en segundo plano.
  crmApiBase: 'https://wacrm-wacrm.pnp1lh.easypanel.host',
}
