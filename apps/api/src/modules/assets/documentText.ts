import { inflateRawSync, inflateSync } from "node:zlib";

export type BrandDocumentTextKind = "docx" | "pdf" | "pptx" | "text";
export type BrandDocumentTextStatus = "empty" | "extracted" | "failed" | "unsupported";

export interface BrandDocumentTextResult {
  characterCount: number;
  kind?: BrandDocumentTextKind;
  status: BrandDocumentTextStatus;
  text?: string;
  errorMessage?: string;
}

const maxExtractedCharacters = 12_000;

const docxMime =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pptxMime =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const normalizeMimeType = (mimeType?: string): string =>
  mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";

const extensionFromName = (name: string): string | undefined =>
  name.match(/\.([a-z0-9]{1,12})$/i)?.[1]?.toLowerCase();

const detectKind = (mimeType: string | undefined, name: string): BrandDocumentTextKind | undefined => {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const extension = extensionFromName(name);

  if (
    normalizedMimeType === "text/plain" ||
    normalizedMimeType === "text/markdown" ||
    extension === "txt" ||
    extension === "md" ||
    extension === "markdown"
  ) {
    return "text";
  }
  if (normalizedMimeType === docxMime || extension === "docx") {
    return "docx";
  }
  if (normalizedMimeType === pptxMime || extension === "pptx") {
    return "pptx";
  }
  if (normalizedMimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  return undefined;
};

const decodeXmlEntities = (value: string): string =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );

const compactText = (value: string): string =>
  value
    .split(String.fromCharCode(0))
    .join("")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim()
    .slice(0, maxExtractedCharacters);

const textFromXml = (xml: string): string =>
  compactText(
    decodeXmlEntities(
      xml
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " "),
    ),
  );

interface ZipEntry {
  name: string;
  body: Buffer;
}

const inflateZipEntry = (body: Buffer, compressionMethod: number): Buffer | undefined => {
  if (compressionMethod === 0) {
    return body;
  }
  if (compressionMethod === 8) {
    return inflateRawSync(body);
  }
  return undefined;
};

const readLocalZipEntries = (archive: Buffer): ZipEntry[] => {
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset + 30 <= archive.length) {
    const signature = archive.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const flags = archive.readUInt16LE(offset + 6);
    const compressionMethod = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const fileNameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const bodyStart = nameStart + fileNameLength + extraLength;
    const bodyEnd = bodyStart + compressedSize;

    if (bodyEnd > archive.length || (flags & 0x08) !== 0) {
      break;
    }

    const name = archive.subarray(nameStart, nameStart + fileNameLength).toString("utf8");
    const inflated = inflateZipEntry(archive.subarray(bodyStart, bodyEnd), compressionMethod);
    if (inflated) {
      entries.push({ name, body: inflated });
    }
    offset = bodyEnd;
  }

  return entries;
};

const extractOpenXmlText = (archive: Buffer, kind: "docx" | "pptx"): string => {
  const entries = readLocalZipEntries(archive);
  const xmlEntries = entries.filter((entry) => {
    const name = entry.name.toLowerCase();
    if (kind === "docx") {
      return (
        name === "word/document.xml" ||
        name.startsWith("word/header") ||
        name.startsWith("word/footer")
      );
    }
    return /^ppt\/slides\/slide\d+\.xml$/.test(name);
  });

  return compactText(xmlEntries.map((entry) => textFromXml(entry.body.toString("utf8"))).join("\n"));
};

const decodePdfLiteral = (value: string): string =>
  value.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_match, escaped: string) => {
    if (/^[0-7]+$/.test(escaped)) {
      return String.fromCharCode(Number.parseInt(escaped, 8));
    }
    const replacements: Record<string, string> = {
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      "(": "(",
      ")": ")",
      "\\": "\\",
    };
    return replacements[escaped] ?? escaped;
  });

const decodePdfHex = (value: string): string => {
  const hex = value.replace(/\s+/g, "");
  const bytes: number[] = [];
  for (let index = 0; index + 1 < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  return Buffer.from(bytes).toString("utf8");
};

const extractPdfStreams = (source: Buffer): string[] => {
  const latin = source.toString("latin1");
  const streams: string[] = [latin];
  const streamPattern = /<<(.*?)>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamPattern.exec(latin))) {
    const dictionary = match[1] ?? "";
    const body = Buffer.from(match[2] ?? "", "latin1");
    if (!/FlateDecode/.test(dictionary)) {
      streams.push(body.toString("latin1"));
      continue;
    }

    try {
      streams.push(inflateSync(body).toString("latin1"));
    } catch {
      try {
        streams.push(inflateRawSync(body).toString("latin1"));
      } catch {
        // Ignore compressed streams that cannot be decoded by the lightweight parser.
      }
    }
  }

  return streams;
};

const extractPdfText = (source: Buffer): string => {
  const chunks: string[] = [];
  const pdfText = extractPdfStreams(source).join("\n");

  for (const match of pdfText.matchAll(/\((?:\\.|[^\\)])+\)\s*T[Jj]?/g)) {
    const literal = match[0].replace(/\)\s*T[Jj]?$/, "").replace(/^\(/, "");
    chunks.push(decodePdfLiteral(literal));
  }
  for (const match of pdfText.matchAll(/<([0-9a-fA-F\s]{4,})>\s*T[Jj]?/g)) {
    chunks.push(decodePdfHex(match[1] ?? ""));
  }

  if (chunks.length === 0) {
    for (const match of pdfText.matchAll(/\((?:\\.|[^\\)]){3,}\)/g)) {
      chunks.push(decodePdfLiteral(match[0].slice(1, -1)));
    }
  }

  return compactText(chunks.join("\n"));
};

export const extractBrandDocumentText = async ({
  body,
  mimeType,
  name,
}: {
  body: Buffer;
  mimeType?: string;
  name: string;
}): Promise<BrandDocumentTextResult> => {
  const kind = detectKind(mimeType, name);
  if (!kind) {
    return {
      characterCount: 0,
      status: "unsupported",
    };
  }

  try {
    const text =
      kind === "text"
        ? compactText(body.toString("utf8"))
        : kind === "docx" || kind === "pptx"
          ? extractOpenXmlText(body, kind)
          : extractPdfText(body);

    if (!text) {
      return {
        characterCount: 0,
        kind,
        status: "empty",
      };
    }

    return {
      characterCount: text.length,
      kind,
      status: "extracted",
      text,
    };
  } catch (error) {
    return {
      characterCount: 0,
      errorMessage: error instanceof Error ? error.message : "Document text extraction failed.",
      kind,
      status: "failed",
    };
  }
};
