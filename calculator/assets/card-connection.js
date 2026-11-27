/* ASVS 2.2.1, 15.4.1: bounded frames, one pending request, no automatic write retry. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Rns315Serial = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  async function withDeadline(work, milliseconds, message) {
    let timer;
    try { return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds);})]); }
    finally { clearTimeout(timer); }
  }
  function oneMatch(text, pattern, message) {
    const matches=Array.from(text.matchAll(pattern));
    if(matches.length!==1) throw new Error(message);
    return matches[0];
  }
  function parseReport(text) {
    const invalid="The card report is incomplete or ambiguous. Read CID again before continuing.";
    if(typeof text!=="string" || text.length>32768) throw new Error(invalid);
    // ASVS 2.2.1 / 2.2.3: never combine identity and status from duplicate frames.
    oneMatch(text,/^RNS315_SD_TOOL_1\r?$/gm,invalid);
    oneMatch(text,/^END_READONLY_REPORT OK\r?$/gm,invalid);
    oneMatch(text,/^CMD10_DATA_CRC16=OK(?:[^\S\r\n][^\r\n]*)?\r?$/gm,invalid);
    oneMatch(text,/^CMD9_DATA_CRC16=OK(?:[^\S\r\n][^\r\n]*)?\r?$/gm,invalid);
    const status=oneMatch(text,/^CMD13_R1=0x00 R2=0x0([01])\r?$/gm,invalid);
    const cid=oneMatch(text,/^CID_HEX=([A-F0-9]{32})\r?$/gm,invalid);
    const locked=oneMatch(text,/^CARD_LOCKED_FLAG=(yes|no)\r?$/gm,invalid);
    const passwordClass=oneMatch(text,/^CCC7_PASSWORD_CLASS_ADVERTISED=(yes|no)\r?$/gm,invalid);
    // ASVS 2.2.3: the decoded status and its readable flag must agree.
    if ((status[1] === "1") !== (locked[1] === "yes")) throw new Error("The reported lock status is inconsistent. Read CID again before continuing.");
    return {cid: cid[1], locked: locked[1] === "yes", passwordClass: passwordClass[1]==="yes"};
  }
  function parsePrepared(text, operation) {
    if(!["LOCK","CLEAR"].includes(operation) || typeof text!=="string" || text.length>32768) throw new Error("Invalid password-operation confirmation.");
    const match=oneMatch(text,/^PREPARED (LOCK|CLEAR) TOKEN=([0-9A-F]{8}) EXPIRES_MS=60000; CMD42_NOT_YET_SENT\r?$/gm,"ESP32 did not confirm a single valid operation. Nothing was committed.");
    if(match[1]!==operation) throw new Error("ESP32 confirmed a different operation. Nothing was committed. Read card status again.");
    return match[2];
  }
  class Connection {
    constructor(onLine, onClose) { this.onLine = onLine; this.onClose = onClose; this.pending = null; this.port = null; this.reader = null; this.closing = false; this.closeTask=null; }
    async open(serial) {
      this.port = await serial.requestPort();
      try {
        await this.port.open({baudRate: 115200});
        if (!this.port.readable || !this.port.writable) throw new Error("ESP32 has no usable serial streams. Reconnect it and try again.");
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
      try {
        writer = this.port.writable.getWriter();
        // Observe both promises immediately: a stalled USB write must not hide
        // the response timeout or create an unhandled rejection (ASVS 15.4.1).
        const replies = await Promise.all([writer.write(new TextEncoder().encode(command + "\n")), result]);
        return replies[1];
      } catch (error) {
        this.fail(error);
        try { await result; } catch (_) {}
        throw error;
      }
      finally { if (writer) writer.releaseLock(); }
    }
    async readLoop() {
      const decoder = new TextDecoder(); let remainder = "";
      try {
        this.reader = this.port.readable.getReader();
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
        if (this.reader) { this.reader.releaseLock(); this.reader = null; }
        this.fail(new Error("The ESP32 connection was lost."));
        if (!this.closing) {
          const port=this.port;
          this.port = null;
          this.onClose();
          if(port) await withDeadline(()=>port.close(),3000,"USB cleanup timed out.").catch(()=>{});
        }
      }
    }
    async close() {
      if(this.closeTask) return this.closeTask;
      this.closing = true; this.fail(new Error("Connection closed."));
      const port=this.port;
      this.port = null;
      this.closeTask=withDeadline(async()=>{
        if (this.reader) await this.reader.cancel().catch(() => {});
        if (this.loopTask) await this.loopTask.catch(() => {});
        if (port) await port.close().catch(() => {});
      },3000,"USB cleanup timed out. Unplug the ESP32 USB cable before connecting again.");
      return this.closeTask;
    }
  }
  return {Connection, parseReport, parsePrepared};
});
