"use strict";
const assert = require("node:assert/strict");
const {Connection, parseReport, parsePrepared} = require("../calculator/assets/card-connection.js");
const CID = "5D53424C32424D31013917CA530104B9";
function report(locked = true) {
  return `RNS315_SD_TOOL_1\nCMD10_DATA_CRC16=OK\nCMD9_DATA_CRC16=OK\nCID_HEX=${CID}\nCCC7_PASSWORD_CLASS_ADVERTISED=yes\nCMD13_R1=0x00 R2=0x0${locked?1:0}\nCARD_LOCKED_FLAG=${locked?'yes':'no'}\nEND_READONLY_REPORT OK\n`;
}
async function main() {
  assert.deepEqual(parseReport(report()), {cid:CID, locked:true, passwordClass:true});
  assert.equal(parseReport(report(false)).locked, false);
  assert.equal(parseReport(report().replace(/\n/g,'\r\n')).locked,true);
  for(const duplicate of ['CID_HEX='+CID,'CARD_LOCKED_FLAG=yes','CMD13_R1=0x00 R2=0x01','CCC7_PASSWORD_CLASS_ADVERTISED=yes','CMD10_DATA_CRC16=OK','END_READONLY_REPORT OK'])assert.throws(()=>parseReport(report()+duplicate+'\n'),/ambiguous/);
  assert.throws(()=>parseReport(report()+report(false)),/ambiguous/);
  for(const operation of ['LOCK','CLEAR'])assert.equal(parsePrepared(`PREPARED ${operation} TOKEN=DEADBEEF EXPIRES_MS=60000; CMD42_NOT_YET_SENT\n`,operation),'DEADBEEF');
  assert.throws(()=>parsePrepared('PREPARED CLEAR TOKEN=DEADBEEF EXPIRES_MS=60000; CMD42_NOT_YET_SENT\n','LOCK'),/different operation/);
  for(const bad of ['PREPARED LOCK TOKEN=DEADBEEF','PREPARED LOCK TOKEN=DEADBEEF EXPIRES_MS=0; CMD42_NOT_YET_SENT','PREPARED LOCK TOKEN=123 EXPIRES_MS=60000; CMD42_NOT_YET_SENT'])assert.throws(()=>parsePrepared(bad,'LOCK'));
  for (const bad of [report().replace('END_READONLY_REPORT OK','END_READONLY_REPORT ERROR'),report().replace('CMD10_DATA_CRC16=OK','CMD10_DATA_CRC16=FAIL'),report().replace(CID,'123'),report().replace('R2=0x01','R2=0x0100'),report().replace('RNS315_SD_TOOL_1','OTHER_TOOL'), report().replace('R2=0x01','R2=0x80'),report().replace('CARD_LOCKED_FLAG=yes','CARD_LOCKED_FLAG=no')]) assert.throws(()=>parseReport(bad));
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
  // Regressions: unplugging during startup must not leak a port or rejection.
  for (const missing of ['readable','writable']) {
    let closeCalls=0;
    const port={async open(){},readable:{},writable:{},async close(){closeCalls++;}};
    port[missing]=null;
    const startup=new Connection(()=>{},()=>{});
    await assert.rejects(startup.open({async requestPort(){return port;}}),/serial streams/);
    assert.equal(closeCalls,1);
    assert.equal(startup.port,null);
  }
  let closedAfterReaderFailure=0;
  const readerFailure=new Connection(()=>{},()=>{});
  await assert.rejects(readerFailure.open({async requestPort(){return {async open(){},readable:{getReader(){throw new Error('reader unavailable');}},writable:{},async close(){closedAfterReaderFailure++;}};}}),/reader unavailable/);
  assert.ok(closedAfterReaderFailure>0);
  assert.equal(readerFailure.port,null);
  // A write that never settles must still respect the response deadline.
  let writeLockReleased=false;
  const stalled=new Connection(()=>{},()=>{});
  stalled.port={writable:{getWriter(){return {write(){return new Promise(()=>{});},releaseLock(){writeLockReleased=true;}};}}};
  const outcome=await Promise.race([
    stalled.query('READ',/^DONE$/,5).then(()=> 'unexpected success',()=> 'timeout'),
    new Promise(resolve=>setTimeout(()=>resolve('hung'),100))
  ]);
  assert.equal(outcome,'timeout');
  assert.ok(writeLockReleased);
  assert.equal(stalled.pending,null);
  // A broken driver must not keep the entire UI waiting forever during cleanup.
  const originalTimeout=global.setTimeout;
  try {
    global.setTimeout=(fn,ms,...args)=>originalTimeout(fn,ms===3000?5:ms,...args);
    for(const mode of ['cancel','loop','close']){
      const blocked=new Connection(()=>{},()=>{});
      blocked.port={async close(){if(mode==='close')await new Promise(()=>{});}};
      if(mode==='cancel')blocked.reader={cancel(){return new Promise(()=>{});}};
      if(mode==='loop')blocked.loopTask=new Promise(()=>{});
      await assert.rejects(blocked.close(),/Unplug/);
      assert.equal(blocked.port,null);
      await assert.rejects(blocked.close(),/Unplug/);
    }
  } finally {global.setTimeout=originalTimeout;}
  console.log('Serial framing, status consistency, startup cleanup, stalled-write deadlines and command errors passed. No devices accessed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
