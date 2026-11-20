/**
 * Pure TypeScript ISO 32000-1 Standard Security Handler (RC4-128, V=2, R=3) PDF encryptor.
 * Works 100% client-side in browser & Node with zero external crypto dependencies.
 * Expects classic PDF output saved via pdf-lib with `{ useObjectStreams: false }`.
 */

export interface PdfEncryptOptions {
  userPassword: string;
  ownerPassword?: string;
  allowPrint?: boolean;
  allowCopy?: boolean;
  allowModify?: boolean;
}

// Standard ISO 32000-1 32-byte padding string
const PDF_PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
  0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

// --- Pure RFC 1321 MD5 ---
const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_K = new Uint32Array(64);
for (let i = 0; i < 64; i++) {
  MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
}

export function md5(input: Uint8Array): Uint8Array {
  const origLen = input.length;
  const bitLen = origLen * 8;
  const padLen = ((56 - ((origLen + 1) % 64)) + 64) % 64;
  const padded = new Uint8Array(origLen + 1 + padLen + 8);
  padded.set(input, 0);
  padded[origLen] = 0x80;

  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bitLen >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000) >>> 0, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const M = new Uint32Array(16);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let j = 0; j < 16; j++) {
      M[j] = dv.getUint32(offset + j * 4, true);
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F = 0;
      let g = 0;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }

      const sum = (A + F + MD5_K[i] + M[g]) >>> 0;
      const rot = ((sum << MD5_S[i]) | (sum >>> (32 - MD5_S[i]))) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + rot) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const outDv = new DataView(out.buffer);
  outDv.setUint32(0, a0, true);
  outDv.setUint32(4, b0, true);
  outDv.setUint32(8, c0, true);
  outDv.setUint32(12, d0, true);
  return out;
}

// --- Pure RC4 ---
export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;

  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
  }

  const out = new Uint8Array(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
    const keystream = S[(S[i] + S[j]) & 0xff];
    out[k] = data[k] ^ keystream;
  }
  return out;
}

