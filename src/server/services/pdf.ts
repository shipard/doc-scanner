import { PDFDocument, degrees } from 'pdf-lib';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

export async function generatePdf(photos: Buffer[]): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();

  for (const photoBuffer of photos) {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

    let image;
    try {
      // Try JPEG first, then PNG
      const header = photoBuffer.slice(0, 4);
      if (header[0] === 0xff && header[1] === 0xd8) {
        image = await pdfDoc.embedJpg(photoBuffer);
      } else if (header[0] === 0x89 && header[1] === 0x50) {
        image = await pdfDoc.embedPng(photoBuffer);
      } else {
        // Try JPEG as default
        image = await pdfDoc.embedJpg(photoBuffer);
      }
    } catch {
      // Fallback: try PNG
      image = await pdfDoc.embedPng(photoBuffer);
    }

    const { width: imgWidth, height: imgHeight } = image;

    const margin = 20;
    const maxWidth = A4_WIDTH - margin * 2;
    const maxHeight = A4_HEIGHT - margin * 2;

    if (imgWidth > imgHeight) {
      // Landscape image → rotate 90° CCW so it fills the portrait page
      // After rotation: visual width = imgHeight * scale, visual height = imgWidth * scale
      const scale = Math.min(maxWidth / imgHeight, maxHeight / imgWidth, 1);
      const drawW = imgWidth * scale;  // passed as 'width' → becomes visual height after rotation
      const drawH = imgHeight * scale; // passed as 'height' → becomes visual width after rotation
      // Pivot is bottom-left of pre-rotation rect; after 90° CCW:
      //   x range: [x - drawH, x], y range: [y, y + drawW]
      const x = A4_WIDTH / 2 - drawH / 2;
      const y = A4_HEIGHT / 2 + drawW / 2;
      page.drawImage(image, { x, y, width: drawW, height: drawH, rotate: degrees(270) });
    } else {
      // Portrait (or square) image → normal placement
      const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);
      const drawWidth = imgWidth * scale;
      const drawHeight = imgHeight * scale;
      const x = (A4_WIDTH - drawWidth) / 2;
      const y = (A4_HEIGHT - drawHeight) / 2;
      page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
