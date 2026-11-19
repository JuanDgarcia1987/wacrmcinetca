import { Fragment } from "react";

import { splitTextWithUrls } from "@/lib/inbox/linkify";
import { cn } from "@/lib/utils";

interface LinkTextProps {
  /**
   * Texto del mensaje, tal cual llega de WhatsApp (puede traer URLs).
   * Acepta null/undefined porque `content_text` viene opcional en la base
   * (mensajes multimedia sin pie, plantillas sin cuerpo...).
   */
  text: string | null | undefined;
  className?: string;
  /** Clases extra para los enlaces (contraste según el fondo de la burbuja). */
  linkClassName?: string;
}

/**
 * Pinta el texto de un mensaje con los enlaces pulsables.
 *
 * Sustituye al `<p>{texto}</p>` de la burbuja: mismo aspecto, pero las URLs
 * que el cliente pegó (amazon.com/..., www.temu.com/..., https://...) abren
 * en el navegador o en la app que el móvil tenga asociada.
 *
 * `target="_blank"` + `rel="noopener noreferrer"` son obligatorios: sin el
 * noopener, la página destino puede controlar la ventana que la abrió.
 */
export function LinkText({ text, className, linkClassName }: LinkTextProps) {
  const parts = splitTextWithUrls(text ?? "");

  return (
    <p className={cn("whitespace-pre-wrap break-words text-sm", className)}>
      {parts.map((part, i) =>
        part.url ? (
          <a
            key={i}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            title={part.url}
            className={cn(
              "underline decoration-1 underline-offset-2 [overflow-wrap:anywhere] hover:opacity-80",
              linkClassName,
            )}
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </p>
  );
}