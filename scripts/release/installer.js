/* ASVS 1.2.1, 2.2.1, 15.2.5: fixed, hash-checked images; text-only status;
 * explicit user action; classic ESP32 only; no full-chip erase or auto-retry. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  let ready = false, busy = false, images = [];
  function refresh() { $("install-button").disabled = !ready || busy || !$("install-confirm").checked; $("install-confirm").disabled = busy; }
  function log(text) { $("install-log").textContent = ($("install-log").textContent + String(text) + "\n").slice(-16000); }
  function status(text) { $("install-state").textContent = text; }
  async function verifyImages() {
    const firmware = window.Rns315Firmware;
    const addresses = [0x1000, 0x8000, 0xe000, 0x10000];
    if (!firmware || firmware.chip !== "ESP32" || firmware.files.length !== addresses.length) throw new Error("The included ESP32 program is incomplete. Download the release again.");
    const verified = [];
    for (let i = 0; i < addresses.length; i++) {
      const file = firmware.files[i];
      if (file.address !== addresses[i] || !/^[a-f0-9]{64}$/.test(file.sha256) || file.base64.length > 1500000) throw new Error("Invalid program file. Download the release again.");
      const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0));
      if (!bytes.length || bytes.length > 1048576 || bytes.length !== file.size) throw new Error("Invalid program size. Download the release again.");
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
      if (digest !== file.sha256) throw new Error("A program file failed its integrity check. Download the release again.");
      verified.push({data: bytes, address: file.address});
    }
    return verified;
  }
  $("install-confirm").addEventListener("change", refresh);
  $("install-button").addEventListener("click", async () => {
    if (!ready || busy || !$("install-confirm").checked) return;
    busy = true; refresh(); $("install-progress").hidden = false; $("install-progress").value = 0;
    let transport = null;
    try {
      // requestPort stays directly on the click path to preserve user activation.
      const port = await navigator.serial.requestPort();
      const api = window.Rns315FlashLibrary;
      transport = new api.Transport(port, true);
      const loader = new api.ESPLoader({transport, baudrate:115200, terminal:{clean(){ $("install-log").textContent=""; }, write:log, writeLine:log}, debugLogging:false});
      status("Connecting… If this keeps trying, hold BOOT until the chip is detected.");
      await loader.main();
      if (loader.chip?.CHIP_NAME !== "ESP32") throw new Error("This program is for a classic ESP32-WROOM-32 / ESP32 DevKit. No firmware was written to this chip.");
      if (loader.secureDownloadMode) throw new Error("This board is in secure download mode. Installation stopped before writing firmware.");
      const flashSize = await loader.detectFlashSize();
      const capacity = /^(\d+)MB$/.exec(flashSize || "");
      if (!capacity || Number(capacity[1]) < 4) throw new Error("This package needs a classic ESP32 with at least 4 MB of detected flash. Installation stopped before writing firmware.");
      status("Installing and checking the program. Keep USB connected…");
      await loader.writeFlash({fileArray:images, flashMode:"keep", flashFreq:"keep", flashSize, eraseAll:false, compress:true,
        calculateMD5Hash:data=>window.Rns315Calculator.md5Hex(data).toLowerCase(),
        reportProgress:(index,written,total)=>{ $("install-progress").value = Math.min(99, ((index + (total ? written/total : 0))/images.length)*100); }
      });
      try { await loader.after("hard_reset"); } catch (error) { log("Program verified; reconnect USB to restart the board. " + error.message); }
      $("install-progress").value = 100;
      status("Program installed and verified. Unplug USB, insert the SD card, reconnect USB and open the calculator.");
    } catch (error) {
      log(error instanceof Error ? error.message : String(error));
      status(error?.name === "NotFoundError" ? "No port selected. You can try again when the ESP32 is connected." : (error instanceof Error ? error.message : "Installation stopped. Check the cable and connection, then try again."));
    } finally {
      if (transport) { try { await transport.disconnect(); } catch (error) { log("Reconnect USB before continuing. " + error.message); } }
      busy = false; $("install-confirm").checked = false; refresh();
    }
  });
  window.addEventListener("beforeunload", event => { if (busy) { event.preventDefault(); event.returnValue=""; } });
  if (!("serial" in navigator)) { status("Open this installer in desktop Chrome or Edge to access the ESP32 USB port."); return; }
  verifyImages().then(files=>{ images=files; ready=true; status("Program files checked. Confirm the empty SD socket, then choose Install program."); refresh(); }).catch(error=>{status(error.message);});
})();
