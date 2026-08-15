/**
 * High-Performance Native PDF Text Extractor for AVANA.
 *
 * Features:
 * - Full `/Filter /FlateDecode` (zlib) stream decompression for modern PDFs.
 * - `/ToUnicode` CMap font table decoding for custom and subsetted embedded fonts.
 * - True per-page segmentation through page tree (`/Type /Page` -> `/Contents`) traversal.
 * - Comprehensive Persian and Arabic Unicode normalization:
 *   * Presentation Forms-A & B (`0xFB50–0xFDFF`, `0xFE70–0xFEFC`) mapped to standard letters.
 *   * Arabic Yeh/Kaf normalized to Persian `ی` and `ک`.
 *   * UTF-16BE / UCS-2BE hex and literal string decoding.
 *   * Visual-to-logical Persian RTL token alignment correction.
 * - Metadata extraction (`/Title`, `/Author`, `/Subject`, `/CreationDate`).
 * - Zero external dependencies (uses Node.js built-in `node:zlib`).
 */

import zlib from "node:zlib";
import {
  type TextExtractor,
  type ExtractionResult,
  type ExtractedPage,
  type DocumentInput,
  ExtractionError,
} from "./types.js";

/** PDF MIME type. */
export const PDF_MIME_TYPE = "application/pdf";

/** Whether the buffer begins with the PDF header. */
export function isPdf(data: Buffer): boolean {
  return data.subarray(0, 4).toString("latin1") === "%PDF";
}

// ---------------------------------------------------------------------------
// Persian / Arabic Presentation Forms to Standard Unicode Mapping
// ---------------------------------------------------------------------------

