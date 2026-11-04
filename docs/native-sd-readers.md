# Can I use my computer's SD slot instead of an ESP32?

**Possibly, if it gives you direct SD/MMC access and you have compatible password-locking software.** An SD slot built into a computer is worth checking before buying more hardware, but the slot alone isn't enough.

**I haven't tested this native-reader route myself. My two working card tests used ESP32.** This page documents what I found in other projects and how to check whether your computer might be suitable.

## What the research shows

[TudorGruian's vw_mmc-tools](https://github.com/TudorGruian/vw_mmc-tools) reports Passat B7/RNS315 tests on Ubuntu and openSUSE, using `/dev/mmcblk0` and `lock_sd`. Its guide also notes kernel requirements for unlocking again.

In the comments under [danman's RNS315 article](https://blog.danman.eu/updating-rns315-maps-for-fun-and-profit/), a reader describes doing this with a laptop's PCI card reader and modified Ubuntu. Danman confirms that this route needs the right reader and kernel support. His later [Linux CMD42 patch](https://www.spinics.net/lists/linux-mmc/msg80514.html) shows password operations through the MMC ioctl interface. These are specific software setups; they don't establish compatibility with every current laptop or operating system.

That supports the conclusion that **a suitable PC setup can replace the ESP32**. Whether your particular reader and software can do it still needs checking.

## What the reader must support

There are two separate jobs:

1. Read the card's actual **CID**.
2. Set and check its **CMD42 password lock**, with a way to access the locked card again later.

Reading CID solves the calculation step. It doesn't prove that the same reader and driver can lock or unlock the card. Linux documents CID as a [read-only SD/MMC device attribute](https://www.kernel.org/doc/html/latest/driver-api/mmc/mmc-dev-attrs.html), while password commands need additional software and driver support.

The key distinction is **native SD/MMC access versus USB mass storage**. A native host, often PCI/PCIe-based in a laptop, is the usual starting point. A built-in slot can still be connected through USB internally. Windows also has separate [native SD and USB storage driver stacks](https://learn.microsoft.com/en-us/windows-hardware/drivers/sd/sd-card-driver-stack), so being able to copy files in Explorer doesn't establish raw SD-command support.

## Does a microSD-to-SD adapter matter?

A normal **passive microSD-to-full-size-SD adapter** just lets the card fit the slot. It is different from a USB card reader and doesn't by itself rule out this route. Kingston documents using microSD cards in full-size SD slots through the supplied adapter in its [Flash Memory Guide](https://media.kingston.com/pdfs/MKF_283.1_Flash_Memory_Guide_EN.pdf).

So the rule isn't "no adapter." What matters is the reader's connection and the software's access to the card commands.

## Check the interface on Linux

These commands only inspect the system and read card information. They don't lock, format or change the card.

1. Insert the card and list storage devices:

   ```text
   lsblk -o NAME,SIZE,TYPE,TRAN,MODEL
   ```

2. Identify the removable card by its capacity and by what appears when you insert it. A native card may appear as `/dev/mmcblk0`, `/dev/mmcblk1` or another number. `/dev/sdb`-style USB storage doesn't expose the same native MMC interface.

3. Check the selected device's type and CID. **The name below is only an example; replace it with your card's device.** A computer's internal eMMC storage can also have an `mmcblk` name, so don't assume the first one is your card.

   ```text
   cat /sys/block/mmcblk0/device/type
   cat /sys/block/mmcblk0/device/cid
   ```

   For an SD card, the type should be `SD`, and CID is a hexadecimal value. Internal eMMC usually reports `MMC`.

4. Paste the CID into the calculator, or pass it to `python -m rns315_cid`.

If the CID file is missing or inaccessible, you haven't established a usable native interface. If CID can be read, that's a useful first check, but CMD42 still needs separate verification.

## Using the calculator with this route

You can calculate the password from any correctly read CID. The browser's **Connect ESP32**, **Read CID** and locking buttons specifically control the included ESP32 program; they don't control a computer's built-in SD reader.

Completing the native route needs a compatible external CMD42 tool and a driver/kernel combination that supports the required operations. Check its password format: the calculator displays **16 binary bytes as 32 hexadecimal characters**, not a 32-byte text password. Older guides often change CID to a fixed value; this calculator uses your card's existing CID, so don't copy their fixed CID or password.

For the walkthrough I've used on my own cards, follow the [ESP32 steps](update-maps.md#4-connect-the-esp32-and-sd-module). The native reader is an alternative to investigate, not a feature implemented by this repository's browser controls.