function padPassword(password: string): Uint8Array {
  const out = new Uint8Array(32);
  const raw = new Uint8Array(password.length);
  for (let i = 0; i < password.length; i++) {
    raw[i] = password.charCodeAt(i) & 0xff;
  }
  const copyLen = Math.min(32, raw.length);
  out.set(raw.subarray(0, copyLen), 0);
  if (copyLen < 32) {
    out.set(PDF_PADDING.subarray(0, 32 - copyLen), copyLen);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hexStr: string): Uint8Array {
  const clean = hexStr.replace(/\s+/g, '');
  const padded = clean.length % 2 === 1 ? `${clean}0` : clean;
  const out = new Uint8Array(padded.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return out;
}

function asciiBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function bytesToLatin1(bytes: Uint8Array): string {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function computePermissionsFlag(opts: {
  allowPrint?: boolean;
  allowCopy?: boolean;
  allowModify?: boolean;
}): number {
  // ISO 32000-1 Table 22: bits 1-2 = 0, bits 7-8 = 1, bits 13-32 = 1 => 0xFFFFF0C0
  let p = 0xfffff0c0;
  if (opts.allowPrint !== false) {
    p |= 1 << 2; // Bit 3: Print
    p |= 1 << 11; // Bit 12: High-resolution print
  }
  if (opts.allowCopy !== false) {
    p |= 1 << 4; // Bit 5: Copy text/graphics
    p |= 1 << 9; // Bit 10: Accessibility extract
  }
  if (opts.allowModify) {
    p |= 1 << 3; // Bit 4: Modify contents
    p |= 1 << 5; // Bit 6: Add/modify annotations
    p |= 1 << 8; // Bit 9: Fill forms
    p |= 1 << 10; // Bit 11: Assemble document
  }
  return p | 0; // Signed 32-bit integer
}

/**
 * Computes /O, /U, /P, and the 16-byte File Encryption Key for Standard PDF RC4-128 (V=2, R=3).
 */
export function derivePdfRc4128Keys(
  userPassword: string,
  ownerPassword: string,
  fileId: Uint8Array,
  permissions: number
): {
  fileKey: Uint8Array;
  oValue: Uint8Array;
  uValue: Uint8Array;
  permissions: number;
} {
  const paddedUser = padPassword(userPassword);
  const paddedOwner = padPassword(ownerPassword || userPassword);

  // Algorithm 3: Compute O value (32 bytes)
  let ownerHash = md5(paddedOwner);
  for (let i = 0; i < 50; i++) {
    ownerHash = md5(ownerHash);
  }
  const ownerKey = ownerHash.subarray(0, 16);
  let oValue = rc4(ownerKey, paddedUser);
  for (let i = 1; i <= 19; i++) {
    const xorKey = new Uint8Array(16);
    for (let k = 0; k < 16; k++) xorKey[k] = ownerKey[k] ^ i;
    oValue = rc4(xorKey, oValue);
  }

  // Algorithm 2: Compute File Encryption Key (16 bytes)
  const pBytes = new Uint8Array(4);
  pBytes[0] = permissions & 0xff;
  pBytes[1] = (permissions >>> 8) & 0xff;
  pBytes[2] = (permissions >>> 16) & 0xff;
  pBytes[3] = (permissions >>> 24) & 0xff;

  let keyHash = md5(concatBytes([paddedUser, oValue, pBytes, fileId]));
  for (let i = 0; i < 50; i++) {
    keyHash = md5(keyHash.subarray(0, 16));
  }
  const fileKey = keyHash.subarray(0, 16);

  // Algorithm 5: Compute U value (32 bytes)
  const uHash = md5(concatBytes([PDF_PADDING, fileId]));
  let uEnc = rc4(fileKey, uHash);
  for (let i = 1; i <= 19; i++) {
    const xorKey = new Uint8Array(16);
    for (let k = 0; k < 16; k++) xorKey[k] = fileKey[k] ^ i;
    uEnc = rc4(xorKey, uEnc);
  }
  const uValue = new Uint8Array(32);
  uValue.set(uEnc, 0);
  uValue.set(PDF_PADDING.subarray(0, 16), 16);

  return { fileKey, oValue, uValue, permissions };
}

function deriveObjectKey(fileKey: Uint8Array, objNum: number, genNum: number): Uint8Array {
  const buf = new Uint8Array(fileKey.length + 5);
  buf.set(fileKey, 0);
  buf[fileKey.length] = objNum & 0xff;
  buf[fileKey.length + 1] = (objNum >>> 8) & 0xff;
  buf[fileKey.length + 2] = (objNum >>> 16) & 0xff;
  buf[fileKey.length + 3] = genNum & 0xff;
  buf[fileKey.length + 4] = (genNum >>> 8) & 0xff;
  const hash = md5(buf);
  return hash.subarray(0, Math.min(fileKey.length + 5, 16));
}

function unescapePdfLiteralString(content: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch !== '\\') {
      bytes.push(ch.charCodeAt(0) & 0xff);
      continue;
    }
    i++;
    if (i >= content.length) break;
    const esc = content[i];
    if (esc === 'n') bytes.push(0x0a);
    else if (esc === 'r') bytes.push(0x0d);
    else if (esc === 't') bytes.push(0x09);
    else if (esc === 'b') bytes.push(0x08);
    else if (esc === 'f') bytes.push(0x0c);
    else if (esc === '(' || esc === ')' || esc === '\\') bytes.push(esc.charCodeAt(0));
    else if (esc === '\r') {
      if (content[i + 1] === '\n') i++;
    } else if (esc === '\n') {
      // line continuation
    } else if (esc >= '0' && esc <= '7') {
      let oct = esc;
      for (let k = 0; k < 2 && i + 1 < content.length; k++) {
        const next = content[i + 1];
        if (next >= '0' && next <= '7') {
          oct += next;
          i++;
        } else {
          break;
        }
      }
      bytes.push(parseInt(oct, 8) & 0xff);
    } else {
      bytes.push(esc.charCodeAt(0) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Encrypts all literal strings (...) and hex strings <...> in a non-stream PDF token segment,
 * emitting them cleanly as encrypted PDF hex strings <...>.
 */
function encryptStringsInSegment(segment: string, objKey: Uint8Array): string {
  let out = '';
  let i = 0;
  const len = segment.length;

  while (i < len) {
    const ch = segment[i];

    // Skip PDF comments until newline
    if (ch === '%') {
      const nl = segment.indexOf('\n', i);
      if (nl === -1) {
        out += segment.slice(i);
        break;
      }
      out += segment.slice(i, nl + 1);
      i = nl + 1;
      continue;
    }

    // Skip dictionary delimiters << and >>
    if (ch === '<' && segment[i + 1] === '<') {
      out += '<<';
      i += 2;
      continue;
    }
    if (ch === '>' && segment[i + 1] === '>') {
      out += '>>';
      i += 2;
      continue;
    }

    // Hex string <...>
    if (ch === '<') {
      const close = segment.indexOf('>', i + 1);
      if (close !== -1) {
        const raw = hexToBytes(segment.slice(i + 1, close));
        const enc = rc4(objKey, raw);
        out += `<${bytesToHex(enc)}>`;
        i = close + 1;
        continue;
      }
    }

    // Literal string (...) with nested parentheses & escapes
    if (ch === '(') {
      let depth = 1;
      let j = i + 1;
      while (j < len && depth > 0) {
        if (segment[j] === '\\') {
          j += 2;
          continue;
        }
        if (segment[j] === '(') depth++;
        else if (segment[j] === ')') depth--;
        j++;
      }
      const inner = segment.slice(i + 1, j - 1);
      const raw = unescapePdfLiteralString(inner);
      const enc = rc4(objKey, raw);
      out += `<${bytesToHex(enc)}>`;
      i = j;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Encrypts an indirect object's body (both dictionary/array strings and any embedded binary stream).
 */
function encryptObjectBody(
  bodyBytes: Uint8Array,
  objNum: number,
  genNum: number,
  fileKey: Uint8Array
): Uint8Array {
  const objKey = deriveObjectKey(fileKey, objNum, genNum);
  const latin1 = bytesToLatin1(bodyBytes);

  // Check if this object contains a stream
  const streamMatch = /(?:^|[\s>\]])stream(\r\n|\n)/.exec(latin1);
  if (!streamMatch) {
    const encryptedText = encryptStringsInSegment(latin1, objKey);
    return asciiBytes(encryptedText);
  }

  const streamKeywordOffset = streamMatch.index + streamMatch[0].indexOf('stream');
  const streamDataStart = streamMatch.index + streamMatch[0].length;
  const headerPart = latin1.slice(0, streamKeywordOffset);

  // Determine exact stream length using direct /Length integer if present, else locate endstream
  let streamDataEnd = -1;
  const lenMatch = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(headerPart);
  if (lenMatch) {
    const declaredLen = parseInt(lenMatch[1], 10);
    if (
      Number.isFinite(declaredLen) &&
      declaredLen >= 0 &&
      streamDataStart + declaredLen <= bodyBytes.length
    ) {
      streamDataEnd = streamDataStart + declaredLen;
    }
  }

  if (streamDataEnd === -1) {
    const endstreamIdx = latin1.lastIndexOf('endstream');
    if (endstreamIdx === -1 || endstreamIdx < streamDataStart) {
      return asciiBytes(encryptStringsInSegment(latin1, objKey));
    }
    let trimEnd = endstreamIdx;
    if (trimEnd > streamDataStart && bodyBytes[trimEnd - 1] === 0x0a) trimEnd--;
    if (trimEnd > streamDataStart && bodyBytes[trimEnd - 1] === 0x0d) trimEnd--;
    streamDataEnd = trimEnd;
  }

  const encryptedHeader = asciiBytes(encryptStringsInSegment(headerPart, objKey));
  const streamPrefix = bodyBytes.subarray(streamKeywordOffset, streamDataStart);
  const rawStream = bodyBytes.subarray(streamDataStart, streamDataEnd);
  const encryptedStream = rc4(objKey, rawStream);
  const trailerPart = bodyBytes.subarray(streamDataEnd);

  return concatBytes([encryptedHeader, streamPrefix, encryptedStream, trailerPart]);
}

interface ParsedIndirectObject {
  objNum: number;
  genNum: number;
  body: Uint8Array;
}

/**
 * Encrypts a classic (non-object-stream) PDF byte buffer with standard RC4-128 password protection.
 * Callers using pdf-lib should pass `await pdfDoc.save({ useObjectStreams: false })`.
 */
export function encryptPdfBytes(
  pdfBytes: Uint8Array,
  options: PdfEncryptOptions
): Uint8Array {
  const userPassword = options.userPassword || '';
  const ownerPassword = options.ownerPassword?.trim() || userPassword;
  if (!userPassword && !ownerPassword) {
    throw new Error('Kata sandi tidak boleh kosong.');
  }

  const latin1 = bytesToLatin1(pdfBytes);

  // Extract trailer dictionary (Root & optional Info references)
  const trailerIdx = latin1.lastIndexOf('trailer');
  if (trailerIdx === -1) {
    throw new Error('Struktur trailer PDF tidak ditemukan. Pastikan dokumen PDF valid.');
  }
  const trailerSection = latin1.slice(trailerIdx);
  const rootMatch = /\/Root\s+(\d+\s+\d+\s+R)/.exec(trailerSection);
  if (!rootMatch) {
    throw new Error('Referensi /Root PDF tidak ditemukan.');
  }
  const rootRef = rootMatch[1];
  const infoMatch = /\/Info\s+(\d+\s+\d+\s+R)/.exec(trailerSection);
  const infoRef = infoMatch ? infoMatch[1] : null;

  // Locate xref boundary so we only scan real indirect objects before xref
  const xrefIdx = latin1.lastIndexOf('\nxref', trailerIdx);
  const bodyEndLimit = xrefIdx !== -1 ? xrefIdx : trailerIdx;

  // Parse all indirect objects `<num> <gen> obj ... endobj`
  const objects = new Map<number, ParsedIndirectObject>();
  const objHeaderRe = /(?:^|\r?\n)(\d+)\s+(\d+)\s+obj(?:\r?\n|\s)/g;
  let maxObjNum = 0;

  let match: RegExpExecArray | null;
  while ((match = objHeaderRe.exec(latin1)) !== null) {
    if (match.index >= bodyEndLimit) break;
    const objNum = parseInt(match[1], 10);
    const genNum = parseInt(match[2], 10);
    const bodyStart = match.index + match[0].length;

    // Find matching endobj, carefully skipping any binary stream body
    let searchFrom = bodyStart;
    const ahead = latin1.slice(bodyStart, Math.min(bodyEndLimit, bodyStart + 4096));
    const streamAhead = /(?:^|[\s>\]])stream(\r\n|\n)/.exec(ahead);
    if (streamAhead) {
      const beforeStream = ahead.slice(0, streamAhead.index);
      const endObjBeforeStream = beforeStream.indexOf('endobj');
      if (endObjBeforeStream === -1) {
        const lenMatch = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(beforeStream);
        const dataStartAbs = bodyStart + streamAhead.index + streamAhead[0].length;
        if (lenMatch) {
          const declaredLen = parseInt(lenMatch[1], 10);
          if (Number.isFinite(declaredLen) && declaredLen >= 0) {
            searchFrom = dataStartAbs + declaredLen;
          }
        }
      }
    }

    const endObjIdx = latin1.indexOf('endobj', searchFrom);
    if (endObjIdx === -1 || endObjIdx > bodyEndLimit) break;

    const body = pdfBytes.subarray(bodyStart, endObjIdx);
    objects.set(objNum, { objNum, genNum, body });
    if (objNum > maxObjNum) maxObjNum = objNum;

    objHeaderRe.lastIndex = endObjIdx + 6;
  }

  if (objects.size === 0) {
    throw new Error('Tidak ada objek PDF yang dapat dienkripsi.');
  }

  // Deterministic 16-byte document ID derived from content hash + timestamp salt
  const fileId = md5(
    concatBytes([
      pdfBytes.subarray(0, Math.min(2048, pdfBytes.length)),
      asciiBytes(`${pdfBytes.length}-${userPassword.length}-PDFCreatorTools`),
    ])
  );
  const fileIdHex = bytesToHex(fileId);

  const permissions = computePermissionsFlag({
    allowPrint: options.allowPrint,
    allowCopy: options.allowCopy,
    allowModify: options.allowModify,
  });

  const { fileKey, oValue, uValue } = derivePdfRc4128Keys(
    userPassword,
    ownerPassword,
    fileId,
    permissions
  );

  // Build new encrypted PDF with clean header, encrypted objects, /Encrypt dict, and fresh xref
  const chunks: Uint8Array[] = [];
  let cursor = 0;
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    cursor += bytes.length;
  };

  // PDF 1.4+ binary header
  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const encryptObjNum = maxObjNum + 1;
  const totalSize = encryptObjNum + 1;
  const offsets = new Map<number, { offset: number; gen: number }>();

  const sortedObjNums = Array.from(objects.keys()).sort((a, b) => a - b);
  for (const num of sortedObjNums) {
    const obj = objects.get(num)!;
    offsets.set(num, { offset: cursor, gen: obj.genNum });
    const encBody = encryptObjectBody(obj.body, obj.objNum, obj.genNum, fileKey);
    push(asciiBytes(`${obj.objNum} ${obj.genNum} obj\n`));
    push(encBody);
    push(asciiBytes(`\nendobj\n`));
  }

  // Append unencrypted /Encrypt dictionary object
  offsets.set(encryptObjNum, { offset: cursor, gen: 0 });
  const encryptDict =
    `${encryptObjNum} 0 obj\n` +
    `<<\n` +
    `/Filter /Standard\n` +
    `/V 2\n` +
    `/R 3\n` +
    `/Length 128\n` +
    `/P ${permissions}\n` +
    `/O <${bytesToHex(oValue)}>\n` +
    `/U <${bytesToHex(uValue)}>\n` +
    `>>\n` +
    `endobj\n`;
  push(asciiBytes(encryptDict));

  // Build classic xref table
  const xrefOffset = cursor;
  let xrefStr = `xref\n0 ${totalSize}\n0000000000 65535 f \n`;
  for (let i = 1; i < totalSize; i++) {
    const entry = offsets.get(i);
    if (entry) {
      const offStr = String(entry.offset).padStart(10, '0');
      const genStr = String(entry.gen).padStart(5, '0');
      xrefStr += `${offStr} ${genStr} n \n`;
    } else {
      xrefStr += `0000000000 65535 f \n`;
    }
  }

  const infoLine = infoRef ? `/Info ${infoRef}\n` : '';
  const trailerStr =
    `trailer\n` +
    `<<\n` +
    `/Size ${totalSize}\n` +
    `/Root ${rootRef}\n` +
    infoLine +
    `/Encrypt ${encryptObjNum} 0 R\n` +
    `/ID [<${fileIdHex}> <${fileIdHex}>]\n` +
    `>>\n` +
    `startxref\n` +
    `${xrefOffset}\n` +
    `%%EOF\n`;

  push(asciiBytes(xrefStr + trailerStr));
  return concatBytes(chunks);
}
