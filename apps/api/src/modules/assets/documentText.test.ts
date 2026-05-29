import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { extractBrandDocumentText } from "./documentText.js";

const docxMime =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pptxMime =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const makeHeader = (size: number): Buffer => {
  const buffer = Buffer.alloc(size);
  return buffer;
};

const createZip = (entries: Array<{ name: string; content: string }>): Buffer => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const source = Buffer.from(entry.content, "utf8");
    const compressed = deflateRawSync(source);

    const local = makeHeader(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(source.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);

    const central = makeHeader(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(source.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = makeHeader(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDirectory, end]);
};

describe("brand document text extraction", () => {
  it("extracts plain text brand documents", async () => {
    const extracted = await extractBrandDocumentText({
      body: Buffer.from("# Brand Voice\nUse warm premium wording.", "utf8"),
      mimeType: "text/markdown",
      name: "brand-guide.md",
    });

    expect(extracted).toMatchObject({
      kind: "text",
      status: "extracted",
    });
    expect(extracted?.text).toContain("Use warm premium wording.");
  });

  it("extracts docx document body text", async () => {
    const extracted = await extractBrandDocumentText({
      body: createZip([
        {
          name: "word/document.xml",
          content:
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Keep the brand tone calm and premium.</w:t></w:r></w:p></w:body></w:document>',
        },
      ]),
      mimeType: docxMime,
      name: "brand-guide.docx",
    });

    expect(extracted).toMatchObject({
      kind: "docx",
      status: "extracted",
    });
    expect(extracted?.text).toContain("Keep the brand tone calm and premium.");
  });

  it("extracts pptx slide text", async () => {
    const extracted = await extractBrandDocumentText({
      body: createZip([
        {
          name: "ppt/slides/slide1.xml",
          content:
            '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><a:t>Visual style: clean studio lighting.</a:t></p:cSld></p:sld>',
        },
      ]),
      mimeType: pptxMime,
      name: "brand-story.pptx",
    });

    expect(extracted).toMatchObject({
      kind: "pptx",
      status: "extracted",
    });
    expect(extracted?.text).toContain("Visual style: clean studio lighting.");
  });

  it("extracts readable text from simple pdf content streams", async () => {
    const extracted = await extractBrandDocumentText({
      body: Buffer.from(
        [
          "%PDF-1.4",
          "1 0 obj << /Type /Page /Contents 2 0 R >> endobj",
          "2 0 obj << /Length 45 >> stream",
          "BT (Use concise trustworthy claims.) Tj ET",
          "endstream endobj",
          "%%EOF",
        ].join("\n"),
        "latin1",
      ),
      mimeType: "application/pdf",
      name: "brand-claims.pdf",
    });

    expect(extracted).toMatchObject({
      kind: "pdf",
      status: "extracted",
    });
    expect(extracted?.text).toContain("Use concise trustworthy claims.");
  });
});
