"""Codec reference vectors and failure boundaries, independent of firmware files."""
import importlib.util
from pathlib import Path
import struct
import unittest

path = Path(__file__).resolve().parents[1] / "research" / "scripts" / "firmware_codecs.py"
spec = importlib.util.spec_from_file_location("firmware_codecs", path)
codecs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(codecs)


class FirmwareCodecTests(unittest.TestCase):
    def test_rc4_known_vector(self):
        self.assertEqual(codecs.rc4_stream(b"Key", 10).hex(), "eb9f7781b734ca72a719")

    def test_literal_and_overlapping_word_copy(self):
        packed = struct.pack("<3H", 1, 0x4241, 0)
        self.assertEqual(codecs.decode_lz(packed)[0], b"ABABAB")

    def test_invalid_reference_and_output_limit(self):
        with self.assertRaises(ValueError):
            codecs.decode_lz(struct.pack("<2H", 0, 0))
        with self.assertRaises(ValueError):
            codecs.decode_lz(struct.pack("<3H", 1, 0x4241, 0), max_output=4)
        with self.assertRaises(ValueError):
            codecs.decode_lz(b"\x00")


if __name__ == "__main__":
    unittest.main()
