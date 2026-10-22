/**
 * A shareable "bill card" image: the receipt split, each person's share and a UPI QR to pay
 * the payer, drawn on a canvas so it can go straight into a WhatsApp group.
 */
import { formatINR, type Paise } from '../lib/money';
import type { Member } from '../lib/types';
import { buildUpiLink } from '../lib/upi';
import { qrDataUrl } from './qr';

export interface BillCardInput {
  title: string;
  date: string;
  groupName: string;
  total: Paise;
  payer: Member;
  shares: { member: Member; amount: Paise; label: string }[];
}

const W = 1080;
const PAD = 64;
const ROW = 190;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Trim text with an ellipsis so it fits in `maxWidth` pixels at the current font. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function renderBillCard(input: BillCardInput): Promise<Blob> {
  const debtors = input.shares.filter((s) => s.member.id !== input.payer.id && s.amount > 0);
  const others = input.shares.filter((s) => !debtors.includes(s));
  const H = 420 + debtors.length * ROW + others.length * 90 + 140;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const font = (size: number, weight = 400) => `${weight} ${size}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;

  // Background + header band
  ctx.fillStyle = '#f4f6f8';
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, W, 300);
  grad.addColorStop(0, '#0f766e');
  grad.addColorStop(1, '#134e4a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 320);
  ctx.fillStyle = '#ccfbf1';
  ctx.font = font(30, 600);
  ctx.fillText(`SplitSmart · ${input.groupName}`, PAD, 80);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(56, 800);
  ctx.fillText(input.title.slice(0, 28), PAD, 160);
  ctx.font = font(84, 800);
  ctx.fillText(formatINR(input.total), PAD, 262);
  ctx.font = font(30, 500);
  ctx.fillStyle = '#ccfbf1';
  ctx.textAlign = 'right';
  ctx.fillText(`${input.date} · paid by ${input.payer.name}`, W - PAD, 262);
  ctx.textAlign = 'left';

  let y = 360;
  const avatar = (m: Member, cx: number, cy: number, r: number) => {
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = font(r, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initials =
      m.emoji ||
      m.name
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
    ctx.fillText(initials, cx, cy + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  for (const s of debtors) {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, PAD - 16, y, W - 2 * PAD + 32, ROW - 20, 28);
    ctx.fill();
    avatar(s.member, PAD + 44, y + 85, 40);
    ctx.fillStyle = '#0f1720';
    ctx.font = font(40, 700);
    ctx.fillText(s.member.name, PAD + 110, y + 75);
    const hasQr = !!input.payer.upiId;
    ctx.font = font(48, 800);
    const amountLeft = W - PAD - (hasQr ? 170 : 16) - ctx.measureText(formatINR(s.amount)).width;
    ctx.fillStyle = '#56616d';
    ctx.font = font(28, 400);
    ctx.fillText(fitText(ctx, `pays ${input.payer.name} · ${s.label}`, amountLeft - (PAD + 110) - 24), PAD + 110, y + 118);
    ctx.fillStyle = '#0f766e';
    ctx.font = font(48, 800);
    ctx.textAlign = 'right';
    ctx.fillText(formatINR(s.amount), W - PAD - (hasQr ? 170 : 16), y + 100);
    ctx.textAlign = 'left';
    if (hasQr) {
      const link = buildUpiLink({ payeeVpa: input.payer.upiId!, payeeName: input.payer.name, amountPaise: s.amount, note: input.title });
      const img = await loadImage(await qrDataUrl(link, 300));
      ctx.drawImage(img, W - PAD - 150, y + 10, 150, 150);
    }
    y += ROW;
  }
  for (const s of others) {
    avatar(s.member, PAD + 30, y + 40, 26);
    ctx.fillStyle = '#0f1720';
    ctx.font = font(32, 600);
    ctx.fillText(`${s.member.name}${s.member.id === input.payer.id ? ' (paid)' : ''}`, PAD + 76, y + 52);
    ctx.textAlign = 'right';
    ctx.fillText(formatINR(s.amount), W - PAD, y + 52);
    ctx.textAlign = 'left';
    y += 90;
  }

  ctx.fillStyle = '#56616d';
  ctx.font = font(26, 400);
  ctx.textAlign = 'center';
  ctx.fillText(input.payer.upiId ? 'Scan your QR with any UPI app to pay.' : 'Shares include tax & charges, split by what each person had.', W / 2, H - 70);
  ctx.fillText('Split with SplitSmart — receipts never leave your phone.', W / 2, H - 32);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/png'));
}

/** Share via the native share sheet when files are supported, otherwise download. Returns how it was delivered. */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'shared';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
