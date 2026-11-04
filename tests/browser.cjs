"use strict";
const {chromium} = require('playwright');
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const calculator=require(path.join(root,'web/calculator.js'));
const cid=calculator.describeCid('5D53424C32424D31013917CA53010400').canonicalCid;
const password=calculator.calculatePassword(cid);
async function main(){
  fs.mkdirSync(path.join(root,'qa'),{recursive:true});
  const browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1120,height:1000},acceptDownloads:true});
    const page=await context.newPage(); const errors=[]; const remote=[];
    page.on('pageerror', e=>errors.push(e.message)); page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url());});
    await page.goto(pathToFileURL(path.join(root,'web/index.html')).href);
    await page.locator('#example-button').click();
    assert.equal(await page.locator('#password-output').inputValue(),password);
    assert.equal(await page.locator('#result-panel').isVisible(),true);
    const downloadPromise=page.waitForEvent('download'); await page.locator('#save-button').click(); const download=await downloadPromise;
    const downloadText=fs.readFileSync(await download.path(),'utf8'); assert.ok(downloadText.includes('PASSWORD_HEX='+password));
    await page.locator('#calculator').screenshot({path:path.join(root,'docs/images/calculator-desktop.png')});
    await page.locator('#cid-input').fill('123'); assert.equal(await page.locator('#result-panel').isVisible(),false);
    await page.locator('#calculate-button').click(); assert.ok((await page.locator('#error-message').innerText()).length>10);
    await page.locator('#cid-input').fill('<img src=x onerror=alert(1)>'); await page.locator('#calculate-button').click();
    assert.equal(await page.locator('#result-panel').isVisible(),false);
    await page.locator('#example-button').click();
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#calculator').screenshot({path:path.join(root,'docs/images/calculator-mobile.png')});
    await page.goto(pathToFileURL(path.join(root,'web/guide.html')).href); await page.waitForLoadState('load');
    assert.equal(await page.locator('img').count(),8);
    assert.equal(await page.evaluate(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0)),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    // Inspect each drawing at useful resolution, separate from the guide page.
    await page.setViewportSize({width:1100,height:850});
    for(const name of ['wiring','radio-steps','card-files','lock-result','workflow']){
      await page.goto(pathToFileURL(path.join(root,'web/guide.html')).href);
      await page.locator('img[src$="'+name+'.svg"]').screenshot({path:path.join(root,'qa',name+'.png')});
    }
    assert.deepEqual(errors,[]); assert.deepEqual(remote,[]);
    await context.close();
    const serialContext=await browser.newContext({viewport:{width:1120,height:1000}});
    await serialContext.addInitScript(({cid,password})=>{
      let controller, locked=false, prepared=false;
      const emit=text=>controller.enqueue(new TextEncoder().encode(text+'\n'));
      const report=()=>emit('RNS315_SD_TOOL_1\nCMD10_DATA_CRC16=OK\nCMD9_DATA_CRC16=OK\nCID_HEX='+cid+'\nCCC7_PASSWORD_CLASS_ADVERTISED=yes\nCMD13_R1=0x00 R2=0x0'+(locked?'1':'0')+'\nCARD_LOCKED_FLAG='+(locked?'yes':'no')+'\nEND_READONLY_REPORT OK');
      const port={
        async open(){this.readable=new ReadableStream({start(c){controller=c;}}); this.writable=new WritableStream({write(bytes){
          const cmd=new TextDecoder().decode(bytes).trim();
          if(cmd==='READ')report();
          else if(cmd.startsWith('PREPARE ')){const parts=cmd.split(' '); if(parts[2]!==cid||parts[3]!==password)emit('PREPARE_REJECTED');else {prepared=parts[1];emit('PREPARED '+prepared+' TOKEN=DEADBEEF EXPIRES_MS=60000; CMD42_NOT_YET_SENT');}}
          else if(cmd==='COMMIT DEADBEEF'&&prepared){locked=prepared==='LOCK';prepared=false;emit(locked?'LOCK_VERIFIED':'PASSWORD_CLEAR_VERIFIED');}
          else emit('UNKNOWN_COMMAND');
        }});setTimeout(()=>emit('READY_RNS315_SD_TOOL_1;'),5);},async close(){this.writable=null;}};
      Object.defineProperty(navigator,'serial',{value:{async requestPort(){return port;}}});
    },{cid,password});
    const serialPage=await serialContext.newPage(); serialPage.on('dialog',d=>d.accept());
    await serialPage.goto(pathToFileURL(path.join(root,'web/index.html')).href);
    await serialPage.locator('#connect-button').click();
    await serialPage.waitForFunction(()=>document.getElementById('card-state').textContent==='Card read. Card is open for PC.');
    await serialPage.locator('#prepared-check').check();
    await serialPage.locator('#lock-button').click();
    await serialPage.waitForFunction(()=>document.getElementById('card-state').textContent==='Card read. Card is locked.');
    await serialPage.locator('#prepared-check').check(); await serialPage.locator('#unlock-button').click();
    await serialPage.waitForFunction(()=>document.getElementById('device-message').textContent.startsWith('Card is open.'));
    await serialPage.locator('#disconnect-button').click();
    assert.match(await serialPage.locator('#card-state').innerText(),/Disconnected/);
    await serialContext.close();
    console.log(JSON.stringify({calculator:true,invalidInput:true,download:true,mobile:true,guideImages:8,remoteRequests:0,serialFlow:'simulated connect/read/lock/clear/disconnect',screenshots:true,devicesAccessed:false}));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
