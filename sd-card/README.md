# SD card tools

This folder holds the ESP32 side of the setup. It reads the card's CID and handles CMD42 password locking; the calculator runs on your computer.

- **Windows:** connect the ESP32 with its SD socket empty, then double-click [flash-esp32.cmd](flash-esp32.cmd).
- **Other systems or an existing PlatformIO install:** from the repository root, run `python -m platformio run -d sd-card/esp32 -t upload`.

The program lives in [esp32/src/card-tool.cpp](esp32/src/card-tool.cpp). Its board and build settings are in [esp32/platformio.ini](esp32/platformio.ini).

Follow the [map update guide](../docs/update-maps.md#4-connect-the-esp32-and-sd-module) for wiring, reading CID and locking the card. Unplug USB before changing wires or moving the card.
