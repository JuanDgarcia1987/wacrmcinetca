// ------------------------------------------------------------------
// Configuración de la landing. Es el ÚNICO archivo que necesitas tocar
// para cambiar textos, colores, la imagen de fondo o el número de WhatsApp.
// Después de editarlo: commit + push, y se despliega.
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
  // En el titular puedes resaltar una palabra en dorado con <em>...</em>.
  // Esa palabra es la que guía la lectura: aquí es el beneficio (Cashea).
  headline: 'Compra en Shein, Temu o AliExpress<br>y paga con <em>Cashea</em>',

  subheadline:
    'Elige tus productos y nosotros los compramos por ti. Te llegan a la puerta de tu casa en Carora, en 20 días hábiles.',

  buttonText: 'Escríbenos por WhatsApp',

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
