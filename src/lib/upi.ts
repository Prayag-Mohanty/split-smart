/**
 * UPI deep links (NPCI "upi://pay" URI scheme).
 * Parameters: pa = payee VPA, pn = payee name, am = amount (rupees, 2 dp),
 * cu = currency (INR), tn = transaction note.
 */
import { toDecimalString, type Paise } from './money';

const VPA_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

export function isValidVpa(vpa: string): boolean {
  return VPA_RE.test(vpa.trim());
}

export interface UpiPayment {
  payeeVpa: string;
  payeeName: string;
  amountPaise: Paise;
  note?: string;
}

export function buildUpiLink({ payeeVpa, payeeName, amountPaise, note }: UpiPayment): string {
  const params = new URLSearchParams();
  params.set('pa', payeeVpa.trim());
  params.set('pn', payeeName.trim().slice(0, 50));
  params.set('am', toDecimalString(amountPaise));
  params.set('cu', 'INR');
  if (note) params.set('tn', note.slice(0, 80));
  // UPI apps expect %20 rather than "+" for spaces.
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}
