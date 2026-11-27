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
  const results={archiveFiles:7,version:info.version,browsers:{},installerCases:[],physicalDevicesAccessed:false};
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
      for(const mode of ['success','wrong-chip','secure-mode','small-flash','verification-failed','cancelled']){
        const ctx=await browser.newContext(),p=await ctx.newPage();
        await p.goto(pathToFileURL(path.join(release,'Install-ESP32.html')).href);
        await p.waitForFunction(()=>document.getElementById('install-state').textContent.startsWith('Program files checked.'));
        await p.evaluate(mode=>{
          window.__writeCount=0;window.__closed=0;window.__mode=mode;
          Object.defineProperty(navigator,'serial',{configurable:true,value:{async requestPort(){if(mode==='cancelled')throw new DOMException('Cancelled','NotFoundError');return {};}}});
          window.Rns315FlashLibrary={
            Transport:class{async disconnect(){window.__closed++;}},
            ESPLoader:class{
              constructor(){this.chip={CHIP_NAME:mode==='wrong-chip'?'ESP32-S3':'ESP32'};this.secureDownloadMode=mode==='secure-mode';}
              async main(){return this.chip.CHIP_NAME;}
              async detectFlashSize(){return mode==='small-flash'?'2MB':'4MB';}
              async writeFlash(options){window.__writeCount++;window.__options={eraseAll:options.eraseAll,flashSize:options.flashSize,addresses:options.fileArray.map(f=>f.address),hashes:options.fileArray.map(f=>options.calculateMD5Hash(f.data))};if(mode==='verification-failed')throw new Error('MD5 of file does not match data in flash!');options.reportProgress(3,1,1);}
              async after(mode){window.__reset=mode;}
            }
          };
        },mode);
        await p.locator('#install-confirm').check();await p.locator('#install-button').click();
        await p.waitForFunction(()=>!document.getElementById('install-confirm').disabled);
        const writes=await p.evaluate(()=>window.__writeCount),message=await p.locator('#install-state').innerText();
        if(mode==='success'){
          assert.match(message,/Program installed and verified/);assert.equal(writes,1);
          const options=await p.evaluate(()=>window.__options);assert.equal(options.eraseAll,false);assert.equal(options.flashSize,'4MB');assert.deepEqual(options.addresses,[0x1000,0x8000,0xe000,0x10000]);assert.deepEqual(options.hashes,expectedHashes);
          assert.equal(await p.evaluate(()=>window.__reset),'hard_reset');
        }else{assert.doesNotMatch(message,/Program installed and verified/);assert.equal(writes,mode==='verification-failed'?1:0);}
        assert.equal(await p.locator('#install-confirm').isChecked(),false);
        if(mode!=='cancelled')assert.equal(await p.evaluate(()=>window.__closed),1);
        results.installerCases.push(channel+':'+mode);await ctx.close();
      }
      results.browsers[channel]={calculator:true,downloads:true,offlineGuide:true,secureFileContext:true,networkRequests:0,consoleErrors:0};
    }finally{await browser.close();}
  }
  fs.writeFileSync(path.join(folder,'test-results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({...results,output:folder}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
