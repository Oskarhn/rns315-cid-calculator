"""Offline inspection only; never opens a device, mounts or executes firmware.

ASVS 5.2.1/5.2.2: bounded, hash-bound input and ISO extent validation.
ASVS 5.3.2/5.3.3: fixed output names, no archive paths used as disk paths.
"""
from pathlib import Path
import argparse
import collections
import hashlib
import json
import math
import re
import struct

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = "e10fa6be5eb3a7a271415bd508c2f79054c4bb6b7343e7e7056bc76fd1a3294f"

def entropy(data):
    counts = collections.Counter(data)
    return -sum((v / len(data)) * math.log2(v / len(data)) for v in counts.values()) if data else 0

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("iso", type=Path, help="Existing local RNS315 1508/0270 ISO; no device paths")
    args = parser.parse_args()
    source = args.iso.resolve(strict=True)
    if not source.is_file() or source.stat().st_size != 40540160:
        raise ValueError("Unexpected source length")
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != EXPECTED:
        raise ValueError("Unexpected source digest")
    pvd = raw[32768:34816]
    if pvd[:7] != b"\x01CD001\x01":
        raise ValueError("Not ISO9660")
    sector = 2048
    root_extent = struct.unpack_from("<I", pvd, 158)[0]
    root_length = struct.unpack_from("<I", pvd, 166)[0]
    if root_length > 1_000_000 or root_extent * sector + root_length > len(raw):
        raise ValueError("Invalid root bounds")
    directory = raw[root_extent * sector:root_extent * sector + root_length]
    offset = 0
    records = []
    for _ in range(1000):
        if offset >= len(directory):
            break
        length = directory[offset]
        if length == 0:
            offset = (offset // sector + 1) * sector
            continue
        if length < 34 or offset + length > len(directory):
            raise ValueError("Invalid record")
        rec = directory[offset:offset + length]
        offset += length
        name_length = rec[32]
        if 33 + name_length > length:
            raise ValueError("Invalid filename")
        name = rec[33:33 + name_length]
        if name in (b"\x00", b"\x01"):
            continue
        extent = struct.unpack_from("<I", rec, 2)[0]
        size = struct.unpack_from("<I", rec, 10)[0]
        if rec[25] & 2 or extent * sector + size > len(raw):
            raise ValueError("Unexpected directory or invalid extent")
        records.append((name.decode("ascii"), extent, size))
    work = ROOT / "private-artifacts"
    evidence = ROOT / "evidence"
    work.mkdir(parents=True, exist_ok=True)
    evidence.mkdir(parents=True, exist_ok=True)
    manifest = {"source_name": source.name, "source_sha256": EXPECTED, "source_size": len(raw), "files": []}
    for name, extent, size in records:
        data = raw[extent * sector:extent * sector + size]
        output_name = "update.idx" if name.startswith("UPDATE.IDX") else "firmware.dat" if name.startswith("VW_EU_15.DAT") else None
        if output_name is None:
            raise ValueError("Unexpected ISO member")
        destination = work / output_name
        if destination.exists():
            if destination.read_bytes() != data:
                raise ValueError("Existing output differs")
        else:
            destination.write_bytes(data)
        manifest["files"].append({"iso_name": name, "iso_offset": extent * sector, "size": size, "sha256": hashlib.sha256(data).hexdigest(), "output": output_name})
        if output_name != "firmware.dat":
            continue
        strings = [{"offset": m.start(), "text": m.group().decode("ascii")} for m in re.finditer(rb"[\x20-\x7e]{6,}", data)]
        (evidence / "dat-strings.json").write_text(json.dumps(strings, indent=2), encoding="utf-8")
        signatures = {"ELF": b"\x7fELF", "gzip": b"\x1f\x8b\x08", "zlib_78da": b"\x78\xda", "zlib_789c": b"\x78\x9c", "zip": b"PK\x03\x04", "squashfs": b"hsqs", "cramfs": b"\x45\x3d\xcd\x28", "uimage": b"\x27\x05\x19\x56", "xz": b"\xfd7zXZ\x00"}
        report = {"header_hex": data[:512].hex(" "), "header_ascii": "".join(chr(b) if 32 <= b < 127 else "." for b in data[:512]), "entropy": entropy(data), "size": len(data), "ascii_string_count": len(strings), "signatures": {key: [m.start() for m in re.finditer(re.escape(value), data)][:200] for key, value in signatures.items()}, "entropy_64k": [{"offset": i, "entropy": round(entropy(data[i:i+65536]), 5)} for i in range(0, len(data), 65536)], "keyword_strings": [s for s in strings if re.search(r"cid|password|unlock|sdcard|sd.card|cmd42|crypt|technisat|\.bin|\.elf|\.img|\.gz|linux|qnx|vxworks", s["text"], re.I)][:200]}
        (evidence / "dat-overview.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps({k:v for k,v in report.items() if k != "entropy_64k"}, indent=2))
    (evidence / "input-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()
