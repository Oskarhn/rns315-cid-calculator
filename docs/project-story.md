# How I found the solution

I wanted to update the maps in my Passat's RNS315 and understand why an SD card with the right files still needed a separate password. The project grew into an open workflow that other owners could follow without repeating the research or paying for each card password.

I sourced the equipment, wired the SD module and ESP32, handled the cards and carried out the tests on the physical radio. I also bought a password for my own card, which provided a concrete comparison value while the calculation was being recovered. Photos, screen messages and feedback from those practical steps helped connect the analysis to the hardware.

I used AI as a technical tool along the way: for the user-friendly application, code generation and checking, and difficult firmware decoding and analysis. I handled the practical work, equipment, goals and in-car experiments. This repository brings that work together into something others can inspect, use and improve.

## Start with the card's identity

An SD card's CID contains information such as its manufacturer, product name and serial number. It belongs to the card's electronics. Copying files to another card therefore does not copy CID.

RNS315 reads CID and calculates a password for that card. The card must be prepared with the same password through **CMD42**, allowing the radio to unlock it. That explains why copying map files alone is insufficient and why a password for one CID does not work for an arbitrary different card.

## Danman's experiment showed where the answer went

[Daniel Kučera (danman)](https://blog.danman.eu/updating-rns315-maps-for-fun-and-profit/) had demonstrated that the password travels in SD traffic. An SD sniffer and logic analyzer let him capture the value the radio tried to use. An ESP32 could then set the card password.

That was an important starting point. A capture gives the answer for a particular card; a calculator needs the rule for other CIDs too. The next stage therefore examined the radio's firmware.

## From an update package to readable code

The analysis used a local **EU1508/0270** update. Its ISO contained a DAT file with several types of update records.

1. Record boundaries and checksums were mapped so program streams could be separated from other data.
2. The byte order within 16-bit words had to be handled before the content made sense as Blackfin code.
3. Program frames used LZ packing. Some also had an RC4-based masking layer.
4. A 256-byte metadata record supplied the RC4 key. The decoder could then reconstruct the program content and verify its frames.
5. The readable code could be traced from the SD driver and CID to the password transformation, then to CMD42.

The decoder and supporting tools are under [research](../research/reproduce.md). Firmware and decoded proprietary programs are not bundled. Source identities, packing formats and steps are documented so someone with the same source file can repeat the work.

## The calculation

For the analyzed European profile:

1. Take the first **15 CID bytes**. Calculate SD CRC7 with polynomial `0x09`, initial value zero, most-significant bit first.
2. Construct 16 bytes: the 15 CID bytes followed by **`CRC7 << 1`**, with the final end bit cleared.
3. Read four **big-endian unsigned 32-bit words**.
4. Add these constants respectively, wrapping modulo 2³²:

   ```text
   A552F5E8  73935351  9077FADF  C4012483
   ```

5. Serialize the four results as **little-endian** bytes.
6. Calculate standard **MD5** over those 16 bytes. The 16 digest bytes are the card password.

This is why plain `MD5(CID)` gives the wrong answer: CRC handling, the additions and byte order matter. MD5 here reproduces an existing radio format.

## Checks and the open result

The result was compared with the password bought for the project's card and with published CID/password pairs. A bounded emulator also ran the recovered firmware function. The calculator has separate Python and JavaScript implementations, tested against public values and independent CRC/MD5 checks.

My private card values stay private. The rule, constants, programs, verification method and public comparison data are open. Others can review the code, repeat the analysis and improve the tool without a hidden online service.

Further details: [addresses and source hashes](research.md), [repeat the decoding](../research/reproduce.md) and [public comparison data](additional-public-vectors.md).
