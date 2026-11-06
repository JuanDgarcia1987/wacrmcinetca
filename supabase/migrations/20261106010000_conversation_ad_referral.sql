-- ============================================================
-- Atribución Click-to-WhatsApp en la conversación
-- ============================================================
-- Cuando un cliente llega tocando un anuncio que abre WhatsApp
-- directamente, Meta adjunta un objeto `referral` al primer mensaje del
-- hilo. Guardamos aquí los dos campos que sirven para atribuir y para
-- reportar después qué anuncio trajo cada conversación.
--
--   ctwa_clid     → click id del anuncio; se reenvía a Meta en
--                   `user_data.ctwa_clid` al enviar el evento Contact.
--   ad_source_id  → id del anuncio (o post) de origen, útil para
--                   cruzar conversaciones con el administrador de
--                   anuncios.
--
-- Ambos llegan una sola vez y son NULL en todo el resto de hilos
-- (tráfico orgánico, links, QR, etc.), así que el resto del esquema no
-- cambia de comportamiento.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ctwa_clid TEXT,
  ADD COLUMN IF NOT EXISTS ad_source_id TEXT;

COMMENT ON COLUMN conversations.ctwa_clid IS
  'Click id de un anuncio Click-to-WhatsApp (message.referral.ctwa_clid). Se reenvía a Meta en user_data.ctwa_clid.';
COMMENT ON COLUMN conversations.ad_source_id IS
  'Id del anuncio/post de origen del referral de Click-to-WhatsApp.';
