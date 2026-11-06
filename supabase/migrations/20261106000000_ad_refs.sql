-- ============================================================
-- AD_REFS — atribución de anuncios de Meta por referencia corta
-- ============================================================
-- Puente entre un clic de anuncio (fbclid) y una conversación de
-- WhatsApp. Sin esto, el único lazo entre el anuncio y el mensaje es
-- el teléfono hasheado, que Meta no siempre logra emparejar.
--
-- Flujo:
--   1. El anuncio lleva a /contacto?fbclid=XXXX (o a una web externa
--      que llama a POST /api/ad-ref con el fbclid).
--   2. El servidor crea una fila aquí y devuelve un token corto, p. ej.
--      "R7K2X9PQ".
--   3. El botón de WhatsApp abre el chat con el mensaje pre-rellenado
--      "Hola, quiero información. Ref: R7K2X9PQ".
--   4. El webhook entrante encuentra el token en el primer mensaje,
--      mira esta fila y envía el evento Contact a Meta con `fbc`
--      (fb.1.<ms>.<fbclid>) — atribución exacta, sin adivinar por
--      teléfono.
--
-- Las filas son de un solo uso (consumed_at) y caducan a los 7 días;
-- nadie las borra por ti, pero el webhook ignora las vencidas.
-- ============================================================

CREATE TABLE IF NOT EXISTS ad_refs (
  -- Token corto y legible que viaja dentro del mensaje de WhatsApp.
  token TEXT PRIMARY KEY,
  -- Valor `fbclid` de la URL del anuncio. Null cuando el tráfico no
  -- vino de un clic de Meta (p. ej. llegó por otro canal): la fila se
  -- crea igual para no romper la página, pero sin fbc no hay nada
  -- que atribuir.
  fbclid TEXT,
  -- Cookie `_fbp`, si el navegador la tenía. Mejora el matching.
  fbp TEXT,
  -- utm_source / utm_campaign, sólo para diagnóstico.
  utm_source TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ad_refs_expires_at_idx ON ad_refs (expires_at);

-- Sólo el service role toca esta tabla: la escriben /api/ad-ref y el
-- webhook, ambos server-side. Sin políticas, RLS deja fuera a
-- cualquier sesión de usuario.
ALTER TABLE ad_refs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE ad_refs IS
  'Tokens cortos que enlazan un clic de anuncio de Meta (fbclid) con una conversación de WhatsApp. Ver docs/meta-ad-attribution.md.';
