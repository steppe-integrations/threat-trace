// ============================================================
// pptx-to-pdf — assemble a one-image-per-slide PDF from a pptx
// whose slides are each a single embedded PNG.
//
// The Agentic Defense Evolution deck was authored in NotebookLM
// and the resulting .pptx contains 10 slides, each carrying one
// rendered PNG (no editable text). Extracting the PNGs and
// stacking them into a PDF produces a LinkedIn-friendly document
// upload (LinkedIn renders PDFs as native carousels).
//
// Usage:  npx tsx scripts/pptx-to-pdf.ts <input.pptx> <output.pdf>
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";

interface ZipEntry {
  name: string;
  data: Buffer;
}

// Minimal zip reader — pptx is a zip archive. The PNGs inside are
// stored uncompressed or DEFLATE-compressed. We only need to read
// the central directory to find media/image*.png entries and
// inflate them. Avoids pulling in a full zip library for one task.
function readZipEntries(buf: Buffer): ZipEntry[] {
  // Find end-of-central-directory record (EOCD). It's at most 22
  // bytes from the end if there's no zip comment.
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("EOCD not found — not a zip?");

  const cdEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error(`bad central directory header at ${p}`);
    }
    const compMethod = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf-8");
    p += 46 + nameLen + extraLen + commentLen;

    // Read local file header to find the actual data offset.
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`bad local file header at ${localOffset}`);
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buf.slice(dataOffset, dataOffset + compSize);

    let data: Buffer;
    if (compMethod === 0) {
      data = compressed;
    } else if (compMethod === 8) {
      data = zlib.inflateRawSync(compressed);
    } else {
      throw new Error(
        `unsupported zip compression method ${compMethod} for ${name}`,
      );
    }
    entries.push({ name, data });
  }
  return entries;
}

async function main(): Promise<void> {
  const inPath = process.argv[2];
  const outPath = process.argv[3];
  if (!inPath || !outPath) {
    console.error(
      "usage: tsx scripts/pptx-to-pdf.ts <input.pptx> <output.pdf>",
    );
    process.exit(1);
  }

  const pptxBuf = readFileSync(inPath);
  const entries = readZipEntries(pptxBuf);

  // Match ppt/media/image1.png, image2.png, ... and sort by their
  // numeric suffix so slide-N's image is the N-th page in the PDF.
  const imageEntries = entries
    .filter((e) => /^ppt\/media\/image\d+\.png$/i.test(e.name))
    .sort((a, b) => {
      const an = parseInt(/image(\d+)\.png/.exec(a.name)![1]!, 10);
      const bn = parseInt(/image(\d+)\.png/.exec(b.name)![1]!, 10);
      return an - bn;
    });

  if (imageEntries.length === 0) {
    throw new Error(
      "No ppt/media/image*.png entries found. This script assumes one PNG per slide.",
    );
  }
  console.log(`[pptx-to-pdf] found ${imageEntries.length} slide images`);

  const pdf = await PDFDocument.create();
  for (let i = 0; i < imageEntries.length; i++) {
    const entry = imageEntries[i]!;
    const img = await pdf.embedPng(entry.data);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    console.log(
      `  page ${i + 1}: ${entry.name}  (${img.width}x${img.height})`,
    );
  }

  const pdfBytes = await pdf.save();
  writeFileSync(outPath, pdfBytes);
  console.log(
    `[ok] wrote ${outPath}  (${(pdfBytes.length / 1024).toFixed(1)} KB)`,
  );
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
