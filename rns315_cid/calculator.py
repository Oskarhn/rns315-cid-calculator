"""Reproduce the SD-password profile recovered from EU RNS315 firmware 0270.

No device access, network requests, persistence, or third-party dependencies.
ASVS 2.2.1: bound input and allow only 15/16 bytes of ASCII hexadecimal CID.
"""
from dataclasses import asdict, dataclass
import hashlib
import re
import struct

# Four uint32 addends from the SD profile at firmware address 0x00236A60.
# Values are mathematical format constants; no firmware payload is distributed.
ADDENDS = (0xA552F5E8, 0x73935351, 0x9077FADF, 0xC4012483)


def crc7(data: bytes) -> int:
    """SD CRC7, polynomial x^7 + x^3 + 1, initial zero, MSB first."""
    if not isinstance(data, (bytes, bytearray)):
        raise TypeError("CRC input must be bytes")
    if len(data) > 256:
        raise ValueError("CRC input exceeds the supported bound")
    crc = 0
    for value in data:
        for _ in range(8):
            feedback = ((crc >> 6) ^ (value >> 7)) & 1
            crc = (crc << 1) & 0x7F
            if feedback:
                crc ^= 0x09
            value = (value << 1) & 0xFF
    return crc


def _parse_cid(cid: str | bytes) -> bytes:
    if isinstance(cid, str):
        if len(cid) > 256:
            raise ValueError("CID input is too long")
        text = re.sub(r"\s", "", cid)
        if not re.fullmatch(r"(?:[0-9a-fA-F]{30}|[0-9a-fA-F]{32})", text, flags=re.ASCII):
            raise ValueError("CID must contain 30 or 32 hexadecimal characters")
        return bytes.fromhex(text)
    if isinstance(cid, bytes):
        if len(cid) not in (15, 16):
            raise ValueError("CID must contain 15 or 16 bytes")
        return cid
    raise TypeError("CID must be hexadecimal text or bytes")


@dataclass(frozen=True)
class CidDescription:
    canonical_cid: str
    radio_response_cid: str
    crc7: int
    supplied_crc_matches: bool | None

    def to_dict(self) -> dict:
        return asdict(self)


def describe_cid(cid: str | bytes) -> CidDescription:
    """Normalize the CRC from the first 15 bytes; the supplied last byte is ignored.

    Some host APIs return 00/01 instead of the CID's CRC byte. The calculator
    rebuilds CRC7 for both forms. The password routine receives the R2 form
    with its final end bit clear, not the SPI CID end bit of one.
    """
    raw = _parse_cid(cid)
    payload = raw[:15]
    check = crc7(payload)
    canonical = payload + bytes([(check << 1) | 1])
    radio = payload + bytes([check << 1])
    return CidDescription(
        canonical_cid=canonical.hex().upper(),
        radio_response_cid=radio.hex().upper(),
        crc7=check,
        supplied_crc_matches=None if len(raw) == 15 else (raw[-1] >> 1) == check,
    )


def calculate_password(cid: str | bytes) -> str:
    """Return the 16-byte password as 32 uppercase hexadecimal characters."""
    radio = bytes.fromhex(describe_cid(cid).radio_response_cid)
    words = struct.unpack(">4I", radio)
    transformed = struct.pack("<4I", *((word + addend) & 0xFFFFFFFF for word, addend in zip(words, ADDENDS)))
    # MD5 reproduces this legacy format; it is not a new security design.
    return hashlib.md5(transformed, usedforsecurity=False).hexdigest().upper()