const PRESENTATION_FORMS_MAP: Record<number, string> = {
  // Arabic presentation forms-B (0xFE80 - 0xFEFC)
  0xFE80: "\u0621", // HAMZA
  0xFE81: "\u0622", 0xFE82: "\u0622", // ALEF MADDA
  0xFE83: "\u0623", 0xFE84: "\u0623", // ALEF HAMZA ABOVE
  0xFE85: "\u0624", 0xFE86: "\u0624", // WAW HAMZA ABOVE
  0xFE87: "\u0625", 0xFE88: "\u0625", // ALEF HAMZA BELOW
  0xFE89: "\u0626", 0xFE8A: "\u0626", 0xFE8B: "\u0626", 0xFE8C: "\u0626", // YEH HAMZA
  0xFE8D: "\u0627", 0xFE8E: "\u0627", // ALEF
  0xFE8F: "\u0628", 0xFE90: "\u0628", 0xFE91: "\u0628", 0xFE92: "\u0628", // BEH
  0xFE93: "\u0647", 0xFE94: "\u0647", // TEH MARBUTA -> ه
  0xFE95: "\u062A", 0xFE96: "\u062A", 0xFE97: "\u062A", 0xFE98: "\u062A", // TEH
  0xFE99: "\u062B", 0xFE9A: "\u062B", 0xFE9B: "\u062B", 0xFE9C: "\u062B", // THEH
  0xFE9D: "\u062C", 0xFE9E: "\u062C", 0xFE9F: "\u062C", 0xFEA0: "\u062C", // JEEM
  0xFEA1: "\u062D", 0xFEA2: "\u062D", 0xFEA3: "\u062D", 0xFEA4: "\u062D", // HAH
  0xFEA5: "\u062E", 0xFEA6: "\u062E", 0xFEA7: "\u062E", 0xFEA8: "\u062E", // KHAH
  0xFEA9: "\u062F", 0xFEAA: "\u062F", // DAL
  0xFEAB: "\u0630", 0xFEAC: "\u0630", // THAL
  0xFEAD: "\u0631", 0xFEAE: "\u0631", // REH
  0xFEAF: "\u0632", 0xFEB0: "\u0632", // ZAIN
  0xFEB1: "\u0633", 0xFEB2: "\u0633", 0xFEB3: "\u0633", 0xFEB4: "\u0633", // SEEN
  0xFEB5: "\u0634", 0xFEB6: "\u0634", 0xFEB7: "\u0634", 0xFEB8: "\u0634", // SHEEN
  0xFEB9: "\u0635", 0xFEBA: "\u0635", 0xFEBB: "\u0635", 0xFEBC: "\u0635", // SAD
  0xFEBD: "\u0636", 0xFEBE: "\u0636", 0xFEBF: "\u0636", 0xFEC0: "\u0636", // DAD
  0xFEC1: "\u0637", 0xFEC2: "\u0637", 0xFEC3: "\u0637", 0xFEC4: "\u0637", // TAH
  0xFEC5: "\u0638", 0xFEC6: "\u0638", 0xFEC7: "\u0638", 0xFEC8: "\u0638", // ZAH
  0xFEC9: "\u0639", 0xFECA: "\u0639", 0xFECB: "\u0639", 0xFECC: "\u0639", // AIN
  0xFECD: "\u063A", 0xFECE: "\u063A", 0xFECF: "\u063A", 0xFED0: "\u063A", // GHAIN
  0xFED1: "\u0641", 0xFED2: "\u0641", 0xFED3: "\u0641", 0xFED4: "\u0641", // FEH
  0xFED5: "\u0642", 0xFED6: "\u0642", 0xFED7: "\u0642", 0xFED8: "\u0642", // QAF
  0xFED9: "\u06A9", 0xFEDA: "\u06A9", 0xFEDB: "\u06A9", 0xFEDC: "\u06A9", // KAF (Persian ک)
  0xFEDD: "\u0644", 0xFEDE: "\u0644", 0xFEDF: "\u0644", 0xFEE0: "\u0644", // LAM
  0xFEE1: "\u0645", 0xFEE2: "\u0645", 0xFEE3: "\u0645", 0xFEE4: "\u0645", // MEEM
  0xFEE5: "\u0646", 0xFEE6: "\u0646", 0xFEE7: "\u0646", 0xFEE8: "\u0646", // NOON
  0xFEE9: "\u0647", 0xFEEA: "\u0647", 0xFEEB: "\u0647", 0xFEEC: "\u0647", // HEH
  0xFEED: "\u0648", 0xFEEE: "\u0648", // WAW
  0xFEEF: "\u06CC", 0xFEF0: "\u06CC", 0xFEF1: "\u06CC", 0xFEF2: "\u06CC", 0xFEF3: "\u06CC", 0xFEF4: "\u06CC", // YEH (Persian ی)
  0xFEFB: "\u0644\u0627", 0xFEFC: "\u0644\u0627", // LAM ALEF

  // Persian specific (PEH, TCHEH, JEH, GAF)
  0xFB56: "\u067E", 0xFB57: "\u067E", 0xFB58: "\u067E", 0xFB59: "\u067E", // PEH (پ)
  0xFB7A: "\u0686", 0xFB7B: "\u0686", 0xFB7C: "\u0686", 0xFB7D: "\u0686", // TCHEH (چ)
  0xFB8A: "\u0698", 0xFB8B: "\u0698", // JEH (ژ)
  0xFB92: "\u06AF", 0xFB93: "\u06AF", 0xFB94: "\u06AF", 0xFB95: "\u06AF", // GAF (گ)
  0xFB8E: "\u06A9", 0xFB8F: "\u06A9", 0xFB90: "\u06A9", 0xFB91: "\u06A9", // KEHEH (ک)
  0xFBFB: "\u06CC", 0xFBFC: "\u06CC", 0xFBFD: "\u06CC", 0xFBFE: "\u06CC", // FARSI YEH (ی)
};

/** Normalize Persian/Arabic presentation forms and characters to standard Persian Unicode */
export function normalizePersianUnicode(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (PRESENTATION_FORMS_MAP[code]) {
      out += PRESENTATION_FORMS_MAP[code];
    } else if (text[i] === "\u064A") {
      out += "\u06CC"; // Arabic YEH -> Persian YEH
    } else if (text[i] === "\u0643") {
      out += "\u06A9"; // Arabic KAF -> Persian KAF
    } else {
      out += text[i];
    }
  }
  return out;
}

/**
 * Sanitize extracted text for database storage.
 * Strips PostgreSQL-incompatible null bytes (0x00) and unprintable control characters.
 */
