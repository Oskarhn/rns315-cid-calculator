"""Run the source-only, static firmware reconstruction pipeline.
ASVS 5.3.2: fixed scripts and generated log paths, no shell interpolation.
"""
from pathlib import Path
import argparse
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("iso", type=Path, help="Locally supplied EU 1508/0270 ISO with the documented SHA-256")
    args = parser.parse_args()
    iso = args.iso.resolve(strict=True)
    if not iso.is_file():
        parser.error("ISO must be a regular file")
    evidence = ROOT / "evidence"
    evidence.mkdir(exist_ok=True)
    stages = [
        ("extract_iso.py", [str(iso)]),
        ("unpack_update_records.py", []),
        ("prepare_program_streams.py", []),
        ("inspect_program_frames.py", []),
        ("decode_program_streams.py", []),
        ("extract_resources.py", []),
        ("build_analysis_elf.py", []),
    ]
    for script, extra in stages:
        log = evidence / (Path(script).stem + ".log")
        with log.open("w", encoding="utf-8") as output:
            subprocess.run([sys.executable, str(ROOT / "scripts" / script), *extra], stdout=output, stderr=subprocess.STDOUT, check=True, timeout=120)
        print("Completed " + script)
    programs = json.loads((evidence / "decoded-programs.json").read_text())
    resources = json.loads((evidence / "resource-extraction-validated.json").read_text())
    summary = {
        "program_payload_frames_decoded": sum(f["status"] == "decoded" for p in programs for f in p["frames"]),
        "program_decode_failures": sum(f["status"] == "failed" for p in programs for f in p["frames"]),
        "resources_decoded": resources["resources_decoded"],
        "resource_boundary_gaps": resources["errors"],
        "firmware_executed": False,
        "radio_or_card_accessed": False,
    }
    (evidence / "pipeline-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
