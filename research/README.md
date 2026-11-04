# Reproduce the static decoding

The calculator itself does not require firmware, Ghidra or extra Python packages. These optional research steps reproduce how the firmware was unpacked.

Supply a local ISO on disk. The parser accepts only the exact 40,540,160-byte EU 1508/0270 image whose SHA-256 is documented in [research notes](../docs/technical-analysis.md).

From the repository root:

```text
python research/decode_update.py /path/to/VW_EU_RNS315_1508-0270.iso
```

The pipeline uses Python's standard library. It validates the source hash, reads ISO9660 extents without mounting the image, parses the observed DAT records, checks all program-frame checksums, and reconstructs the program segments and resource pages. It does not flash, mount, execute or contact a device.

Generated data goes under `research/private-artifacts/`; logs and manifests go under `research/evidence/`. Both directories are ignored by Git. Repeated runs preserve fixed extracted inputs unless they are byte-identical; later generated reports may be updated.

Expected result for this image:

- 30 program payload frames decoded, with no program-decoding errors.
- Two analysis-only ELF wrappers containing 17,915,032 and 1,245,686 decoded payload bytes, respectively.
- 15 resource containers decoded. Two other resource end offsets exceed their outer payload by one and two bytes; the pipeline reports those gaps and does not invent missing data.

The research scripts support this one observed package layout. Unknown record types, different hashes and invalid references stop the relevant parser. The scope is deliberately narrower than a generic firmware extractor.

## Optional native analysis

Import the generated `analysis-record-0058.elf` in Ghidra using Blackfin little-endian 32-bit language support. The investigation used Ghidra 12.1.4, JDK 21.0.10 and [geepot/ghidra-blackfin](https://github.com/geepot/ghidra-blackfin) commit `f417b090cda3e04fa17a8843f0fc9001c7804053`. Build/install that dependency according to its own instructions and license; the repository does not bundle it.

The ELF wrappers are manufactured carriers for analysis. They preserve decoded load addresses, but their RWX permissions are not a statement about the radio's actual memory permissions. Do not attempt to flash or boot the wrappers.

Useful recovered addresses are listed in [docs/technical-analysis.md](../docs/technical-analysis.md). Start with `0x17C158` and the descriptor at `0x236A60` when inspecting the password transformation.

## Optional bounded PC emulation

`scripts/generate_emulation_vectors.py` generates two public and eight synthetic inputs in the ignored evidence directory. It does not read a private card-password record.

```text
python research/scripts/generate_emulation_vectors.py
```

With the exact analysis ELF imported and Blackfin language support installed, run `ghidra/BlackfinPasswordEmulation.java` in Ghidra with the generated vector-JSON path and a result-JSON path as its two arguments. The script checks the ELF hash, limits vectors and instruction steps, initializes scratch memory, and interprets the actual function at `0x17C158`. It does not use native firmware execution or host device callbacks.

The original verification used Ghidra 12.1.4 and the processor-module commit above. The expected result is ten matches, return value 17 and length byte 16. This validates the pure password routine on the supplied CID representation; it does not emulate a physical SD card or radio installation.