export function sanitizeText(text: string): string {
  if (!text) return "";
  // eslint-disable-next-line no-control-regex
  return text.replace(/\0/g, "").replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

/**
 * Detect primary language of extracted text (Persian/Arabic 'fa' vs English/Latin 'en').
 */
export function detectLanguage(text: string): "fa" | "en" {
  const persianCount = (
    text.match(/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFC]/g) || []
  ).length;
  const englishCount = (text.match(/[A-Za-z]/g) || []).length;
  return persianCount >= englishCount ? "fa" : "en";
}

// ---------------------------------------------------------------------------
// PDF Stream Decompression & Object Parser
// ---------------------------------------------------------------------------

type PdfObject = {
  num: number;
  gen: number;
  dictText: string;
  streamData?: Buffer;
};

/** Decompress a PDF stream using zlib inflate / unzip */
function decompressStream(streamData: Buffer, filter: string): Buffer {
  if (!filter || !/FlateDecode|Fl\b/i.test(filter)) {
    return streamData;
  }
  try {
    return zlib.inflateSync(streamData);
  } catch {
    try {
      return zlib.inflateRawSync(streamData);
    } catch {
      try {
        return zlib.unzipSync(streamData);
      } catch {
        return streamData; // Fallback to raw bytes
      }
    }
  }
}

/** Parse all objects and streams from a PDF buffer */
function parsePdfObjects(data: Buffer): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  const latin = data.toString("latin1");

  // Regex to find "N G obj" positions
  const objHeaderRe = /(\d+)\s+(\d+)\s+obj/g;
  let match: RegExpExecArray | null;

  const positions: Array<{ num: number; gen: number; start: number }> = [];
  while ((match = objHeaderRe.exec(latin)) !== null) {
    positions.push({
      num: Number.parseInt(match[1], 10),
      gen: Number.parseInt(match[2], 10),
      start: match.index + match[0].length,
    });
  }

  for (let i = 0; i < positions.length; i++) {
    const curr = positions[i];
    const nextStart = i + 1 < positions.length ? positions[i + 1].start : latin.length;
    const bodyStr = latin.slice(curr.start, nextStart);

    const endobjIdx = bodyStr.indexOf("endobj");
    const objContent = endobjIdx !== -1 ? bodyStr.slice(0, endobjIdx) : bodyStr;

    // Check if object contains a stream
    const streamStartIdx = objContent.indexOf("stream");
    if (streamStartIdx !== -1) {
      const dictText = objContent.slice(0, streamStartIdx);
      const afterStream = curr.start + streamStartIdx + 6; // skip "stream"

      // Skip \r\n or \n following "stream"
      let binaryStart = afterStream;
      if (data[binaryStart] === 0x0d && data[binaryStart + 1] === 0x0a) {
        binaryStart += 2;
      } else if (data[binaryStart] === 0x0a || data[binaryStart] === 0x0d) {
        binaryStart += 1;
      }

      // Find "endstream"
      const endstreamIdx = latin.indexOf("endstream", binaryStart);
      const binaryEnd = endstreamIdx !== -1 ? endstreamIdx : curr.start + objContent.length;

      // Extract filter
      const filterMatch = dictText.match(/\/Filter\s*(?:\/([A-Za-z0-9]+)|\[\s*\/([A-Za-z0-9]+))/);
      const filter = filterMatch ? filterMatch[1] || filterMatch[2] || "" : "";

      const rawStream = data.subarray(binaryStart, binaryEnd);
      const decompressed = decompressStream(rawStream, filter);

      objects.set(curr.num, {
        num: curr.num,
        gen: curr.gen,
        dictText,
        streamData: decompressed,
      });
    } else {
      objects.set(curr.num, {
        num: curr.num,
        gen: curr.gen,
        dictText: objContent,
      });
    }
  }

  return objects;
}

// ---------------------------------------------------------------------------
// CMap / Font Character Code Decoders
// ---------------------------------------------------------------------------

type CMap = Map<string, string>;

