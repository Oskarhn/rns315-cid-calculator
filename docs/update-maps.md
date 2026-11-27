# Update RNS315 maps, step by step

I've used this method to make two SD cards that work with the European RNS315 in my 2011 Volkswagen Passat B7. Here's the process: copy the maps, set the card password, then put the card in the radio. The pictures and terminal examples show what to look for at each step.

If you'd like to see the checks behind the calculator first, they're in [the test results](tested-results.md).

![Workflow](images/map-update-overview.svg)

## 1. Download and open the tool

1. Download **[RNS315-Easy-Start.zip](https://github.com/Oskarhn/rns315-cid-calculator/releases/latest/download/RNS315-Easy-Start.zip)**.
2. Choose **Extract All**. Keep the extracted files together; don't open them inside the ZIP preview.
3. Double-click **START-HERE.html** and choose **Open calculator**. Use desktop Chrome or Edge for the ESP32 USB connection.

The release includes the calculator, guide and ESP32 program. They work offline, and you don't need Python or terminal commands.

## 2. Get the right maps

Use **RNS315 V12 EU West / Western Europe**, also called **EUR_W_V12**. This package includes Norway. [Map sources](map-downloads.md) includes an Italian page for the package and a prepared-card alternative.

Check that your radio is RNS315: hold **SETUP** for about ten seconds and open **Versions**. You do not need to update the radio firmware to run this calculator.

## 3. Copy maps to the SD card

Prefer a **16 or 32 GB SDHC card**, with one **FAT32 partition in MBR**, preferably using **32 KiB clusters**. Back up anything you want to keep before formatting. Formatting deletes files on the selected card; check its capacity and drive letter carefully.

1. Put the card in an ordinary USB reader.
2. Extract the map archive on your computer.
3. Copy **navpsf_update** directly into the card's root directory.
4. Open that folder on the card. It should contain **files.md5**, **version.txt** and the map files.
5. Safely eject the card in your operating system.

![Correct folder layout](images/sd-card-folders.svg)

**Correct:** `SD card/navpsf_update/files.md5`

**Wrong:** `SD card/V12/navpsf_update/files.md5`

Copy the whole extracted package without changing filenames. Do not copy the ZIP/RAR archive itself or change the card's CID.

### Could my computer's own SD slot do the next part?

Possibly. A compatible native SD/MMC reader and the right software can take the place of ESP32. I haven't tested that route myself, so the steps below follow the ESP32 setup I've used. See [native SD reader notes](native-sd-readers.md) before buying hardware. A built-in slot isn't automatically compatible, and a passive microSD-to-SD adapter isn't the same thing as a USB reader.

## 4. Connect the ESP32 and SD module

Use a **classic ESP32-WROOM-32 / ESP32 DevKit**, a USB data cable, six jumper wires and an SD module. This wiring uses a **full-size MH-SD module with a labeled 5V input, a 3.3 V regulator and suitable SPI level shifting**.

**Unplug USB before changing wires or moving the card.** Follow the printed pin names, not their physical position: ESP32 boards have different layouts.

![Labeled wiring diagram](images/esp32-sd-wiring.svg)

| SD module | ESP32 |
|---|---|
| GND | GND |
| 5V | 5V / VIN from USB |
| CS | GPIO27 |
| MOSI | GPIO23 |
| SCK / CLK | GPIO18 |
| MISO | GPIO19 |
| 3V3 | Leave disconnected on this 5V module |

**Never feed 5 V into a bare SD card or a 3.3 V-only module.** If your module only has a 3V3 input, use its specified 3.3 V supply and follow its documentation. ESP32 signal pins use 3.3 V.

Keep the wires short. On modules with two pins per label, use one row consistently and check the labels. An SCK wire shifted by one position is easy to miss.

## 5. Install the ESP32 program

Do this once. Leave the SD socket empty while programming.

1. From **START-HERE.html**, choose **Install ESP32 program**. You can also open **Install-ESP32.html** directly.
2. Connect the ESP32 using a USB data cable, with the SD socket empty.
3. Check the box confirming that the socket is empty and you want to replace the ESP32's current program.
4. Click **Install program** and select the ESP32's serial port in the browser dialog.
5. Keep USB connected while the program is installed and verified.

If several microcontrollers are connected, disconnect the others first. Close other serial monitors. If uploading stops at **Connecting**, hold **BOOT** until the connection starts, then release it. Do not hold BOOT during normal use afterwards.

**Expected final message:** **Program installed and verified.** Unplug USB, insert the prepared SD card into the module, then reconnect USB.

The installer accepts a classic ESP32 with at least 4 MB of flash. It stops before writing if it detects another chip family or secure download mode. For building or flashing from source, see [the developer instructions](development.md).

## 6. Read CID and save the password

1. From **START-HERE.html**, choose **Open calculator** in Chrome or Edge.
2. Click **Connect ESP32** and select its serial port in the browser's dialog.
3. The tool reads CID and calculates the password. **Read CID** refreshes it when needed.
4. Click **Save CID and password**.
5. Check that **rns315-card-password.txt** was saved in your downloads folder. Keep it on your computer.

![Calculator showing the public example and save button](images/calculator-example.png)

The screenshot uses a public example. **Your card has its own CID and password.** If you already read CID with another tool, paste it into the calculator and click **Calculate password**.

## 7. Lock the card

1. Check the box confirming that the maps are copied and you have saved CID and password.
2. Click **Lock card for RNS315** and confirm.
3. Wait for **Card is locked**. Technical status shows `LOCK_VERIFIED`, followed by a fresh status read.
4. Click **Disconnect**, unplug USB and wait ten seconds. Leave the card in the module.
5. Reconnect USB, choose **Connect ESP32**, and check that the card is still reported as locked after power was removed.
6. Disconnect again and unplug USB before removing the card.

![Expected technical output after locking](images/expected-card-status.svg)

This is an expected-output example. After locking, an ordinary USB reader may report an inaccessible card. Do not format it. The physical LOCK switch does not perform CMD42 password locking.

## 8. Update the radio

1. Park the car and maintain stable power during installation. Use appropriate battery support for a long session; never run an engine in an enclosed space.
2. Insert the card into RNS315 and wait about ten seconds.
3. If prompted to **Assign** the card, select that option. Read the dialog: the card becomes associated with the unit.
4. Look for **EU West V12 / EUR_W_V12** in the map information.
5. Choose **Install** to copy maps into the radio. **Use SD** uses the maps directly from the card, which must remain inserted.
6. Wait for completion. Allow plenty of time: a full installation can take around two hours or more. Do not remove the card or force a reset during copying.
7. Open **Navigation database / Versions** and check the installed V12 version. Use **Remove SD card** in the radio menu before physically removing it.

![Illustrated radio choices](images/rns315-installation.svg)

*Radio screens are illustrations. Labels and appearance vary with language and software version.*

With normal shutdown, map installation can continue when the radio is switched on again. Keep the same card inserted and its contents unchanged between sessions. Follow the message on your screen; normal shutdown and a forced reset are different operations. See the [owner's manual](https://manualzilla.com/doc/5919683/rns-310--rns-315).

## Open the card on a computer again

1. Eject it through the radio menu and wait for confirmation.
2. With ESP32 unplugged, insert the card into its SD module. Connect USB.
3. Open the calculator and click **Connect ESP32**. CID and the calculated password appear.
4. Save the password, check the confirmation box and click **Open card for PC**.
5. Wait for **Card is open** / `PASSWORD_CLEAR_VERIFIED`.
6. Disconnect and unplug USB before moving the card into your USB reader.

This uses the password calculated for that CID. It will not open a card locked with a different custom password. To prepare it for RNS315 again, repeat the locking step.

## Troubleshooting

| What you see | What to do |
|---|---|
| No ESP32 in the port list | Try a USB data cable, check its USB driver and close other programs using the port. |
| CMD0 or CID read error | Unplug USB. Check power, GND and SCK/MISO/MOSI/CS wiring. |
| ESP32 connected but no response | Check that this repository's program is installed. Reconnect without holding BOOT. |
| Card does not support password commands | Use an SDHC card with CMD42 support. Capacity or brand alone does not guarantee support. |
| Card remains locked after a power cycle | That is the expected state before moving it to RNS315. |
| SD error in the radio | Check the RNS315 map format, folder layout and password for the actual card's CID. |

You do not need an SD sniffer for this workflow. The [earlier sniffing work is credited here](credits.md).
