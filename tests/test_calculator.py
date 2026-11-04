"""Independent CRC vectors, public compatibility vectors, and input boundaries."""
import hashlib
import json
from pathlib import Path
import unittest

from rns315_cid import calculate_password, crc7, describe_cid

ROOT = Path(__file__).resolve().parents[1]


class CalculatorTests(unittest.TestCase):
    def test_sd_command_crc_vectors(self):
        self.assertEqual((crc7(bytes.fromhex("4000000000")) << 1) | 1, 0x95)
        self.assertEqual((crc7(bytes.fromhex("48000001AA")) << 1) | 1, 0x87)

    def test_public_compatibility_vectors(self):
        vectors = json.loads((ROOT / "tests" / "public_vectors.json").read_text())
        self.assertGreaterEqual(len(vectors), 2)
        for vector in vectors:
            with self.subTest(vector=vector["name"]):
                actual = bytes.fromhex(calculate_password(vector["cid"]))
                # A failure reports only fingerprints, not card passwords.
                self.assertEqual(hashlib.sha256(actual).hexdigest(), vector["password_sha256"])

    def test_crc_host_placeholder_invariance(self):
        payload = bytes.fromhex("5D53424C32424D31013917CA530104")
        expected = calculate_password(payload)
        for final_byte in range(256):
            self.assertEqual(calculate_password(payload + bytes([final_byte])), expected)

    def test_case_spacing_and_15_byte_form(self):
        cid = "5d53424c32424d31013917ca53010400"
        expected = calculate_password(cid)
        self.assertEqual(calculate_password(" \n" + " ".join(cid[i:i+2] for i in range(0, len(cid), 2)) + "\t"), expected)
        self.assertEqual(calculate_password(cid[:30].upper()), expected)

    def test_normalized_crc_and_end_bit(self):
        detail = describe_cid("5D53424C32424D31013917CA53010400")
        normal = bytes.fromhex(detail.canonical_cid)
        radio = bytes.fromhex(detail.radio_response_cid)
        self.assertEqual(normal[-1], (crc7(normal[:15]) << 1) | 1)
        self.assertEqual(radio[-1], normal[-1] & 0xFE)
        self.assertFalse(detail.supplied_crc_matches)
        self.assertIsNone(describe_cid(normal[:15]).supplied_crc_matches)
        self.assertTrue(describe_cid(normal).supplied_crc_matches)

    def test_invalid_input(self):
        for invalid in ("", "0" * 29, "0" * 31, "0" * 33, "G" * 32, "０" * 32, "<script>" * 4, "0" * 257):
            with self.subTest(length=len(invalid)):
                with self.assertRaises(ValueError):
                    calculate_password(invalid)
        for invalid in (b"", bytes(14), bytes(17)):
            with self.assertRaises(ValueError):
                calculate_password(invalid)
        with self.assertRaises(TypeError):
            calculate_password(None)


if __name__ == "__main__":
    unittest.main()