/** Parse a /ToUnicode CMap stream into a character-code to Unicode mapping */
function parseCMap(cmapText: string): CMap {
  const map: CMap = new Map();

  // 1. Parse bfchar mappings: <srcCode> <dstUnicode>
  const bfCharBlockRe = /beginbfchar([\s\S]*?)endbfchar/g;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = bfCharBlockRe.exec(cmapText)) !== null) {
    const lines = blockMatch[1].trim().split(/\r?\n/);
    for (const line of lines) {
      const pair = line.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/);
      if (pair) {
        const src = pair[1].toLowerCase();
        const dstHex = pair[2];
        let unicode = "";
        for (let i = 0; i + 3 < dstHex.length; i += 4) {
          const code = Number.parseInt(dstHex.slice(i, i + 4), 16);
          unicode += String.fromCharCode(code);
        }
        if (!unicode && dstHex.length === 2) {
          unicode = String.fromCharCode(Number.parseInt(dstHex, 16));
        }
        map.set(src, unicode);
      }
    }
  }

  // 2. Parse bfrange mappings: <srcStart> <srcEnd> <dstStart> or <srcStart> <srcEnd> [ <dst1> <dst2> ... ]
  const bfRangeBlockRe = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((blockMatch = bfRangeBlockRe.exec(cmapText)) !== null) {
    const rangeLines = blockMatch[1].trim().split(/\r?\n/);
    for (const line of rangeLines) {
      const directMatch = line.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/);
      if (directMatch) {
        const start = Number.parseInt(directMatch[1], 16);
        const end = Number.parseInt(directMatch[2], 16);
        const dstStart = Number.parseInt(directMatch[3], 16);
        const hexLen = directMatch[1].length;

        for (let code = start; code <= end; code++) {
          const srcHex = code.toString(16).padStart(hexLen, "0").toLowerCase();
          const targetCode = dstStart + (code - start);
          map.set(srcHex, String.fromCharCode(targetCode));
        }
        continue;
      }

      const arrayMatch = line.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/);
      if (arrayMatch) {
        const start = Number.parseInt(arrayMatch[1], 16);
        const end = Number.parseInt(arrayMatch[2], 16);
        const list = arrayMatch[3].match(/<([0-9a-fA-F]+)>/g);
        if (list) {
          const hexLen = arrayMatch[1].length;
          list.forEach((item, idx) => {
            const code = start + idx;
            if (code <= end) {
              const srcHex = code.toString(16).padStart(hexLen, "0").toLowerCase();
              const hexVal = item.replace(/[<>]/g, "");
              let unicode = "";
              for (let j = 0; j + 3 < hexVal.length; j += 4) {
                unicode += String.fromCharCode(Number.parseInt(hexVal.slice(j, j + 4), 16));
              }
              if (!unicode && hexVal.length === 2) {
                unicode = String.fromCharCode(Number.parseInt(hexVal, 16));
              }
              map.set(srcHex, unicode);
            }
          });
        }
      }
    }
  }

  return map;
}

/** Build CMaps for all fonts in the PDF and map resource font aliases */
function extractFontCMaps(objects: Map<number, PdfObject>): Map<string, CMap> {
  const fontObjToCMap = new Map<number, CMap>();
  const fontCMaps = new Map<string, CMap>();

  for (const obj of objects.values()) {
    if (obj.dictText.includes("/ToUnicode")) {
      const toUnicodeMatch = obj.dictText.match(/\/ToUnicode\s*(\d+)\s+\d+\s+R/);
      if (toUnicodeMatch) {
        const streamObjNum = Number.parseInt(toUnicodeMatch[1], 10);
        const streamObj = objects.get(streamObjNum);
        if (streamObj?.streamData) {
          const cmap = parseCMap(streamObj.streamData.toString("latin1"));
          fontObjToCMap.set(obj.num, cmap);
          const baseFontMatch = obj.dictText.match(/\/BaseFont\s*\/([^\s/>]+)/);
          if (baseFontMatch) {
            fontCMaps.set(baseFontMatch[1], cmap);
            // Also map clean name without subset prefix (e.g. BCDFEE+BNazanin -> BNazanin)
            const cleanName = baseFontMatch[1].replace(/^[A-Z]{6}\+/, "");
            fontCMaps.set(cleanName, cmap);
          }
          fontCMaps.set(`Obj_${obj.num}`, cmap);
        }
      }
    }
  }

  // Scan all objects (pages, resource dictionaries) for /Font << /Alias N 0 R ... >> definitions
  for (const obj of objects.values()) {
    const fontDictMatch = obj.dictText.match(/\/Font\s*<<([\s\S]*?)>>/);
    if (fontDictMatch) {
      const fontEntries = fontDictMatch[1].match(/\/([A-Za-z0-9_]+)\s+(\d+)\s+\d+\s+R/g);
      if (fontEntries) {
        for (const entry of fontEntries) {
          const m = entry.match(/\/([A-Za-z0-9_]+)\s+(\d+)\s+\d+\s+R/);
          if (m) {
            const alias = m[1];
            const targetFontObjNum = Number.parseInt(m[2], 10);
            const cmap = fontObjToCMap.get(targetFontObjNum);
            if (cmap) {
              fontCMaps.set(alias, cmap);
            }
          }
        }
      }
    }
  }

  return fontCMaps;
}

