// ------------------------------------------------------------------
// Configuración de la landing. Es el ÚNICO archivo que necesitas tocar
// para cambiar textos, colores, la imagen de fondo o el número de WhatsApp.
// Después de editarlo: commit + push, y EasyPanel reconstruye solo.
// ------------------------------------------------------------------
window.LANDING_CONFIG = {
  // Marca
  businessName: 'CINET CA',
  accent: '#25d366',
  accentDark: '#128c4a',

  // Imagen de fondo (vertical, pensada para celular). Tiene que quedar
  // en esta misma carpeta. Lo ideal: 1080 px de ancho o más, con la
  // parte de abajo oscura y despejada, porque ahí van el titular y el botón.
  backgroundImage: './fondo.jpg',

  // Textos
  headline: 'Compra en Shein, Temu o AliExpress y paga con Cashea',
  subheadline:
    'Tú eliges los productos y nosotros los compramos y te los llevamos a la puerta de tu casa en Carora, en unos 20 días hábiles.',
  buttonText: 'Escríbenos por WhatsApp',
  bullets: [
    'Respuesta inmediata',
    'Pagas en bolívares o USDT',
    'Financias con Cashea',
  ],

  // Número del negocio (sólo dígitos, formato internacional).
  // Se usa SOLO si la API del CRM no responde.
  whatsappNumber: '584126724977',
  whatsappMessage: 'Hola, quiero información sobre una compra con Cashea.',

  // Dónde vive el CRM. La landing le pide aquí el enlace con el token
  // de atribución (esto es lo que le dice a Meta qué anuncio trajo a
  // esta persona). El cliente nunca ve esta dirección: es una llamada
  // en segundo plano.
  crmApiBase: 'https://wacrm-wacrm.pnp1lh.easypanel.host',
}
