"""Conservative parser for this observed TSD update container, not a flasher.

ASVS 5.2.1/5.2.3: size/range limits; no unbounded decompression.
ASVS 5.3.2/5.3.3: extracted files use numeric generated names only.
The meaning of unknown fields is intentionally not inferred.
"""
from pathlib import Path
import hashlib
import json
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "private-artifacts" / "firmware.dat"

def main():
    if INPUT.stat().st_size != 40168980:
        raise ValueError("Unexpected input size")
    data = INPUT.read_bytes()
    if hashlib.sha256(data).hexdigest() != "76f10b5f79f7abef1decd0898bb877acd461ea367661aedeb9b4f8b243a7db71":
        raise ValueError("Input digest mismatch")
    out = ROOT / "private-artifacts" / "records-v2"
    out.mkdir(exist_ok=True)
    records = []
    offset = 0
    for index in range(10000):
        if offset == len(data):
            break
        if offset + 16 > len(data):
            raise ValueError(f"Truncated record header at {offset:x}")
        tag, field1, field2, field3 = struct.unpack_from("<4I", data, offset)
        rec = {"index": index, "offset": offset, "tag": hex(tag), "field1": field1, "field2": field2, "field3": hex(field3)}
        start = offset + 16
        if tag in (0x8006, 0x9006, 0x9004, 0xa001, 0xa002, 0xa003, 0x8001, 0x8002, 0x8004, 0x8009, 0x800a, 0x800c, 0x800e):
            if start + field2 > len(data):
                raise ValueError("Invalid binary block bounds")
            payload = data[start:start + field2]
            rec.update(name=f"binary-block-{field1:08x}", payload_offset=start, size=len(payload), sha256=hashlib.sha256(payload).hexdigest(), crc32=hex(zlib.crc32(payload)), first64=payload[:64].hex())
            dest = out / f"record-{index:04d}.bin"
            if dest.exists() and dest.read_bytes() != payload:
                raise ValueError("Output collision")
            if not dest.exists():
                dest.write_bytes(payload)
            offset = (start + field2 + 3) & ~3
        elif tag == 0x8008:
            if field1 > 4096 or field1 > field2 or start + field2 > len(data):
                raise ValueError(f"Invalid file bounds {offset:x}")
            name = data[start:start + field1].split(b"\x00")[0].decode("ascii", errors="replace")
            end = start + field2
            start += field1
            payload = data[start:end]
            rec.update(name=name, payload_offset=start, size=len(payload), sha256=hashlib.sha256(payload).hexdigest(), crc32=hex(zlib.crc32(payload)), first64=payload[:64].hex())
            dest = out / f"record-{index:04d}.bin"
            if dest.exists() and dest.read_bytes() != payload:
                raise ValueError("Output collision")
            if not dest.exists():
                dest.write_bytes(payload)
            offset = (end + 3) & ~3
        elif tag in (0x8003, 0x8005, 0x8007, 0x800b, 0x800d, 0x800f):
            if field2 > 1000000 or start + field2 > len(data):
                raise ValueError("Invalid metadata bounds")
            rec["metadata_hex"] = data[start:start + field2].hex()
            if tag != 0x8005:
                rec["metadata_text"] = data[start:start + field2].decode("ascii", errors="replace")
            offset = (start + field2 + 3) & ~3
        elif tag in (1, 3, 7, 0x1001, 0x1003):
            offset = start
        else:
            rec["status"] = "unknown-record-layout"
            records.append(rec)
            print(json.dumps(rec))
            break
        records.append(rec)
    (ROOT / "evidence" / "tsd-records.json").write_text(json.dumps({"parsed_end": offset, "input_size": len(data), "records": records}, indent=2), encoding="utf-8")
    print(json.dumps({"parsed_end": offset, "total": len(data), "record_count": len(records), "files": [{k:r[k] for k in ("index", "offset", "name", "size", "payload_offset", "first64") } for r in records if "name" in r]}, indent=2))

if __name__ == "__main__":
    main()
