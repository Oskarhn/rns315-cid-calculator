/* ASVS 2.2.1, 15.4.1: bounded frames, one pending request, no automatic write retry. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Rns315Serial = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function parseReport(text) {
    if (!text.includes("RNS315_SD_TOOL_1") || !text.includes("END_READONLY_REPORT OK") ||
        !/CMD10_DATA_CRC16=OK/.test(text) || !/CMD9_DATA_CRC16=OK/.test(text) ||
        !/CMD13_R1=0x00 R2=0x0[01](?:\r?\n|$)/.test(text)) throw new Error("The card could not be read reliably. Check the wiring and try Read CID again.");
    const cid = /(?:^|\n)CID_HEX=([A-F0-9]{32})(?:\r?\n|$)/.exec(text);
    const locked = /CARD_LOCKED_FLAG=(yes|no)/.exec(text);
    if (!cid || !locked) throw new Error("The report is missing CID or lock status.");
    return {cid: cid[1], locked: locked[1] === "yes", passwordClass: /CCC7_PASSWORD_CLASS_ADVERTISED=yes/.test(text)};
  }
  class Connection {
    constructor(onLine, onClose) { this.onLine = onLine; this.onClose = onClose; this.pending = null; this.port = null; this.reader = null; this.closing = false; }
    async open(serial) {
      this.port = await serial.requestPort();
      try {
        await this.port.open({baudRate: 115200});
        // Register before reading so the first READY banner cannot be missed.
        const ready = this.wait(/^READY_RNS315_SD_TOOL_1;/m, 10000);
        this.loopTask = this.readLoop();
        await ready;
      } catch (error) { await this.close(); throw error; }
    }
    wait(end, timeout = 15000) {
      if (this.pending) throw new Error("A card operation is already in progress.");
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => this.fail(new Error("ESP32 did not respond in time. Check card status before trying again.")), timeout);
        this.pending = {end, text: "", resolve, reject, timer};
      });
    }
    fail(error) {
      if (!this.pending) return;
      const p = this.pending; this.pending = null; clearTimeout(p.timer); p.reject(error);
    }
    async query(command, end, timeout) {
      if (!this.port?.writable) throw new Error("Connect ESP32 first.");
      if (typeof command !== "string" || command.length > 120 || /[\r\n]/.test(command)) throw new Error("Invalid command.");
      const result = this.wait(end, timeout);
      let writer;
      try { writer = this.port.writable.getWriter(); await writer.write(new TextEncoder().encode(command + "\n")); }
      catch (error) { this.fail(error); }
      finally { if (writer) writer.releaseLock(); }
      return result;
    }
    async readLoop() {
      const decoder = new TextDecoder(); let remainder = "";
      this.reader = this.port.readable.getReader();
      try {
        while (true) {
          const {value, done} = await this.reader.read(); if (done) break;
          remainder += decoder.decode(value, {stream: true});
          if (remainder.length > 32768) throw new Error("Invalid serial response.");
          let end;
          while ((end = remainder.indexOf("\n")) >= 0) {
            const line = remainder.slice(0, end).replace(/\r$/, ""); remainder = remainder.slice(end + 1);
            this.onLine(line);
            const p = this.pending; if (!p) continue;
            p.text += line + "\n";
            if (p.text.length > 32768) throw new Error("ESP32 response is too long.");
            if (/ERROR|REJECTED|MISMATCH|NOT_VERIFIED|ALREADY_LOCKED|CRC16=FAIL|HEX_INVALID|UNKNOWN_COMMAND|PREPARATION_EXPIRED/.test(line)) {
              this.fail(new Error("ESP32 stopped the operation: " + line));
            } else if (p.end.test(line)) {
              this.pending = null; clearTimeout(p.timer); p.resolve(p.text);
            }
          }
        }
      } catch (error) { this.fail(error); }
      finally {
        this.reader.releaseLock(); this.reader = null;
        this.fail(new Error("The ESP32 connection was lost."));
        if (!this.closing) {
          if (this.port) await this.port.close().catch(() => {});
          this.port = null;
          this.onClose();
        }
      }
    }
    async close() {
      this.closing = true; this.fail(new Error("Connection closed."));
      if (this.reader) await this.reader.cancel().catch(() => {});
      if (this.loopTask) await this.loopTask;
      if (this.port) await this.port.close().catch(() => {});
      this.port = null;
    }
  }
  return {Connection, parseReport};
});
