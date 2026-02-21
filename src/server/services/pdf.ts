import { PDFDocument } from 'pdf-lib';

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

    // Fit image to A4 with margins (20pt each side)
    const margin = 20;
    const maxWidth = A4_WIDTH - margin * 2;
    const maxHeight = A4_HEIGHT - margin * 2;

    const scaleX = maxWidth / imgWidth;
    const scaleY = maxHeight / imgHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Don't upscale

    const drawWidth = imgWidth * scale;
    const drawHeight = imgHeight * scale;

    // Center on page
    const x = (A4_WIDTH - drawWidth) / 2;
    const y = (A4_HEIGHT - drawHeight) / 2;

    page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
