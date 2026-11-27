"use strict";
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
async function main(){
  const archive=path.resolve(process.env.RNS315_RELEASE_ARCHIVE || path.join(root,'dist/RNS315-Easy-Start.zip'));
  const folder=path.join(root,'.local','release test '+Date.now());fs.mkdirSync(folder,{recursive:true});
  const extract=spawnSync(process.env.PYTHON || 'python',['-c',`from pathlib import Path, PurePosixPath
import sys,zipfile
z=zipfile.ZipFile(sys.argv[1]); dest=Path(sys.argv[2]).resolve()
expected={'START-HERE.html','Calculator.html','Guide.html','Install-ESP32.html','LICENSE.txt','THIRD-PARTY-NOTICES.txt','release-info.json'}
assert {PurePosixPath(x).name for x in z.namelist()}==expected
for x in z.namelist():
 assert not PurePosixPath(x).is_absolute() and '..' not in PurePosixPath(x).parts
 assert (dest/x).resolve().is_relative_to(dest)
z.extractall(dest)`,archive,folder],{encoding:'utf8'});
  if(extract.status!==0)throw new Error('Release extraction failed: '+extract.stderr);
  const release=path.join(folder,'RNS315-Easy-Start');
  const info=JSON.parse(fs.readFileSync(path.join(release,'release-info.json'),'utf8'));
  assert.equal(info.version,JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version);
  const html=fs.readFileSync(path.join(release,'Install-ESP32.html'),'utf8');
  const payload=JSON.parse(/window\.Rns315Firmware = (\{[^<]+\});<\/script>/.exec(html)[1]);
  const expectedHashes=payload.files.map(f=>crypto.createHash('md5').update(Buffer.from(f.base64,'base64')).digest('hex'));
  assert.deepEqual(payload.files.map(f=>f.address),[0x1000,0x8000,0xe000,0x10000]);
  for(const f of payload.files)assert.equal(crypto.createHash('sha256').update(Buffer.from(f.base64,'base64')).digest('hex'),f.sha256);
  const results={archiveFiles:7,version:info.version,browsers:{},installerCases:[],cardCases:[],physicalDevicesAccessed:false};
  for(const channel of (process.env.RNS315_RELEASE_BROWSERS || 'chrome,msedge').split(',')){
    const launchOptions={headless:true};
    if(channel!=='chromium')launchOptions.channel=channel;
    const browser=await chromium.launch(launchOptions);
    try{
      const context=await browser.newContext({viewport:{width:1100,height:900},acceptDownloads:true});
      const page=await context.newPage(),errors=[],network=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
      await page.goto(pathToFileURL(path.join(release,'START-HERE.html')).href);
      await page.getByRole('link',{name:'Open calculator →',exact:true}).click();
      await page.locator('#example-button').click();
      assert.equal(await page.locator('#password-output').inputValue(),'C99A20843ED7D90B6801E49F2BC80277');
      const event=page.waitForEvent('download');await page.locator('#save-button').click();
      assert.ok(fs.readFileSync(await (await event).path(),'utf8').includes('PASSWORD_HEX=C99A20843ED7D90B6801E49F2BC80277'));
      for(const bad of ['', 'G'.repeat(32), '<img id="evil" src=x onerror="alert(1)">', '\u202e'+'0'.repeat(32), '\u0000'+'0'.repeat(32), '0'.repeat(100000)]){
        await page.locator('#cid-input').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},bad);
        await page.locator('#calculate-button').click();
        assert.equal(await page.locator('#result-panel').isVisible(),false);
        assert.equal(await page.locator('#evil').count(),0);
        assert.ok((await page.locator('#error-message').innerText()).length>0);
      }
      await page.locator('#example-button').click();
      await page.setViewportSize({width:360,height:840});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.goto(pathToFileURL(path.join(release,'Guide.html')).href);
      assert.equal(await page.evaluate(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0)),true);
      assert.equal(await page.locator('#native-reader').count(),1);
      assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
      await page.goto(pathToFileURL(path.join(release,'START-HERE.html')).href);
      await page.screenshot({path:path.join(folder,'start-'+channel+'.png'),fullPage:true});
      await page.goto(pathToFileURL(path.join(release,'Install-ESP32.html')).href);
      await page.waitForFunction(()=>document.getElementById('install-state').textContent.startsWith('Program files checked.'));
      assert.equal(await page.evaluate(()=>typeof Rns315FlashLibrary.ESPLoader),'function');
      assert.equal(await page.evaluate(()=>isSecureContext && 'serial' in navigator),true);
      assert.equal(await page.locator('#install-button').isDisabled(),true);
      await page.screenshot({path:path.join(folder,'installer-'+channel+'.png'),fullPage:true});
      await context.close();
      for(const mode of ['success','wrong-chip','secure-mode','small-flash','verification-failed','cancelled','connect-hangs','capacity-hangs','write-hangs','reset-hangs','disconnect-hangs','double-install','log-injection']){
        const ctx=await browser.newContext(),p=await ctx.newPage(),faultErrors=[];
        p.on('pageerror',error=>faultErrors.push(error.message));
        await ctx.addInitScript(()=>{const later=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>later(fn,Math.min(ms,60),...args);});
        await p.goto(pathToFileURL(path.join(release,'Install-ESP32.html')).href);
        await p.waitForFunction(()=>document.getElementById('install-state').textContent.startsWith('Program files checked.'));
        await p.evaluate(mode=>{
          window.__writeCount=0;window.__closed=0;window.__mode=mode;window.__injected=false;
          Object.defineProperty(navigator,'serial',{configurable:true,value:{async requestPort(){if(mode==='cancelled')throw new DOMException('Cancelled','NotFoundError');return {};}}});
          window.Rns315FlashLibrary={
            Transport:class{async disconnect(){window.__closed++;if(mode==='disconnect-hangs')await new Promise(()=>{});}},
            ESPLoader:class{
              constructor(options){this.options=options;this.chip={CHIP_NAME:mode==='wrong-chip'?'ESP32-S3':'ESP32'};this.secureDownloadMode=mode==='secure-mode';}
              async main(){if(mode==='connect-hangs')await new Promise(()=>{});if(mode==='log-injection')this.options.terminal.writeLine('<img id="injected" src=x onerror="window.__injected=true">');return this.chip.CHIP_NAME;}
              async detectFlashSize(){if(mode==='capacity-hangs')await new Promise(()=>{});return mode==='small-flash'?'2MB':'4MB';}
              async writeFlash(options){window.__writeCount++;window.__lateProgress=options.reportProgress;window.__options={eraseAll:options.eraseAll,flashSize:options.flashSize,addresses:options.fileArray.map(f=>f.address),hashes:options.fileArray.map(f=>options.calculateMD5Hash(f.data))};if(mode==='write-hangs')await new Promise(()=>{});if(mode==='verification-failed')throw new Error('MD5 of file does not match data in flash!');options.reportProgress(3,1,1);}
              async after(reset){window.__reset=reset;if(mode==='reset-hangs')await new Promise(()=>{});}
            }
          };
        },mode);
        await p.locator('#install-confirm').check();
        if(mode==='double-install')await p.locator('#install-button').evaluate(el=>{el.click();el.click();el.click();});
        else await p.locator('#install-button').click();
        await p.waitForFunction(()=>!document.getElementById('install-confirm').disabled);
        const writes=await p.evaluate(()=>window.__writeCount),message=await p.locator('#install-state').innerText();
        if(['success','reset-hangs','disconnect-hangs','double-install','log-injection'].includes(mode)){
          assert.match(message,/Program installed and verified/);assert.equal(writes,1);
          const options=await p.evaluate(()=>window.__options);assert.equal(options.eraseAll,false);assert.equal(options.flashSize,'4MB');assert.deepEqual(options.addresses,[0x1000,0x8000,0xe000,0x10000]);assert.deepEqual(options.hashes,expectedHashes);
          assert.equal(await p.evaluate(()=>window.__reset),'hard_reset');
        }else{assert.doesNotMatch(message,/Program installed and verified/);assert.equal(writes,['verification-failed','write-hangs'].includes(mode)?1:0);}
        if(mode==='write-hangs'){
          const progress=await p.locator('#install-progress').evaluate(el=>el.value);
          await p.evaluate(()=>window.__lateProgress(3,1,1));
          assert.equal(await p.locator('#install-progress').evaluate(el=>el.value),progress,'Late progress must not change a failed run');
        }
        if(mode==='log-injection'){assert.equal(await p.evaluate(()=>window.__injected),false);assert.equal(await p.locator('#injected').count(),0);}
        assert.equal(await p.locator('#install-confirm').isChecked(),false);
        if(mode!=='cancelled')assert.equal(await p.evaluate(()=>window.__closed),1);
        assert.deepEqual(faultErrors,[]);
        results.installerCases.push(channel+':'+mode);await ctx.close();
      }
      // A corrupted embedded firmware payload must fail closed under CSP.
      const corrupt=path.join(release,'Corrupted-installer.html');
      fs.writeFileSync(corrupt,html.replace(/("base64":")([A-Za-z0-9+/])/,(m,prefix,char)=>prefix+(char==='A'?'B':'A')));
      const corruptContext=await browser.newContext(),corruptPage=await corruptContext.newPage();
      await corruptPage.goto(pathToFileURL(corrupt).href);
      await corruptPage.waitForFunction(()=>document.getElementById('install-state').textContent.includes('incomplete'));
      assert.equal(await corruptPage.locator('#install-button').isDisabled(),true);
      await corruptContext.close();
      for(const mode of ['opposite-prepared','duplicate-cid','card-swapped','double-lock','close-hangs','oversized-data']){
        const ctx=await browser.newContext();
        await ctx.addInitScript(mode=>{
          const later=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>later(fn,Math.min(ms,60),...args);
          let controller,locked=false,reads=0;window.__cardCommands=[];
          const emit=text=>controller.enqueue(new TextEncoder().encode(text+'\n'));
          const report=()=>{
            reads++;
            if(mode==='oversized-data'&&reads>1){emit('X'.repeat(40000));return;}
            const normal='5D53424C32424D31013917CA530104B9';
            const cid=mode==='card-swapped'&&reads>1?'00000000000000000000000000000001':normal;
            emit('RNS315_SD_TOOL_1\nCMD10_DATA_CRC16=OK\nCMD9_DATA_CRC16=OK\nCID_HEX='+cid+'\n'+(mode==='duplicate-cid'?'CID_HEX=00000000000000000000000000000001\n':'')+'CCC7_PASSWORD_CLASS_ADVERTISED=yes\nCMD13_R1=0x00 R2=0x0'+(locked?'1':'0')+'\nCARD_LOCKED_FLAG='+(locked?'yes':'no')+'\nEND_READONLY_REPORT OK');
          };
          const port={async open(){this.readable=new ReadableStream({start(c){controller=c;}});this.writable=new WritableStream({write(bytes){const command=new TextDecoder().decode(bytes).trim();window.__cardCommands.push(command);if(command==='READ')report();else if(command.startsWith('PREPARE '))emit('PREPARED '+(mode==='opposite-prepared'?'CLEAR':'LOCK')+' TOKEN=DEADBEEF EXPIRES_MS=60000; CMD42_NOT_YET_SENT');else if(command==='COMMIT DEADBEEF'){locked=true;emit(mode==='opposite-prepared'?'PASSWORD_CLEAR_VERIFIED':'LOCK_VERIFIED');}}});later(()=>emit('READY_RNS315_SD_TOOL_1;'),5);},async close(){if(mode==='close-hangs')await new Promise(()=>{});}};
          Object.defineProperty(navigator,'serial',{value:{async requestPort(){return port;}}});
        },mode);
        const p=await ctx.newPage();const errors=[];p.on('pageerror',error=>errors.push(error.message));p.on('dialog',dialog=>dialog.accept());
        await p.goto(pathToFileURL(path.join(release,'Calculator.html')).href);
        await p.locator('#connect-button').click();
        if(mode==='duplicate-cid'){
          await p.waitForFunction(()=>!document.getElementById('connect-button').disabled&&document.getElementById('device-message').textContent.length>0);
          assert.equal(await p.locator('#lock-button').isDisabled(),true);
        }else{
          await p.waitForFunction(()=>document.getElementById('card-state').textContent.startsWith('Card read.'));
          if(mode==='close-hangs'){
            await p.locator('#disconnect-button').click();
            await p.waitForFunction(()=>!document.getElementById('connect-button').disabled);
            assert.match(await p.locator('#device-message').innerText(),/Unplug/);
          }else if(mode==='oversized-data'){
            await p.locator('#read-button').click();
            await p.waitForFunction(()=>!document.getElementById('connect-button').disabled);
          }else{
            await p.locator('#prepared-check').check();
            if(mode==='double-lock')await p.locator('#lock-button').evaluate(el=>{el.click();el.click();el.click();});
            else await p.locator('#lock-button').click();
            await p.waitForFunction(()=>document.getElementById('device-message').textContent.length>0);
          }
        }
        const commands=await p.evaluate(()=>window.__cardCommands);
        assert.equal(commands.filter(c=>c.startsWith('COMMIT ')).length,mode==='double-lock'?1:0);
        if(mode==='card-swapped')assert.equal(commands.filter(c=>c.startsWith('PREPARE ')).length,0);
        assert.deepEqual(errors,[]);results.cardCases.push(channel+':'+mode);await ctx.close();
      }
      results.browsers[channel]={calculator:true,downloads:true,offlineGuide:true,secureFileContext:true,networkRequests:0,consoleErrors:0};
    }finally{await browser.close();}
  }
  fs.writeFileSync(path.join(folder,'test-results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({...results,output:folder}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
