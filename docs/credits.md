# Credits and sources

## Daniel Kučera · danman

Special thanks to **Daniel Kučera (danman)** for [Updating RNS315 maps for fun and profit](https://blog.danman.eu/updating-rns315-maps-for-fun-and-profit/). He demonstrated capturing the password expected by RNS315 from SD traffic with an SD sniffer, an FT2232H-based logic analyzer and PulseView, then using an ESP32 for card password operations.

His article and [danielkucera/esp32-sdcard](https://github.com/danielkucera/esp32-sdcard) provided valuable protocol context. **This calculator is an independent implementation of the calculation recovered from firmware.** The original sniffing article did not publish a general CID-to-password calculation.

## Other prior work and tools

- [corecode/sdlock](https://github.com/corecode/sdlock): another description and implementation of SD password operations for RNS315.
- [Ghidra](https://github.com/NationalSecurityAgency/ghidra): firmware analysis.
- [geepot/ghidra-blackfin](https://github.com/geepot/ghidra-blackfin): the Blackfin processor module used for analysis. Its GPL license is separate; the module is not bundled.
- [angr/pypcode](https://github.com/angr/pypcode): static decoding with that processor specification.
- [TudorGruian/vw_mmc-tools](https://github.com/TudorGruian/vw_mmc-tools) and the forum posts listed in [public vectors](public-test-vectors.md): published comparison values.
- Volkswagen/TechniSat: the legacy RNS315 format being analyzed. This is an independent project, with no affiliation to Volkswagen.

## Images

Calculator screenshots use a public example CID. Terminal screenshots show the project's commands and their output. Wiring, file layout and radio screens are original illustrations, with arrows and labels where useful. Radio screens illustrate the choices to look for; they are not photographs from a car. Wording and layout vary by language and software version.

Private card identities, password records and vehicle reports are not used as examples.
