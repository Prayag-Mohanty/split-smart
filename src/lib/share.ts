/**
 * Sharing a group without a backend: JSON export/import and a compact URL encoding
 * (deflate + base64url) that fits in a link fragment, so no data ever hits a server.
 */
import { CATEGORIES, type Group } from './types';

const FORMAT = 'splitsmart-group';
const VERSION = 1;

export interface GroupFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  group: Group;
}

export function groupToJson(group: Group): string {
  const file: GroupFile = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), group };
  return JSON.stringify(file, null, 2);
}

/** Parse and sanity-check an imported group. Throws a user-readable Error if invalid. */
export function groupFromJson(text: string): Group {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const file = data as Partial<GroupFile>;
  const group = (file && file.format === FORMAT ? file.group : data) as Group | undefined;
  if (!group || typeof group !== 'object' || typeof group.name !== 'string' || !Array.isArray(group.members)) {
    throw new Error('This does not look like a SplitSmart group export.');
  }
  const memberIds = new Set(group.members.map((m) => m.id));
  const expenses = Array.isArray(group.expenses) ? group.expenses : [];
  for (const e of expenses) {
    if (!memberIds.has(e.payerId)) throw new Error(`Expense "${e.description}" references an unknown payer.`);
    if (!CATEGORIES.includes(e.category)) e.category = 'Other';
  }
  return {
    id: String(group.id ?? ''),
    name: group.name,
    emoji: group.emoji,
    createdAt: Number(group.createdAt) || Date.now(),
    members: group.members,
    expenses,
    settlements: Array.isArray(group.settlements) ? group.settlements : [],
    recurring: Array.isArray(group.recurring) ? group.recurring : [],
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipeThrough(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** Encode a group into a URL-safe string. Prefix "z" = deflated, "j" = plain JSON. */
export async function encodeGroup(group: Group): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(group));
  if (typeof CompressionStream !== 'undefined') {
    return 'z' + toBase64Url(await pipeThrough(json, new CompressionStream('deflate-raw')));
  }
  return 'j' + toBase64Url(json);
}

export async function decodeGroup(encoded: string): Promise<Group> {
  const kind = encoded[0];
  const bytes = fromBase64Url(encoded.slice(1));
  let raw: Uint8Array;
  if (kind === 'z') {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed share links.');
    raw = await pipeThrough(bytes, new DecompressionStream('deflate-raw'));
  } else if (kind === 'j') {
    raw = bytes;
  } else {
    throw new Error('Unrecognised share link.');
  }
  return groupFromJson(new TextDecoder().decode(raw));
}
