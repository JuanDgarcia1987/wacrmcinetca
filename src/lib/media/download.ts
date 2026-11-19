import type { Message } from "@/types";
import { loadMediaBlob, MediaResponseError } from "./blob-cache";
import { mediaFilename } from "./filename";
import { getT } from "@/lib/i18n/translate";

const t = getT("LibErrors");

/** Detect mobile browsers where programmatic anchor click doesn't trigger download. */
function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

/**
 * Save a chat attachment to the agent's machine.
 *
 * The obvious `<a href={media_url} download>` doesn't work for either kind
 * of media we have: browsers ignore `download` on a cross-origin href (so
 * a `chat-media` bucket URL would just navigate), and inbound media lives
 * behind an auth-gated proxy with no filename in its path. Fetching the
 * bytes ourselves solves both — we get a real `Blob` (already cached by
 * `loadMediaBlob` if the thumbnail or lightbox pulled it) and full control
 * over the filename.
 *
 * On mobile, programmatic anchor clicks don't reliably trigger downloads,
 * so we open the blob URL in a new tab and instruct the user to long-press.
 * On desktop, we use the anchor click approach with new-tab fallback.
 *
 * Throws so the caller can toast; the only silent path is the new-tab
 * fallback below.
 */
export async function downloadMediaMessage(message: Message): Promise<void> {
  const url = message.media_url;
  if (!url) throw new Error(t("media.noAttachment"));

  let blob: Blob;
  try {
    blob = await loadMediaBlob(url);
  } catch (error) {
    // A refused *response* is a real failure — inbound media Meta has
    // expired 401s here, and quietly opening a tab onto that error would
    // hide it. Let the caller toast instead.
    if (error instanceof MediaResponseError) throw error;
    // A fetch that never completed is the other case: a bucket with a
    // stricter CORS policy than ours can block the XHR while the browser
    // is still perfectly able to navigate to the object. Handing the URL
    // to a new tab gets the agent to the file, visibly.
    if (openInNewTab(url)) return;
    throw error;
  }

  const objectUrl = URL.createObjectURL(blob);
  const filename = mediaFilename(message, blob.type);

  try {
    if (isMobile()) {
      // On mobile, anchor click doesn't work reliably. Open in new tab
      // and let the user long-press to save.
      openInNewTab(objectUrl);
      // The toast is handled by the caller (media-lightbox) via the
      // returned promise resolving without error.
    } else {
      clickAnchor({
        href: objectUrl,
        download: filename,
      });
    }
  } finally {
    // Revoking in the same tick can cancel the download in Safari; a beat
    // later the browser has taken its own reference to the bytes.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

function openInNewTab(url: string): boolean {
  if (typeof document === "undefined") return false;
  clickAnchor({ href: url, target: "_blank" });
  return true;
}

/**
 * Programmatic anchor click. An anchor is used rather than `window.open`
 * because it isn't subject to the popup blocker, and because `download`
 * only exists on anchors.
 */
function clickAnchor(attrs: {
  href: string;
  download?: string;
  target?: string;
}): void {
  const a = document.createElement("a");
  a.href = attrs.href;
  if (attrs.download) a.download = attrs.download;
  if (attrs.target) {
    a.target = attrs.target;
    a.rel = "noopener noreferrer";
  }
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
