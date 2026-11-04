"""Normalize the observed 16-bit storage byte order for the two program records."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    58: ("3390e8db98ad832dc4da3a42610a35dcbfe6f263f6490216f397ce8f06b82ea8", "df2a9a3da6772bc7dccb36adbddc778a04dfb56ff4ea701810a7edf817b13efd"),
    66: ("67ebdd3bcb515410311c6177d045ab237c819b7850ca235311f2f331bec83335", "5d2a077f87d0a2c69ea23abe0e7ba21e9ea4af30824b1689673154eb9aa31565"),
}


def main():
    result = []
    for index, (source_digest, output_digest) in EXPECTED.items():
        source = ROOT / "private-artifacts" / "records-v2" / f"record-{index:04d}.bin"
        if not 0 < source.stat().st_size < 16_000_000:
            raise ValueError("Program input bounds")
        data = source.read_bytes()
        if len(data) % 2 or hashlib.sha256(data).hexdigest() != source_digest:
            raise ValueError("Unexpected program bytes")
        normalized = bytearray(len(data))
        normalized[::2] = data[1::2]
        normalized[1::2] = data[::2]
        if hashlib.sha256(normalized).hexdigest() != output_digest:
            raise ValueError("Normalization digest mismatch")
        target = source.with_name(f"record-{index:04d}-swap16.bin")
        target.write_bytes(normalized)
        result.append({"record": index, "sha256": output_digest, "bytes": len(normalized)})
    (ROOT / "evidence" / "normalized-programs.json").write_text(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
