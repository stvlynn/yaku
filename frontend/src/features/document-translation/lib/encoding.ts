import { copy } from "../../../shared/i18n";

function byteEncoding(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
}
function decode(bytes: Uint8Array, encoding: string): string {
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(encoding, { fatal: true });
  } catch (cause) {
    throw new Error(`${copy.documentUnsupportedEncoding}: ${encoding}`, {
      cause,
    });
  }
  try {
    return decoder.decode(bytes);
  } catch (cause) {
    throw new Error(copy.documentInvalidEncoding, { cause });
  }
}
export function decodeXmlBytes(bytes: Uint8Array): string {
  const encoding =
    byteEncoding(bytes) ??
    (bytes[0] === 0 && bytes[1] === 0x3c
      ? "utf-16be"
      : bytes[0] === 0x3c && bytes[1] === 0
        ? "utf-16le"
        : "utf-8");
  const text = decode(bytes, encoding);
  const declared = /^\s*<\?xml\s[^?]*encoding\s*=\s*["']([^"']+)["']/i
    .exec(text)?.[1]
    ?.toLowerCase();
  const declaration = declared?.replaceAll("-", "");
  if (
    declaration &&
    !["utf8", "utf16", "utf16le", "utf16be"].includes(declaration)
  )
    throw new Error(`${copy.documentUnsupportedEncoding}: ${declared}`);
  if (
    declaration &&
    ((declaration === "utf8" && encoding !== "utf-8") ||
      (declaration.startsWith("utf16") && encoding === "utf-8") ||
      (declaration === "utf16le" && encoding === "utf-16be") ||
      (declaration === "utf16be" && encoding === "utf-16le"))
  )
    throw new Error(copy.documentInvalidEncoding);
  return text;
}

/** BOM wins; otherwise recognize declared HTML encodings within the encoding-prescan window. */
export function decodeHtmlBytes(bytes: Uint8Array): string {
  const bom = byteEncoding(bytes);
  if (bom) return decode(bytes, bom);
  const prescan = new DOMParser().parseFromString(
    new TextDecoder("windows-1252").decode(bytes.subarray(0, 1024)),
    "text/html",
  );
  let encoding: string | undefined;
  for (const meta of prescan.querySelectorAll("meta")) {
    encoding = meta.getAttribute("charset")?.trim();
    if (
      !encoding &&
      meta.getAttribute("http-equiv")?.toLowerCase() === "content-type"
    )
      encoding = /charset\s*=\s*["']?([^\s;"']+)/i.exec(
        meta.getAttribute("content") ?? "",
      )?.[1];
    if (encoding) break;
  }
  // HTML's meta-based UTF-16 labels describe UTF-8 when there is no UTF-16 BOM.
  if (encoding && /^utf-?16(?:le|be)?$/i.test(encoding)) encoding = "utf-8";
  return decode(bytes, encoding || "utf-8");
}
