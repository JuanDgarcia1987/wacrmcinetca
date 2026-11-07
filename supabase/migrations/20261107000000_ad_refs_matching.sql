-- Calidad de emparejamiento (EMQ) para los eventos de Meta.
--
-- La landing captura estos datos del navegador del cliente en el momento
-- del clic. No son atribución — son señales que Meta usa para reconocer
-- a la persona y subir el Event Match Quality del evento Contact.
--
--   client_ip / client_user_agent -> user_data.client_ip_address / client_user_agent
--   utm_*                         -> auditoría de campaña
--   landing_url                   -> de dónde vino exactamente el clic
--
-- Todas nullable: una fila antigua sigue siendo válida sin ellas.

ALTER TABLE ad_refs
  ADD COLUMN IF NOT EXISTS client_ip        TEXT,
  ADD COLUMN IF NOT EXISTS client_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS landing_url      TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium       TEXT,
  ADD COLUMN IF NOT EXISTS utm_content      TEXT,
  ADD COLUMN IF NOT EXISTS utm_term         TEXT;

COMMENT ON COLUMN ad_refs.client_ip IS
  'IP del cliente capturada por la landing. Se reenvía como user_data.client_ip_address.';
COMMENT ON COLUMN ad_refs.client_user_agent IS
  'User-Agent del cliente capturado por la landing. Se reenvía como user_data.client_user_agent.';
COMMENT ON COLUMN ad_refs.landing_url IS
  'URL completa de la landing en el momento del clic (con fbclid y utm_*).';
