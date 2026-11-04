"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { calculatePassword, describeCid, crc7, md5Hex } = require("../calculator/assets/password-calculator.js");
let checks = 0;
function equal(actual, expected, label) { assert.equal(actual, expected, label); checks += 1; }
function throws(fn, label) { assert.throws(fn, label); checks += 1; }

const rfc = [
  ["", "d41d8cd98f00b204e9800998ecf8427e"],
  ["a", "0cc175b9c0f1b6a831c399e269772661"],
  ["abc", "900150983cd24fb0d6963f7d28e17f72"],
  ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
  ["abcdefghijklmnopqrstuvwxyz", "c3fcd3d76192e4007dfb496cca67e13b"],
  ["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", "d174ab98d277d9f5a5611c2c9f419d9f"],
  ["12345678901234567890123456789012345678901234567890123456789012345678901234567890", "57edf4a22be3c955ac49da2e2107b67a"]
];
for (const [value, expected] of rfc) equal(md5Hex(value), expected.toUpperCase(), "RFC MD5 vector");
for (const length of [0, 1, 15, 16, 55, 56, 63, 64, 65, 127, 128, 129, 1000]) {
  const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 183) & 255);
  equal(md5Hex(bytes), crypto.createHash("md5").update(bytes).digest("hex").toUpperCase(), "Independent binary MD5 boundary");
}
equal(md5Hex("a".repeat(1000000)), "7707D6AE4E027C70EEA2A935C2296F21", "Million-byte MD5 vector");
equal(md5Hex("æøå 🚗"), crypto.createHash("md5").update("æøå 🚗", "utf8").digest("hex").toUpperCase(), "UTF8 MD5");
equal((crc7(Uint8Array.from(Buffer.from("4000000000", "hex"))) << 1) | 1, 0x95, "SD CMD0 CRC");
equal((crc7(Uint8Array.from(Buffer.from("48000001AA", "hex"))) << 1) | 1, 0x87, "SD CMD8 CRC");

const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, "../tests/fixtures/public-cid-password-pairs.json"), "utf8"));
assert.ok(vectors.length >= 2);
for (const vector of vectors) {
  const password = calculatePassword(vector.cid);
  equal(crypto.createHash("sha256").update(Buffer.from(password, "hex")).digest("hex"), vector.password_sha256, "Public vector fingerprint: " + vector.name);
  equal(calculatePassword(vector.cid.toLowerCase()), password, "Lowercase CID");
  equal(calculatePassword(vector.cid.slice(0, 30)), password, "15-byte CID form");
  equal(calculatePassword(" \n" + vector.cid.match(/../g).join(" ") + "\t"), password, "Whitespace CID form");
  const payload = vector.cid.slice(0, 30);
  for (let byte = 0; byte < 256; byte += 1) equal(calculatePassword(payload + byte.toString(16).padStart(2, "0")), password, "Host CRC placeholder invariance");
  const detail = describeCid(vector.cid);
  const canonical = Buffer.from(detail.canonicalCid, "hex");
  equal(canonical[15], (crc7(canonical.subarray(0, 15)) << 1) | 1, "Canonical CRC and end bit");
  equal(Buffer.from(detail.radioResponseCid, "hex")[15], canonical[15] & 0xFE, "R2 end bit clear");
  equal(describeCid(payload).suppliedCrcMatches, null, "CRC absent");
  equal(describeCid(detail.canonicalCid).suppliedCrcMatches, true, "Canonical CRC recognized");
}
for (const invalid of ["", "0".repeat(29), "0".repeat(31), "0".repeat(33), "G".repeat(32), "０".repeat(32), "<script>".repeat(4), "0".repeat(257), "0x" + "0".repeat(30), null, undefined, 42, {}]) throws(() => calculatePassword(invalid), "Invalid CID rejected");
throws(() => crc7(new Uint8Array(257)), "CRC bound");
throws(() => crc7("00"), "CRC type");
throws(() => md5Hex("a".repeat(1048577)), "MD5 bound");
throws(() => md5Hex(42), "MD5 type");
console.log(JSON.stringify({ checks, passed: true, publicVectors: vectors.length, privatePasswordRead: false, browserOrDevicesAccessed: false }));