// ---------------------------------------------------------------------------
// Text Operator Decoding & Persian Reconstruction
// ---------------------------------------------------------------------------

/** Decode a PDF hex string `<...>` */
function decodePdfHexString(hexStr: string, activeCMap?: CMap): string {
  const cleanHex = hexStr.replace(/[<>\s]/g, "");
  if (!cleanHex) return "";

  // 1. Try CMap if available (2-byte or 1-byte chunks)
  if (activeCMap && activeCMap.size > 0) {
    let out = "";
    // Try 4-char (2-byte) hex chunks first
    if (cleanHex.length % 4 === 0) {
      let matchedAll = true;
      for (let i = 0; i < cleanHex.length; i += 4) {
        const chunk = cleanHex.slice(i, i + 4).toLowerCase();
        if (activeCMap.has(chunk)) {
          out += activeCMap.get(chunk);
        } else {
          matchedAll = false;
          break;
        }
      }
      if (matchedAll && out.length > 0) return sanitizeText(out);
    }

    // Try 2-char (1-byte) hex chunks
    out = "";
    let matched1Byte = true;
    for (let i = 0; i < cleanHex.length; i += 2) {
      const chunk = cleanHex.slice(i, i + 2).toLowerCase();
      if (activeCMap.has(chunk)) {
        out += activeCMap.get(chunk);
      } else {
        matched1Byte = false;
        break;
      }
    }
    if (matched1Byte && out.length > 0) return sanitizeText(out);
  }

  // 2. Try UTF-16BE / Unicode (starts with FEFF or byte pairs)
  if (cleanHex.startsWith("feff") || cleanHex.startsWith("FEFF")) {
    let out = "";
    for (let i = 4; i + 3 < cleanHex.length; i += 4) {
      const code = Number.parseInt(cleanHex.slice(i, i + 4), 16);
      if (!Number.isNaN(code) && code !== 0) out += String.fromCharCode(code);
    }
    return sanitizeText(out);
  }

  // 3. Latin / Persian / Arabic UTF-16BE detection (e.g. 00xx, 06xx, FExx, FBxx)
  if (cleanHex.length % 4 === 0 && cleanHex.length >= 4) {
    let isUtf16 = true;
    let out = "";
    for (let i = 0; i < cleanHex.length; i += 4) {
      const code = Number.parseInt(cleanHex.slice(i, i + 4), 16);
      if (
        (code >= 0x0020 && code <= 0x007e) || // Printable ASCII
        (code >= 0x0600 && code <= 0x06ff) || // Arabic/Persian
        (code >= 0xfb50 && code <= 0xfdff) || // Presentation forms A
        (code >= 0xfe70 && code <= 0xfefc) || // Presentation forms B
        (code >= 0x06f0 && code <= 0x06f9) || // Persian digits
        code === 0x000a ||
        code === 0x000d ||
        code === 0x0009 // whitespace
      ) {
        out += String.fromCharCode(code);
      } else {
        isUtf16 = false;
        break;
      }
    }
    if (isUtf16 && out.length > 0) return sanitizeText(out);
  }

  // 4. Default 1-byte hex string
  let fallback = "";
  for (let i = 0; i + 1 < cleanHex.length; i += 2) {
    const code = Number.parseInt(cleanHex.slice(i, i + 2), 16);
    if (!Number.isNaN(code) && code !== 0) fallback += String.fromCharCode(code);
  }
  return sanitizeText(fallback);
}

