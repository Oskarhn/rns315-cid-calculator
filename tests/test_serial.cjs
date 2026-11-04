"use strict";
const assert = require("node:assert/strict");
const {Connection, parseReport} = require("../web/serial.js");
const CID = "5D53424C32424D31013917CA530104B9";
function report(locked = true) {
  return `RNS315_SD_TOOL_1\nCMD10_DATA_CRC16=OK\nCMD9_DATA_CRC16=OK\nCID_HEX=${CID}\nCCC7_PASSWORD_CLASS_ADVERTISED=yes\nCMD13_R1=0x00 R2=0x0${locked?1:0}\nCARD_LOCKED_FLAG=${locked?'yes':'no'}\nEND_READONLY_REPORT OK\n`;
}
async function main() {
  assert.deepEqual(parseReport(report()), {cid:CID, locked:true, passwordClass:true});
  assert.equal(parseReport(report(false)).locked, false);
  for (const bad of [report().replace('END_READONLY_REPORT OK','END_READONLY_REPORT ERROR'),report().replace('CMD10_DATA_CRC16=OK','CMD10_DATA_CRC16=FAIL'),report().replace(CID,'123'),report().replace('R2=0x01','R2=0x0100'),report().replace('RNS315_SD_TOOL_1','OTHER_TOOL'), report().replace('R2=0x01','R2=0x80')]) assert.throws(()=>parseReport(bad));
  const c = new Connection(()=>{},()=>{});
  const first = c.wait(/^OK$/, 1000);
  assert.throws(()=>c.wait(/^OK$/,1000), /progress/);
  c.fail(new Error('cancelled'));
  await assert.rejects(first,/cancelled/);
  await assert.rejects(c.query('READ',/^OK$/), /Connect/);
  const bytes = new TextEncoder().encode('READY_RNS315_SD_TOOL_1;\nPARTIAL_');
  const rest = new TextEncoder().encode('FRAME\nLOCK_VERIFIED\n');
  let n=0, writes=[], released=false;
  const fakeReader={async read(){n++; if(n===1)return {value:bytes}; if(n===2)return {value:rest}; return {done:true};},releaseLock(){released=true;}};
  const fakePort={readable:{getReader(){return fakeReader;}},async close(){}};
  const lines=[];
  const framed=new Connection(x=>lines.push(x),()=>{}); framed.port=fakePort;
  const received=framed.wait(/^LOCK_VERIFIED$/,1000);
  await framed.readLoop();
  assert.match(await received,/PARTIAL_FRAME/); assert.ok(released);
  assert.equal(lines[1],'PARTIAL_FRAME');
  const failed=new Connection(()=>{},()=>{}); let reads=0;
  failed.port={readable:{getReader(){return {async read(){if(reads++===0)return {value:new TextEncoder().encode('CMD42_REJECTED R1=04\n')};return {done:true};},releaseLock(){}};}},async close(){}};
  const rejected=failed.wait(/^LOCK_VERIFIED$/,1000); const check=assert.rejects(rejected,/stopped/); await failed.readLoop(); await check;
  const timeout=new Connection(()=>{},()=>{}); await assert.rejects(timeout.wait(/^OK$/,5), /in time/);
  console.log('Serial framing, CID/status validation, concurrent-request rejection, timeout and CMD42 error handling passed. No devices accessed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
