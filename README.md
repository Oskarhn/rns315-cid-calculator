# RNS315 · CID calculator and map update guide

Calculate your SD card's password locally and prepare it for a European RNS315. No account, paid password service, changeable CID or SD sniffer is needed.

**[Start here: illustrated step-by-step guide](docs/step-by-step.md)** · **[How I found the solution](docs/project-story.md)** · **[Credits](CREDITS.md)**

![Calculator with a public example CID and its password](docs/images/calculator-desktop.png)

## Quick start

1. On GitHub, select **Code → Download ZIP** and extract the entire archive.
2. Double-click **START.html** to open the calculator.
3. Paste your card's CID and click **Calculate password**. With the ESP32 setup, **Read CID** fills it in automatically.
4. Click **Save CID and password**, then follow the [guide](docs/step-by-step.md) to copy maps, lock the card and update the radio.

The calculator needs no installation or server. Use desktop Chrome or Edge for the optional ESP32 connection.

## What you need

| Item | Purpose |
|---|---|
| 8–32 GB SDHC card, preferably 16 or 32 GB | Store the maps on a single FAT32 partition. |
| Ordinary USB card reader | Copy map files from your computer. |
| Classic ESP32-WROOM-32 / ESP32 DevKit, SD module and jumper wires | Read CID and set the CMD42 card password. |
| RNS315 V12 EU West map package | See [map sources](docs/maps.md). |

The guide uses a full-size MH-SD module with a suitable regulator and level shifting. It accepts full-size SD cards and microSD cards in passive SD adapters. Wire it by the printed pin names, using the [diagram](docs/step-by-step.md#4-connect-the-esp32-and-sd-module).

## The workflow

![Copy maps, calculate the password, lock the card and update the radio](docs/images/workflow.svg)

**Copy maps → read CID → calculate and save the password → lock the card → insert it into RNS315.**

Copy the files before locking the card. CMD42 password locking is different from the physical LOCK switch on an SD adapter. **Open card for PC** removes the calculated RNS315 password when you want to use an ordinary USB reader again.

## Why this project exists

I wanted to update the maps in my Passat's RNS315 without buying a password for every SD card. **Daniel Kučera (danman)** had already demonstrated how to capture the password expected by the radio using an SD sniffer, a logic analyzer and PulseView. His work provided an important starting point.

I handled the equipment, wiring, cards and tests in the car, and used AI as a technical tool for the user-friendly application, coding and difficult firmware analysis. That work recovered the calculation from European RNS315 firmware, so a computer can calculate the password directly from CID. The [project story](docs/project-story.md) explains the process and the [research notes](docs/research.md) document the exact transformation. Danman's [original article](https://blog.danman.eu/updating-rns315-maps-for-fun-and-profit/) is credited for the earlier sniffing work.

## Terminal use

With Python 3.10 or later, from the repository directory:

```text
python -m rns315_cid 5D53424C32424D31013917CA53010400
```

Expected output for this public example:

```text
C99A20843ED7D90B6801E49F2BC80277
```

![Actual calculator command and output in a terminal](docs/images/terminal-calculator.png)

No Python packages are needed. Add `--json` for normalized CID and CRC details. Both 30- and 32-character input are accepted; the calculator rebuilds CRC7 automatically.

## Source and verification

The browser calculator, Python calculator, ESP32 program, firmware decoder, public test data and documentation are included. There is no hidden calculation or remote API.

```text
python -m unittest discover -s tests -v
node web/test.cjs
node tests/test_serial.cjs
```

The tests cover public CID/password vectors, independent CRC and MD5 checks, invalid input and serial framing. [Developer notes](docs/development.md) describe the program and ESP32 build. [Research reproduction](research/reproduce.md) explains how to repeat the firmware decoding with your own source file.

## Supported system and maps

This project targets **European RNS315**. Firmware 0270 is the analyzed source, not a requirement for running the calculator. RNS310, RNS510, Discover Media/Pro and other regions use different formats or procedures.

Map data and radio firmware are not included. See [V12 EU West sources](docs/maps.md) for an Italian map-package page and an alternative with a prepared SD card.

## License

[MIT](LICENSE) for the project's own code and illustrations. Map data, firmware and third-party tools retain their own licenses. See [CREDITS.md](CREDITS.md).
