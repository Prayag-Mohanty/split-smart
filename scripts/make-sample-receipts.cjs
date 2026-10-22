/**
 * Renders synthetic test receipts (clean, faded thermal, rotated, no-total) to samples/.
 * Usage: node scripts/make-sample-receipts.cjs   (needs Playwright with Chromium installed)
 */
const path = require('path');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')));
}

const receipt = ({ title, lines, faded = false, width = 420 }) => `
<html><body style="margin:0;background:#cfc8bd;padding:30px;display:inline-block">
<div style="width:${width}px;background:${faded ? '#f4efe4' : '#fff'};padding:26px 22px;font:17px/1.45 'Courier New',monospace;
  color:${faded ? '#8a857c' : '#111'};${faded ? 'filter:blur(0.5px);' : ''}box-shadow:0 2px 8px #0003">
<div style="text-align:center;font-weight:bold;font-size:20px">${title}</div>
${lines.map((l) => (l === '---' ? '<div>' + '-'.repeat(36) + '</div>' : `<div style="white-space:pre">${l}</div>`)).join('\n')}
</div></body></html>`;

const pad = (l, r, w = 36) => l + ' '.repeat(Math.max(1, w - l.length - r.length)) + r;

const canteen = [
  '<div style="text-align:center">Near Library, BITS Goa</div>',
  '<div style="text-align:center">GSTIN: 30ABCDE1234F1Z5</div>',
  '<div style="text-align:center">Ph: 9876543210</div>',
  '---',
  pad('Bill No: 1042', '21/10/2026'),
  '---',
  pad('Item         Qty Rate', 'Amt'),
  pad('Large Pizza   1  400.00', '400.00'),
  pad('Maggi         1   60.00', '60.00'),
  pad('Maggi         1   60.00', '60.00'),
  pad('Maggi         1   60.00', '60.00'),
  pad('Cold Coffee   1  220.00', '220.00'),
  '---',
  pad('Sub Total', '800.00'),
  pad('CGST @ 2.5%', '20.00'),
  pad('SGST @ 2.5%', '20.00'),
  '---',
  '<b>' + pad('Grand Total', '840.00') + '</b>',
  pad('Cash', '1000.00'),
  pad('Change', '160.00'),
  '---',
  '<div style="text-align:center">Thank you! Visit again</div>',
];

const grocery = [
  '<div style="text-align:center">Panjim, Goa</div>',
  '---',
  pad('Amul Milk 1L  2', '132.00'),
  pad('Bread', '45.00'),
  pad('Eggs (12)', '84.00'),
  pad('Maggi Noodles x4', '56.00'),
  pad('Surf Excel 1kg', '210.00'),
  '---',
  pad('Discount', '-27.00'),
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  const shots = [
    { file: 'restaurant-clear.png', html: receipt({ title: 'NIGHT CANTEEN - BH4', lines: canteen }) },
    { file: 'canteen-faded.png', html: receipt({ title: 'NIGHT CANTEEN - BH4', lines: canteen, faded: true }) },
    { file: 'grocery-no-total.png', html: receipt({ title: 'GOA FRESH MART', lines: grocery }) },
  ];
  for (const s of shots) {
    await page.setContent(s.html);
    const el = await page.$('body');
    await el.screenshot({ path: path.join(__dirname, '..', 'samples', s.file) });
  }
  // Rotated 90° version of the clear bill.
  await page.setContent(
    `<html><body style="margin:0;display:inline-block"><img id=i src="data:image/png;base64,${require('fs')
      .readFileSync(path.join(__dirname, '..', 'samples', 'restaurant-clear.png'))
      .toString('base64')}" style="display:block"></body></html>`,
  );
  const dims = await page.$eval('#i', (i) => [i.naturalWidth, i.naturalHeight]);
  await page.setContent(`<html><body style="margin:0"><canvas id=c width=${dims[1]} height=${dims[0]}></canvas><script>
    const img=new Image();img.onload=()=>{const c=document.getElementById('c').getContext('2d');c.translate(${dims[1]},0);c.rotate(Math.PI/2);c.drawImage(img,0,0);document.title='ok'};
    img.src="data:image/png;base64,${require('fs')
      .readFileSync(path.join(__dirname, '..', 'samples', 'restaurant-clear.png'))
      .toString('base64')}";</script></body></html>`);
  await page.waitForFunction(() => document.title === 'ok');
  const data = await page.$eval('#c', (c) => c.toDataURL('image/png').split(',')[1]);
  require('fs').writeFileSync(path.join(__dirname, '..', 'samples', 'restaurant-rotated.png'), Buffer.from(data, 'base64'));
  await browser.close();
  console.log('Wrote samples/*.png');
})();
