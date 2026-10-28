import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="bg-background border-b border-border p-4">
        <Link
          href="/"
          className="text-sm font-medium text-primary hover:text-primary-hover transition-colors"
        >
          ← Volver al CRM
        </Link>
      </nav>

      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Política de Privacidad</h1>

        <p className="mb-4">
          Esta política de privacidad describe cómo recopilamos, usamos y
          protegemos tu información cuando usas wacrm, nuestro CRM de WhatsApp.
        </p>

        <h2 className="text-xl font-bold mb-2 mt-6">1. Información que recopilamos</h2>
        <p className="mb-4">
          Recopilamos información necesaria para el funcionamiento del CRM,
          incluyendo mensajes de WhatsApp, contactos, conversaciones y datos de
          configuración de tu cuenta de WhatsApp Business.
        </p>

        <h2 className="text-xl font-bold mb-2 mt-6">2. Uso de la información</h2>
        <p className="mb-4">
          La información se utiliza únicamente para operar el servicio de CRM,
          permitir la gestión de conversaciones de WhatsApp y enviar notificaciones
          push a tu dispositivo cuando recibas nuevos mensajes.
        </p>

        <h2 className="text-xl font-bold mb-2 mt-6">3. Compartir información</h2>
        <p className="mb-4">
          No compartimos tu información con terceros, excepto con los servicios
          necesarios para el funcionamiento (Supabase, Firebase Cloud Messaging
          para notificaciones, Meta WhatsApp Business API).
        </p>

        <h2 className="text-xl font-bold mb-2 mt-6">4. Seguridad</h2>
        <p className="mb-4">
          Implementamos medidas de seguridad para proteger tu información,
          incluyendo cifrado de tokens y acceso controlado a través de autenticación.
        </p>

        <h2 className="text-xl font-bold mb-2 mt-6">5. Tus derechos</h2>
        <p className="mb-4">
          Puedes solicitar acceso, corrección o eliminación de tu información
          en cualquier momento desde la configuración de tu cuenta.
        </p>

        <h2 className="text-xl font-bold mb-2 mt-6">6. Contacto</h2>
        <p className="mb-4">
          Si tienes preguntas sobre esta política, contáctanos a través del CRM.
        </p>

        <p className="mt-8 text-sm text-muted-foreground">
          Última actualización: Octubre 2026
        </p>
      </main>
    </div>
  );
}
