import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildSamplePdfBytes } from './pdfHelpers';
import {
  bytesToHex,
  computePermissionsFlag,
  derivePdfRc4128Keys,
  encryptPdfBytes,
  md5,
  rc4,
} from './pdfCrypto';

test('md5 matches RFC 1321 test vectors', () => {
  const enc = new TextEncoder();
  assert.equal(bytesToHex(md5(enc.encode(''))), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(bytesToHex(md5(enc.encode('abc'))), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(
    bytesToHex(md5(enc.encode('message digest'))),
    'f96b697d7cb7938d525a2f31aaf161d0'
  );
});

test('rc4 round-trips arbitrary byte payloads identically', () => {
  const key = new TextEncoder().encode('SecretKey128');
  const plain = new TextEncoder().encode('PDF Creator Tools oleh Ridwan');
  const cipher = rc4(key, plain);
  assert.notDeepEqual(cipher, plain);
  const decrypted = rc4(key, cipher);
  assert.deepEqual(decrypted, plain);
});

test('computePermissionsFlag sets valid ISO 32000-1 signed 32-bit bits', () => {
  const lockedAll = computePermissionsFlag({
    allowPrint: false,
    allowCopy: false,
    allowModify: false,
  });
  assert.equal(lockedAll, -3904);

  const printOnly = computePermissionsFlag({
    allowPrint: true,
    allowCopy: false,
    allowModify: false,
  });
  assert.equal((printOnly & 4) !== 0, true);
  assert.equal((printOnly & 16) !== 0, false);
});

test('encryptPdfBytes creates valid RC4-128 encrypted PDF verified by pdfjs-dist', async () => {
  // Build a real 2-page classic PDF via pdf-lib
  const sampleBytes = await buildSamplePdfBytes('Dokumen Rahasia Ridwan', [
    { heading: 'Halaman Satu', body: ['Ini isi rahasia yang harus terenkripsi.'] },
    { heading: 'Halaman Dua', body: ['Data lanjutan setelah dekripsi berhasil.'] },
  ]);
  const doc = await PDFDocument.load(sampleBytes);
  const classicBytes = await doc.save({ useObjectStreams: false });

  const encrypted = encryptPdfBytes(classicBytes, {
    userPassword: 'rahasia2026',
    ownerPassword: 'owner2026',
    allowPrint: true,
    allowCopy: false,
  });

  const textView = Buffer.from(encrypted).toString('latin1');
  assert.ok(textView.includes('/Filter /Standard'), 'Missing /Filter /Standard');
  assert.ok(textView.includes('/V 2'), 'Missing /V 2');
  assert.ok(textView.includes('/R 3'), 'Missing /R 3');
  assert.ok(textView.includes('/Encrypt '), 'Missing /Encrypt trailer entry');
  assert.ok(textView.includes('/ID [<'), 'Missing /ID trailer entry');

  // Verify real decryption using pdfjs-dist legacy build in Node!
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // 1) Opening without password MUST fail with PasswordException
  await assert.rejects(
    async () => {
      const task = pdfjs.getDocument({ data: new Uint8Array(encrypted) });
      await task.promise;
    },
    (err: unknown) => {
      return err instanceof Error && err.name === 'PasswordException';
    },
    'Expected PasswordException when opening without password'
  );

  // 2) Opening with WRONG password MUST fail with PasswordException
  await assert.rejects(
    async () => {
      const task = pdfjs.getDocument({
        data: new Uint8Array(encrypted),
        password: 'salahpassword',
      });
      await task.promise;
    },
    (err: unknown) => {
      return err instanceof Error && err.name === 'PasswordException';
    },
    'Expected PasswordException with wrong password'
  );

  // 3) Opening with CORRECT user password MUST succeed and decrypt exact text!
  const okTask = pdfjs.getDocument({
    data: new Uint8Array(encrypted),
    password: 'rahasia2026',
  });
  const pdf = await okTask.promise;
  assert.equal(pdf.numPages, 2);
  const page1 = await pdf.getPage(1);
  const content = await page1.getTextContent();
  const extracted = content.items
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ');
  assert.ok(
    extracted.includes('Halaman Satu'),
    `Expected decrypted page text to contain "Halaman Satu", got: ${extracted}`
  );
  await okTask.destroy();

  // Sanity check key derivation deterministic behavior
  const fileId = new Uint8Array(16).fill(0xab);
  const k1 = derivePdfRc4128Keys('abc', 'xyz', fileId, -3904);
  const k2 = derivePdfRc4128Keys('abc', 'xyz', fileId, -3904);
  assert.deepEqual(k1.fileKey, k2.fileKey);
  assert.deepEqual(k1.uValue, k2.uValue);
});