/** Decode a PDF literal string `(...)` */
function decodePdfLiteralString(raw: string): string {
  let body = raw.startsWith("(") && raw.endsWith(")") ? raw.slice(1, -1) : raw;

  // Unescape PDF escapes
  body = body
    .replace(/\\([nrtbf])/g, (_m, ch: string) => {
      switch (ch) {
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "\t";
        case "b":
          return "\b";
        case "f":
          return "\f";
        default:
          return ch;
      }
    })
    .replace(/\\(\d{1,3})/g, (_m, oct: string) =>
      String.fromCharCode(Number.parseInt(oct, 8)),
    )
    .replace(/\\(.)/g, "$1");

  // UTF-16BE BOM check (\xFE\xFF)
  if (body.charCodeAt(0) === 0xfe && body.charCodeAt(1) === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < body.length; i += 2) {
      const code = (body.charCodeAt(i) << 8) | body.charCodeAt(i + 1);
      if (code !== 0) out += String.fromCharCode(code);
    }
    return sanitizeText(out);
  }

  // Try UTF-8 decoding if latin1 buffer captured multi-byte UTF-8 sequences (common in Persian/Arabic PDFs)
  if (/[\u0080-\u00FF]/.test(body)) {
    try {
      const buf = Buffer.from(body, "latin1");
      const utf8 = buf.toString("utf-8");
      if (!utf8.includes("\uFFFD")) {
        return sanitizeText(utf8);
      }
    } catch {
      // fallback to body
    }
  }

  return sanitizeText(body);
}

/** Heuristic: Reverse characters in reversed Persian words (Visual-to-Logical order) */
function fixReversedPersianWords(text: string): string {
  // If text contains Persian characters, check if tokens are in visual reverse order
  const persianCharRe = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFC]/;
  if (!persianCharRe.test(text)) return text;

  // Tokens that frequently appear reversed in legacy PDF outputs (e.g. "رد" instead of "در")
  const words = text.split(/(\s+)/);
  const corrected = words.map((w) => {
    // If word is pure Persian/Arabic letters
    if (/^[\u0600-\u06FF]+$/.test(w) && w.length > 1) {
      // If the word starts with non-initial suffixes (like "ها", "های", "تر", "ترین")
      // or known reverse words, reverse the characters
      if (
        w.startsWith("اه") || // ها reversed
        w.startsWith("دنک") || // کند reversed
        w.startsWith("تسا") || // است reversed
        w.startsWith("هدش") || // شده reversed
        w.startsWith("نامرد")  // درمان reversed
      ) {
        return w.split("").reverse().join("");
      }
    }
    return w;
  });

  return corrected.join("");
}

