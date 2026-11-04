/* Independent browser implementation of the recovered EU RNS315 0270 profile.
 * No network, device access or persistence. MD5 reproduces a legacy format.
 * ASVS 2.2.1: bounded ASCII-hex CID validation; numeric operations use uint32.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Rns315Calculator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ADDENDS = Object.freeze([0xA552F5E8, 0x73935351, 0x9077FADF, 0xC4012483]);
  const SHIFTS = Object.freeze([
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ]);
  const CONSTANTS = Object.freeze(Array.from({ length: 64 }, function (_, i) {
    return Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  }));

  function hex(bytes) {
    return Array.from(bytes, function (value) { return value.toString(16).padStart(2, "0"); }).join("").toUpperCase();
  }

  function md5Hex(value) {
    let bytes;
    if (typeof value === "string") {
      if (value.length > 1048576) throw new RangeError("MD5 input exceeds the supported bound");
      bytes = new TextEncoder().encode(value);
    } else if (value instanceof Uint8Array) bytes = value;
    else throw new TypeError("MD5 input must be text or Uint8Array");
    if (bytes.length > 1048576) throw new RangeError("MD5 input exceeds the supported bound");

    const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 8, bytes.length * 8, true);
    view.setUint32(paddedLength - 4, 0, true);
    let a0 = 0x67452301, b0 = 0xEFCDAB89, c0 = 0x98BADCFE, d0 = 0x10325476;

    for (let block = 0; block < paddedLength; block += 64) {
      let a = a0, b = b0, c = c0, d = d0;
      for (let i = 0; i < 64; i += 1) {
        let f, word;
        if (i < 16) { f = (b & c) | (~b & d); word = i; }
        else if (i < 32) { f = (d & b) | (~d & c); word = (5 * i + 1) % 16; }
        else if (i < 48) { f = b ^ c ^ d; word = (3 * i + 5) % 16; }
        else { f = c ^ (b | ~d); word = (7 * i) % 16; }
        const sum = (a + f + CONSTANTS[i] + view.getUint32(block + word * 4, true)) >>> 0;
        const rotated = (sum << SHIFTS[i]) | (sum >>> (32 - SHIFTS[i]));
        a = d;
        d = c;
        c = b;
        b = (b + rotated) >>> 0;
      }
      a0 = (a0 + a) >>> 0;
      b0 = (b0 + b) >>> 0;
      c0 = (c0 + c) >>> 0;
      d0 = (d0 + d) >>> 0;
    }
    const digest = new Uint8Array(16);
    const output = new DataView(digest.buffer);
    [a0, b0, c0, d0].forEach(function (word, i) { output.setUint32(i * 4, word, true); });
    return hex(digest);
  }

  function crc7(bytes) {
    if (!(bytes instanceof Uint8Array)) throw new TypeError("CRC input must be Uint8Array");
    if (bytes.length > 256) throw new RangeError("CRC input exceeds the supported bound");
    let crc = 0;
    for (let value of bytes) {
      for (let bit = 0; bit < 8; bit += 1) {
        const feedback = ((crc >>> 6) ^ (value >>> 7)) & 1;
        crc = (crc << 1) & 0x7F;
        if (feedback) crc ^= 0x09;
        value = (value << 1) & 0xFF;
      }
    }
    return crc;
  }

  function parseCid(value) {
    if (typeof value !== "string") throw new TypeError("CID must be text.");
    if (value.length > 256) throw new RangeError("CID input is too long. Use 30 or 32 hexadecimal characters.");
    const text = value.replace(/\s/g, "");
    if (!/^(?:[0-9A-Fa-f]{30}|[0-9A-Fa-f]{32})$/.test(text)) {
      throw new Error("Enter 30 or 32 hexadecimal characters (0–9 and A–F). Spaces are allowed.");
    }
    return Uint8Array.from(text.match(/../g), function (pair) { return parseInt(pair, 16); });
  }

  function describeCid(value) {
    const raw = parseCid(value);
    const check = crc7(raw.subarray(0, 15));
    const canonical = new Uint8Array(16);
    canonical.set(raw.subarray(0, 15));
    canonical[15] = (check << 1) | 1;
    const radio = canonical.slice();
    radio[15] &= 0xFE;
    return Object.freeze({
      canonicalCid: hex(canonical),
      radioResponseCid: hex(radio),
      crc7: check,
      suppliedCrcMatches: raw.length === 15 ? null : (raw[15] >>> 1) === check
    });
  }

  function calculatePassword(value) {
    const detail = describeCid(value);
    const radio = Uint8Array.from(detail.radioResponseCid.match(/../g), function (pair) { return parseInt(pair, 16); });
    const input = new DataView(radio.buffer);
    const transformed = new Uint8Array(16);
    const output = new DataView(transformed.buffer);
    for (let i = 0; i < 4; i += 1) {
      output.setUint32(i * 4, (input.getUint32(i * 4, false) + ADDENDS[i]) >>> 0, true);
    }
    return md5Hex(transformed);
  }

  return Object.freeze({ calculatePassword: calculatePassword, describeCid: describeCid, crc7: crc7, md5Hex: md5Hex });
});
