"""Bounded codecs for reproducing the observed legacy firmware packing.
These functions operate on bytes only and never execute firmware.
"""
import struct


def rc4_stream(key: bytes, count: int) -> bytes:
    if not isinstance(key, bytes) or not 1 <= len(key) <= 256 or not 0 <= count <= 2_000_000:
        raise ValueError("Unsupported RC4 input bounds")
    state = list(range(256))
    j = 0
    for i in range(256):
        j = (j + state[i] + key[i % len(key)]) & 255
        state[i], state[j] = state[j], state[i]
    i = j = 0
    result = bytearray()
    for _ in range(count):
        i = (i + 1) & 255
        j = (j + state[i]) & 255
        state[i], state[j] = state[j], state[i]
        result.append(state[(state[i] + state[j]) & 255])
    return bytes(result)


def decode_lz(packed: bytes, max_output: int = 32_000_000) -> tuple[bytes, dict]:
    if len(packed) > 40_000_000 or len(packed) % 2 or not 0 < max_output <= 64_000_000:
        raise ValueError("Unsupported word-LZ input bounds")
    position = 0
    output = bytearray()
    references = {"odd": 0, "even": 0}
    while position < len(packed):
        flags = struct.unpack_from("<H", packed, position)[0]
        position += 2
        for bit in range(16):
            if position == len(packed):
                break
            token = struct.unpack_from("<H", packed, position)[0]
            position += 2
            if flags & (1 << bit):
                if len(output) + 2 > max_output:
                    raise ValueError("Word-LZ output bound exceeded")
                output.extend(token.to_bytes(2, "little"))
            else:
                distance = ((token & 0xFFF) + 1) * 2
                length = ((token >> 12) + 2) * 2
                if distance > len(output):
                    raise ValueError("Word-LZ reference before output start")
                if len(output) + length > max_output:
                    raise ValueError("Word-LZ output bound exceeded")
                references["odd" if token & 1 else "even"] += 1
                for _ in range(length):
                    output.append(output[-distance])
    return bytes(output), references
