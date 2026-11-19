/**
 * Detección de enlaces dentro del texto de un mensaje.
 *
 * Los mensajes de WhatsApp llegan como texto plano: el contenido del mensaje
 * se guarda tal cual lo mandó el cliente y se pinta dentro de un <p>. Este
 * módulo parte ese texto en tramos de texto normal y tramos de URL para que
 * el componente de burbuja pueda pintar cada URL como un enlace pulsable.
 *
 * Cubre tres formas, en este orden de prioridad:
 *   1. URL con esquema explícito      https://amazon.com/dp/B0...
 *   2. URL con www.                   www.amazon.com/dp/B0...
 *   3. Dominio desnudo con TLD         amazon.com/dp/B0...
 *
 * La forma 3 es la que más se usa en WhatsApp (la gente pega el enlace del
 * producto sin el https://), así que la lista de TLD es lo que evita que se
 * conviertan en enlaces cosas que no lo son: "10.000", "v1.2", "3.5 mm".
 *
 * Sin dependencias a propósito: así se puede probar con node sin montar el
 * proyecto entero.
 */

export interface TextPart {
  /** Texto tal como se muestra. */
  text: string;
  /** URL destino, o null cuando el tramo es texto normal. */
  url: string | null;
}

/**
 * TLDs que se aceptan en un dominio "desnudo" (sin http:// ni www.).
 * Es una lista conservadora a propósito: si un TLD no está aquí, el texto se
 * queda como texto. Mejor no enlazar algo dudoso que enlazar de más.
 */
const TLDS = [
  // genéricos
  "com", "net", "org", "info", "biz", "pro", "name", "mobi", "asia", "int",
  // regionales / países
  "ve", "co", "us", "es", "mx", "ar", "cl", "pe", "ec", "bo", "py", "uy",
  "br", "ca", "uk", "de", "fr", "it", "eu", "pt", "ru", "cn", "jp", "in",
  // tecnológicos / tiendas
  "io", "ai", "app", "dev", "cloud", "tech", "sh", "so", "to", "cc", "gl",
  "im", "gg", "ly", "tv", "me", "id", "link", "click", "site", "online",
  "store", "shop", "space", "website", "page", "pages", "fun", "vip", "top",
  "one", "life", "world", "today", "work", "ltd", "group", "media", "agency",
  "digital", "solutions", "services", "network", "systems", "tools", "codes",
  "software", "art", "design", "blog", "news", "xyz", "edu", "gov", "mil",
] as const;

const TLD_ALT = TLDS.join("|");

/**
 * Un solo barrido con las tres formas. El orden importa: si viene con
 * https:// o con www. esa rama gana y no se evalúa la del dominio desnudo.
 */
const URL_PATTERN = new RegExp(
  [
    // 1) esquema explícito
    String.raw`https?:\/\/[^\s<>"']+`,
    // 2) www.
    String.raw`www\.[^\s<>"']+`,
    // 3) dominio desnudo, con ruta opcional
    String.raw`(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:${TLD_ALT})(?![a-z0-9-]|\.[a-z])(?:\/[^\s<>"']*)?`,
  ].join("|"),
  "gi",
);

/** Puntuación que casi nunca es parte de una URL y sí del texto que la rodea. */
const TRAILING_PUNCT = /[.,;:!?¡¿)\]}'"…»]+$/u;

/** Caracteres que delatan que el "dominio" es en realidad parte de otra cosa. */
const PREV_BLOCKERS = /[A-Za-z0-9_@./-]/;

/**
 * Valida un candidato y devuelve el tramo enlazable, o null si no lo es.
 */
function toPart(raw: string, index: number, source: string): TextPart | null {
  const text = raw.replace(TRAILING_PUNCT, "");
  if (!text) return null;

  const prev = index > 0 ? source[index - 1] : "";
  const hasScheme = /^https?:\/\//i.test(text);
  const hasWww = /^www\./i.test(text);

  // Dominio desnudo pegado a otra cosa: "juan@gmail.com", "archivo.tar.gz",
  // "v1.2.3" con TLD numérico... Si viene pegado a un carácter de palabra,
  //arroba, punto o barra, no es un enlace.
  if (!hasScheme && !hasWww && prev && PREV_BLOCKERS.test(prev)) return null;

  // Un correo nunca es un enlace.
  if (text.includes("@")) return null;

  // Tiene que haber un host con punto (o ser localhost, que no enlazamos).
  const host = text.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0];
  if (!host || !host.includes(".")) return null;
  if (!/^[a-z0-9.-]+$/i.test(host)) return null;

  const url = hasScheme ? text : `https://${text}`;
  return { text, url };
}

/**
 * Parte `input` en tramos alternos de texto y URL.
 *
 * Siempre devuelve al menos un elemento, y la concatenación de los `text`
 * reconstruye la entrada exacta (los tramos de URL llevan su URL en `url`).
 */
export function splitTextWithUrls(input: string): TextPart[] {
  if (!input) return [];

  const parts: TextPart[] = [];
  let last = 0;
  URL_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(input)) !== null) {
    const part = toPart(match[0], match.index, input);
    if (!part) continue; // el candidato era texto normal; se sigue buscando

    if (match.index > last) {
      parts.push({ text: input.slice(last, match.index), url: null });
    }
    parts.push(part);
    // Se avanza solo lo que ocupa el enlace ya recortado: la puntuación final
    // que se le quitó (")" de "(mira amazon.com/x)", "?" de "¿viste...?")
    // se queda en el texto y no se pierde del mensaje.
    last = match.index + part.text.length;
  }

  if (last < input.length) {
    parts.push({ text: input.slice(last), url: null });
  }

  return parts.length > 0 ? parts : [{ text: input, url: null }];
}

/** Atajo: ¿el texto tiene al menos un enlace? */
export function hasLinks(input: string): boolean {
  return splitTextWithUrls(input).some((part) => part.url !== null);
}