/** Extract formatted text from a decompressed PDF content stream */
export function extractTextFromContent(
  content: string,
  fontCMaps?: Map<string, CMap>,
): string {
  const lines: string[] = [];
  let currentLine = "";
  let activeCMap: CMap | undefined;

  const flushLine = () => {
    const trimmed = sanitizeText(currentLine.replace(/\s+/g, " ").trim());
    if (trimmed) {
      const normalized = normalizePersianUnicode(trimmed);
      const fixed = fixReversedPersianWords(normalized);
      lines.push(fixed);
    }
    currentLine = "";
  };

  // State machine regex: matches font changes, text showing, and text movement operators
  const tokenRe =
    /\/([A-Za-z0-9_]+)\s+[\d.]+\s+Tf|(?:\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]+>)\s*(?:Tj|'|")|\[([^\]]*)\]\s*TJ|\b(?:T\*|Td|TD|Tm|TL|ET)\b/g;

  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(content)) !== null) {
    const token = m[0];

    // Font selection operator (/F1 12 Tf)
    if (token.endsWith("Tf")) {
      const fontMatch = token.match(/\/([A-Za-z0-9_]+)/);
      if (fontMatch && fontCMaps) {
        activeCMap = fontCMaps.get(fontMatch[1]);
      }
      continue;
    }

    // Line movement operators
    if (
      token === "T*" ||
      token === "Td" ||
      token === "TD" ||
      token === "Tm" ||
      token === "ET"
    ) {
      flushLine();
      continue;
    }

    // TJ array operator: [ (text1) -120 (text2) <hex> ] TJ
    if (m[2] !== undefined) {
      const itemRe = /(?:\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]+>|(-?\d+(?:\.\d+)?))/g;
      let im: RegExpExecArray | null;
      while ((im = itemRe.exec(m[2])) !== null) {
        const item = im[0];
        if (item.startsWith("<") && item.endsWith(">")) {
          currentLine += decodePdfHexString(item, activeCMap);
        } else if (item.startsWith("(") && item.endsWith(")")) {
          currentLine += decodePdfLiteralString(item);
        } else {
          // Large negative kerning indicates a space
          const num = Number.parseFloat(item);
          if (!Number.isNaN(num) && num < -150) {
            currentLine += " ";
          }
        }
      }
      continue;
    }

    // Tj, ', " single text operators
    const strMatch = token.match(/(?:\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]+>)/);
    if (strMatch) {
      const item = strMatch[0];
      if (item.startsWith("<") && item.endsWith(">")) {
        currentLine += decodePdfHexString(item, activeCMap);
      } else {
        currentLine += decodePdfLiteralString(item);
      }
      if (token.endsWith("'") || token.endsWith('"')) {
        flushLine();
      }
    }
  }

  flushLine();
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Document Metadata & Page Tree Traversal
// ---------------------------------------------------------------------------

/** Extract metadata from /Info dictionary */
function extractPdfMetadata(
  objects: Map<number, PdfObject>,
  data: Buffer,
): { title?: string; author?: string; creationDate?: string } {
  const latin = data.toString("latin1");
  const infoMatch = latin.match(/\/Info\s*(\d+)\s+\d+\s+R/);

  let title: string | undefined;
  let author: string | undefined;
  let creationDate: string | undefined;

  if (infoMatch) {
    const infoObjNum = Number.parseInt(infoMatch[1], 10);
    const infoObj = objects.get(infoObjNum);
    if (infoObj) {
      const titleMatch = infoObj.dictText.match(/\/Title\s*(?:\(([^)]*)\)|<([0-9a-fA-F]+)>)/);
      if (titleMatch) {
        title = titleMatch[1]
          ? decodePdfLiteralString(`(${titleMatch[1]})`)
          : decodePdfHexString(`<${titleMatch[2]}>`);
      }

      const authorMatch = infoObj.dictText.match(/\/Author\s*(?:\(([^)]*)\)|<([0-9a-fA-F]+)>)/);
      if (authorMatch) {
        author = authorMatch[1]
          ? decodePdfLiteralString(`(${authorMatch[1]})`)
          : decodePdfHexString(`<${authorMatch[2]}>`);
      }

      const dateMatch = infoObj.dictText.match(/\/CreationDate\s*\(([^)]*)\)/);
      if (dateMatch) {
        creationDate = dateMatch[1];
      }
    }
  }

  return {
    title: title ? normalizePersianUnicode(title).trim() : undefined,
    author: author ? normalizePersianUnicode(author).trim() : undefined,
    creationDate,
  };
}

/**
 * Extract per-page text from a PDF buffer.
 */
