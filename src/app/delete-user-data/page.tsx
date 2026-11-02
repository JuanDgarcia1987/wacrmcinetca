import Link from 'next/link';

export default function DeleteUserData() {
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
        <h1 className="text-2xl font-bold mb-6">Eliminación de datos del usuario</h1>

        <p className="mb-4">
          En wacrm, puedes solicitar la eliminación completa de tus datos personales
          y de tu cuenta en cualquier momento.
        </p>

        <h2 className="text-xl font-bold mb-2 mt-6">¿Qué datos se eliminarán?</h2>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li>Tu perfil de usuario (nombre, email, avatar)</li>
          <li>Tu información de cuenta y permisos</li>
          <li>Las conversaciones asociadas a tu cuenta</li>
          <li>Los contactos que creaste o importaste</li>
          <li>Las suscripciones de notificaciones push (FCM)</li>
          <li>Las configuraciones personales (tema, modo, etc.)</li>
        </ul>

        <h2 className="text-xl font-bold mb-2 mt-6">¿Cómo solicitar la eliminación?</h2>
        <p className="mb-4">
          Puedes solicitar la eliminación de tus datos de dos formas:
        </p>
        <ul className="list-decimal pl-6 mb-4 space-y-2">
          <li>Desde la app, ve a <strong>Configuración → Perfil → Eliminar cuenta</strong> (si la opción está habilitada en tu instalación)</li>
          <li>O envía un mensaje directo al propietario de esta instalación indicando que deseas eliminar tu cuenta y todos tus datos asociados</li>
        </ul>

        <h2 className="text-xl font-bold mb-2 mt-6">Tiempo de eliminación</h2>
        <p className="mb-4">
          Una vez recibida tu solicitud, tus datos se eliminarán en un plazo máximo de <strong>30 días naturales</strong>.
          Recibirás una confirmación por email o Telegram cuando el proceso se complete.
        </p>

        <h2 className="text-xl font-bold mb-2 mt-6">Datos que no se pueden eliminar</h2>
        <p className="mb-4">
          Algunos datos pueden ser retenidos por razones legales, de seguridad o de integridad del servicio (por ejemplo,
          registros de acceso para prevenir actividades fraudulentas). Estos datos no se usan para ningún otro propósito
          y se eliminan automáticamente una vez que ya no sean necesarios para esos fines.
        </p>

        <h2 className="text-xl font-bold mb-2 mt-6">Contacto</h2>
        <p className="mb-4">
          Si tienes dudas sobre este proceso o necesitas asistencia, puedes contactar al administrador de esta instalación
          a través de los canales de soporte disponibles en la configuración del CRM.
        </p>

        <p className="mt-8 text-sm text-muted-foreground">
          Última actualización: Octubre 2026
        </p>
      </main>
    </div>
  );
}
