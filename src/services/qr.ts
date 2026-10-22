/** QR codes for UPI links; the qrcode library is loaded on demand. */
export async function qrDataUrl(text: string, size = 220): Promise<string> {
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' });
}