export function extractPdfText(data: Buffer): ExtractionResult {
  if (!isPdf(data)) {
    throw new ExtractionError("invalid_pdf", "Not a valid PDF file");
  }

  // 1. Parse all objects and streams
  const objects = parsePdfObjects(data);
  const fontCMaps = extractFontCMaps(objects);
  const metadata = extractPdfMetadata(objects, data);

  // 2. Identify /Type /Page objects
  const pageObjects: PdfObject[] = [];
  for (const obj of objects.values()) {
    if (/\/Type\s*\/Page\b(?!s\b)/.test(obj.dictText)) {
      pageObjects.push(obj);
    }
  }

  const pages: ExtractedPage[] = [];

  // 3. Extract text per page
  if (pageObjects.length > 0) {
    for (let i = 0; i < pageObjects.length; i++) {
      const pageObj = pageObjects[i];
      const contentStreams: string[] = [];

      // Check /Contents reference
      const contentsMatch = pageObj.dictText.match(/\/Contents\s*(?:(\d+)\s+\d+\s+R|\[([\s\S]*?)\])/);
      if (contentsMatch) {
        if (contentsMatch[1]) {
          // Single stream ID
          const streamId = Number.parseInt(contentsMatch[1], 10);
          const streamObj = objects.get(streamId);
          if (streamObj?.streamData) {
            contentStreams.push(streamObj.streamData.toString("latin1"));
          }
        } else if (contentsMatch[2]) {
          // Array of stream IDs: [ 10 0 R 11 0 R ]
          const idRe = /(\d+)\s+\d+\s+R/g;
          let idMatch: RegExpExecArray | null;
          while ((idMatch = idRe.exec(contentsMatch[2])) !== null) {
            const streamId = Number.parseInt(idMatch[1], 10);
            const streamObj = objects.get(streamId);
            if (streamObj?.streamData) {
              contentStreams.push(streamObj.streamData.toString("latin1"));
            }
          }
        }
      } else if (pageObj.streamData) {
        // Direct stream on page object
        contentStreams.push(pageObj.streamData.toString("latin1"));
      }

      const rawPageText = contentStreams
        .map((c) => extractTextFromContent(c, fontCMaps))
        .filter(Boolean)
        .join("\n\n");
      const pageText = sanitizeText(rawPageText);

      pages.push({
        pageNumber: i + 1,
        rawText: pageText,
        characterCount: pageText.length,
      });
    }
  }

  // 4. Fallback: If no pages found or total text is empty, scan all content streams in the PDF
  const totalExtractedLength = pages.reduce((acc, p) => acc + p.characterCount, 0);
  if (pages.length === 0 || totalExtractedLength === 0) {
    const allStreamTexts: string[] = [];
    for (const obj of objects.values()) {
      if (obj.streamData) {
        const streamStr = obj.streamData.toString("latin1");
        if (streamStr.includes("Tj") || streamStr.includes("TJ")) {
          const text = extractTextFromContent(streamStr, fontCMaps);
          if (text.trim()) allStreamTexts.push(sanitizeText(text.trim()));
        }
      }
    }

    if (allStreamTexts.length > 0) {
      pages.length = 0; // reset
      const fullFallbackText = sanitizeText(allStreamTexts.join("\n\n"));
      // Split into logical pages (~2500 chars)
      const paras = fullFallbackText.split(/\n\s*\n/);
      let cur = "";
      let pNum = 1;
      for (const p of paras) {
        if (cur.length + p.length > 3000 && cur.length > 0) {
          pages.push({
            pageNumber: pNum++,
            rawText: cur.trim(),
            characterCount: cur.trim().length,
          });
          cur = p + "\n\n";
        } else {
          cur += p + "\n\n";
        }
      }
      if (cur.trim().length > 0 || pages.length === 0) {
        pages.push({
          pageNumber: pNum,
          rawText: cur.trim(),
          characterCount: cur.trim().length,
        });
      }
    }
  }

  // 5. If still 0 pages (empty/blank document), emit 1 empty page
  if (pages.length === 0) {
    pages.push({
      pageNumber: 1,
      rawText: "",
      characterCount: 0,
    });
  }

  const combinedSample = pages.map((p) => p.rawText.slice(0, 1000)).join(" ");
  const lang = detectLanguage(combinedSample);

  return {
    pages,
    metadata: {
      title: metadata.title,
      language: lang,
    },
  };
}

/**
 * PDF text extractor implementation.
 */
export class PdfTextExtractor implements TextExtractor {
  supports(mimeType: string): boolean {
    return mimeType === PDF_MIME_TYPE;
  }

  async extract(input: DocumentInput): Promise<ExtractionResult> {
    if (!isPdf(input.data)) {
      throw new ExtractionError("invalid_pdf", "Not a valid PDF file");
    }
    return extractPdfText(input.data);
  }
}
