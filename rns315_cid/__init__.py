"""Offline CID password calculation for the recovered European RNS315 profile."""
from .calculator import calculate_password, crc7, describe_cid

__version__ = "1.1.1"
__all__ = ["calculate_password", "crc7", "describe_cid"]
