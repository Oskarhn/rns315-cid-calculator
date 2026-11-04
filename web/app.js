/* ASVS 1.2.1 / 14.3.3: text-only rendering; no network, cookies or browser storage. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const api = window.Rns315Calculator, input = $("cid-input");
  let connection = null, card = null, busy = false, currentResult = null;
  function refreshButtons() {
    const connected = !!connection?.port;
    $("connect-button").disabled = busy || connected || !("serial" in navigator);
    $("disconnect-button").disabled = busy || !connected;
    $("read-button").disabled = busy || !connected;
    const matching = !!card && !!currentResult && currentResult.cid === api.describeCid(card.cid).canonicalCid;
    const ready = !busy && connected && matching && card.passwordClass && $("prepared-check").checked;
    $("lock-button").disabled = !ready || card.locked;
    $("unlock-button").disabled = !ready || !card.locked;
    for (const id of ["cid-input", "calculate-button", "clear-button", "example-button"]) $(id).disabled = busy;
  }
  function edited() {
    currentResult = null; $("result-panel").hidden = true;
    $("password-output").value = ""; $("error-message").textContent = ""; $("status-message").textContent = "";
    input.removeAttribute("aria-invalid"); $("cid-count").textContent = input.value.replace(/\s/g, "").length + " / 32 characters";
    $("prepared-check").checked = false; refreshButtons();
  }
  function calculate() {
    $("error-message").textContent = "";
    try {
      const detail = api.describeCid(input.value), password = api.calculatePassword(input.value);
      currentResult = {cid: detail.canonicalCid, password};
      $("password-output").value = password; $("cid-normalized").textContent = detail.canonicalCid;
      $("crc-note").textContent = "CRC is calculated automatically. You do not need to edit the last byte.";
      $("result-panel").hidden = false; input.removeAttribute("aria-invalid");
      $("status-message").textContent = "Your password is ready. Save it before locking the card.";
      refreshButtons();
      return currentResult;
    } catch (error) { currentResult = null; $("result-panel").hidden = true; $("password-output").value = ""; input.setAttribute("aria-invalid", "true"); $("error-message").textContent = error.message; input.focus(); return null; }
  }
  input.addEventListener("input", edited);
  $("cid-form").addEventListener("submit", event => { event.preventDefault(); calculate(); });
  $("clear-button").addEventListener("click", () => {input.value = ""; edited(); input.focus();});
  $("example-button").addEventListener("click", () => { input.value = "5D53424C32424D31013917CA53010400"; edited(); calculate(); });
  $("copy-button").addEventListener("click", async () => {
    const password = $("password-output").value; if (!password) return;
    try { await navigator.clipboard.writeText(password); if (password === $("password-output").value) $("status-message").textContent = "Password copied."; }
    catch (_) { if (password !== $("password-output").value) return; $("password-output").focus(); $("password-output").select(); $("status-message").textContent = "Password selected. Press Ctrl+C (⌘C on Mac)."; }
  });
  $("save-button").addEventListener("click", () => {
    if (!currentResult) return;
    const data = new Blob(["RNS315 SD card\nCID=" + currentResult.cid + "\nPASSWORD_HEX=" + currentResult.password + "\nPassword is 16 binary bytes shown as hex.\n"], {type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(data), a = document.createElement("a"); a.href = url; a.download = "rns315-card-password.txt"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("status-message").textContent = "Password file sent to downloads. Check that it was saved.";
  });
  function line(text) { const log = $("serial-output"); log.textContent = (log.textContent + text + "\n").slice(-12000); }
  async function action(fn) {
    if (busy) return; busy = true; refreshButtons(); $("device-message").textContent = "";
    try { await fn(); }
    catch (error) { card = null; $("prepared-check").checked = false; $("card-state").textContent = "Read CID again to check the card status."; $("device-message").textContent = error.message; }
    finally { busy = false; refreshButtons(); }
  }
  async function readCard(fill = true) {
    const report = await connection.query("READ", /^END_READONLY_REPORT OK$/);
    card = window.Rns315Serial.parseReport(report);
    if (fill) {input.value = card.cid; edited(); calculate();}
    $("card-state").textContent = "Card read. " + (card.locked ? "Card is locked." : "Card is open for PC.");
    return card;
  }
  $("connect-button").addEventListener("click", () => action(async () => {
    const candidate = new window.Rns315Serial.Connection(line, () => {connection = null; card = null; $("card-state").textContent = "ESP32 disconnected."; refreshButtons();});
    try { await candidate.open(navigator.serial); connection = candidate; await readCard(); }
    catch (error) {await candidate.close(); connection = null; throw error;}
  }));
  $("disconnect-button").addEventListener("click", () => action(async () => { await connection.close(); connection = null; card = null; $("card-state").textContent = "Disconnected. Unplug USB before moving the card."; }));
  $("read-button").addEventListener("click", () => action(() => readCard()));
  $("prepared-check").addEventListener("change", refreshButtons);
  async function changePassword(operation) {
    const saved = currentResult;
    if (!saved || !$("prepared-check").checked) throw new Error("Calculate and save the password, then confirm that the maps are copied.");
    await readCard(false);
    if (saved.cid !== api.describeCid(card.cid).canonicalCid) throw new Error("The calculator CID belongs to another card. Read CID and save the correct password first.");
    const prompt = operation === "LOCK" ? "Lock this card for RNS315? An ordinary USB reader will not be able to open it until the password is removed." : "Remove the RNS315 password from this card? You can then open it with an ordinary USB reader.";
    if (!window.confirm(prompt)) return;
    // ASVS 15.4.2: firmware rechecks this CID immediately before CMD42.
    const prepared = await connection.query("PREPARE " + operation + " " + card.cid + " " + saved.password, /^PREPARED (LOCK|CLEAR) TOKEN=[0-9A-F]{8}/);
    const token = /TOKEN=([0-9A-F]{8})/.exec(prepared)?.[1];
    if (!token) throw new Error("ESP32 did not prepare the operation.");
    await connection.query("COMMIT " + token, operation === "LOCK" ? /^LOCK_VERIFIED$/ : /^PASSWORD_CLEAR_VERIFIED$/, 15000);
    await readCard(false); $("prepared-check").checked = false;
    if (card.locked !== (operation === "LOCK")) throw new Error("Unexpected lock status. Keep your password file and check status again.");
    $("device-message").textContent = operation === "LOCK" ? "Card is locked. Disconnect, unplug USB for ten seconds, reconnect and read CID to check that the lock persists. You can then move the card to the radio." : "Card is open. Disconnect and unplug USB before moving the card to your PC reader.";
  }
  $("lock-button").addEventListener("click", () => action(() => changePassword("LOCK")));
  $("unlock-button").addEventListener("click", () => action(() => changePassword("CLEAR")));
  $("serial-support").textContent = "serial" in navigator ? "Select the ESP32 serial port in the browser dialog. Close other programs using that port." : "This browser has no USB serial support. Open this file in desktop Chrome or Edge, or use just the calculator here.";
  refreshButtons();
})();
