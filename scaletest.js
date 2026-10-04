/* One-page scale test: prints a 100 mm square and a 150 mm ruler so you can measure what the printer really did. */
(function (root) {
  'use strict';
  const MM = 72 / 25.4;

  async function build(PDFLib, paper) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const [W, H] = [Math.min(...paper), Math.max(...paper)];
    const page = doc.addPage([W, H]);
    const black = rgb(0, 0, 0);
    const grey = rgb(0.4, 0.4, 0.4);
    const left = 20 * MM;
    const top = H - 18 * MM;

    page.drawText('Print Desk scale test', { x: left, y: top - 14, size: 18, font: bold });
    page.drawText(`Page size in this file: ${Math.round(W / MM)} × ${Math.round(H / MM)} mm`, { x: left, y: top - 30, size: 9, font, color: grey });

    const sq = 100 * MM;
    const sy = top - 40 * MM - sq;
    page.drawRectangle({ x: left, y: sy, width: sq, height: sq, borderColor: black, borderWidth: 1, opacity: 0, borderOpacity: 1 });
    page.drawText('This square is 100 × 100 mm', { x: left + 6, y: sy + sq / 2, size: 10, font: bold });

    // 150 mm ruler under the square
    const ry = sy - 14 * MM;
    page.drawLine({ start: { x: left, y: ry }, end: { x: left + 150 * MM, y: ry }, thickness: 1, color: black });
    for (let mm = 0; mm <= 150; mm += 10) {
      const x = left + mm * MM;
      page.drawLine({ start: { x, y: ry }, end: { x, y: ry - (mm % 50 === 0 ? 8 : 5) }, thickness: 0.8, color: black });
      page.drawText(String(mm), { x: x - font.widthOfTextAtSize(String(mm), 7) / 2, y: ry - 17, size: 7, font });
    }
    page.drawText('mm', { x: left + 152 * MM, y: ry - 3, size: 7, font, color: grey });

    const lines = [
      'Measure the square with a ruler. Both sides should be exactly 100 mm.',
      'If they are smaller or larger, the print dialog or printer changed the scale.',
      '',
      'Check in the print dialog:',
      '  1. Paper size is the same as above (A4 for an A4 file).',
      '  2. Scale is 100% or "Actual size". Not "Fit to page", "Fit to',
      '     printable area" or "Shrink to fit".',
      '  3. Margins: Default or None. Borderless off, unless you chose it.',
      '  4. In the Epson dialog, turn off "Reduce/Enlarge" and "Fit to page".',
      '',
      'Then tell me what the square measures. If it is always the same',
      'amount off, I can correct for it.',
    ];
    let y = ry - 14 * MM;
    for (const l of lines) { page.drawText(l, { x: left, y, size: 9, font }); y -= 12.5; }
    doc.setTitle('Print Desk scale test');
    return doc.save();
  }

  async function open(PDFLib, paper) {
    const win = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(new Blob([await build(PDFLib, paper)], { type: 'application/pdf' }));
      if (win) win.location = url; else window.location = url;
    } catch (e) { if (win) win.close(); throw e; }
  }

  root.PrintTest = { build, open };
})(window);
