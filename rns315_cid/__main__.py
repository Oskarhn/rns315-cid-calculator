"""Command-line interface; all calculation stays on the local computer."""
import argparse
import json
from . import __version__, calculate_password, describe_cid


def main() -> None:
    parser = argparse.ArgumentParser(description="Offline European RNS315 SD-card CID password calculator")
    parser.add_argument("cid", help="30 or 32 hexadecimal characters; whitespace is allowed")
    parser.add_argument("--json", action="store_true", help="Include normalized CID and CRC details in JSON")
    parser.add_argument("--version", action="version", version=__version__)
    args = parser.parse_args()
    try:
        password = calculate_password(args.cid)
        if args.json:
            print(json.dumps({"profile": "EU RNS315 / recovered 0270", **describe_cid(args.cid).to_dict(), "password_hex": password}, indent=2))
        else:
            print(password)
    except (ValueError, TypeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
