# How I found the solution

I started this because I wanted new maps on my Passat's RNS315. Copying the files wasn't enough: the radio expected a password tied to the SD card. I wanted to understand that part and make the process easier for the next person.

I got the equipment, wired the SD module and ESP32, and did the practical work with the cards and radio. **I've now made two SD cards and checked that both work in my RNS315.** I also checked publicly posted CID/password pairs, and I had a password I'd already bought for my own card to compare against.

I used AI to help build the app, write and check code, and work through the harder firmware decoding and analysis. I handled the equipment and in-car experiments. The code and explanation are here so other owners can follow the same process and improve it.

## Start with the card's identity

An SD card's CID contains information such as its manufacturer, product name and serial number. It belongs to the card's electronics. Copying files to another card therefore does not copy CID.

RNS315 reads CID and calculates a password for that card. The card must be prepared with the same password through **CMD42**, allowing the radio to unlock it. That explains why copying map files alone is insufficient and why a password for one CID does not work for an arbitrary different card.

## Danman's experiment showed where the answer went

[Daniel Kučera (danman)](https://blog.danman.eu/updating-rns315-maps-for-fun-and-profit/) had demonstrated that the password travels in SD traffic. An SD sniffer and logic analyzer let him capture the value the radio tried to use. An ESP32 could then set the card password.

That gave us somewhere to start. Capturing traffic gets the answer for one card, but I wanted a calculator that could work with another CID too. Finding the rule meant looking inside the radio's firmware.

## From an update package to readable code

The analysis used a local **EU1508/0270** update. Its ISO contained a DAT file with several types of update records.

1. Record boundaries and checksums were mapped so program streams could be separated from other data.
2. The byte order within 16-bit words had to be handled before the content made sense as Blackfin code.
3. Program frames used LZ packing. Some also had an RC4-based masking layer.
4. A 256-byte metadata record supplied the RC4 key. The decoder could then reconstruct the program content and verify its frames.
5. The readable code could be traced from the SD driver and CID to the password transformation, then to CMD42.

The decoder and supporting tools are under [research](../research/README.md). Firmware and decoded proprietary programs are not bundled. Source identities, packing formats and steps are documented so someone with the same source file can repeat the work.

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

## Checking that it worked

I checked the method on the two SD cards, compared the results with public CID/password pairs, and checked the calculator against the password I'd bought. All ten public examples match. A bounded emulator also ran the recovered firmware function, and the Python and JavaScript versions are tested separately against public values and known CRC/MD5 results. The [test results](tested-results.md) give the details.

My own card values stay private. The rule, constants, code and public examples are all included, so you can check how it works without relying on an online password service.

Further details: [addresses and source hashes](technical-analysis.md), [repeat the decoding](../research/README.md) and [public comparison data](public-test-vectors.md).
