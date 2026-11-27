"""Build an allowlisted, offline beginner ZIP from this source checkout."""
from pathlib import Path
import argparse, base64, hashlib, html, json, os, re, subprocess, zipfile

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']

def digest(data): return hashlib.sha256(data).hexdigest()
def read(path): return (ROOT/path).read_text(encoding='utf-8')

def standalone(page, scripts=()):
    # ASVS 1.2.1 / 15.2.3: inline only allowlisted assets and hash them in CSP.
    styles=read('calculator/assets/styles.css')+'\n.button-link{display:inline-block;text-decoration:none;border:1px solid var(--line);border-radius:4px;padding:10px 17px;font-size:14px;font-weight:650;min-height:44px}.button-link.primary{color:white}.section-heading{margin-top:30px}.beginner-steps{padding-left:22px}.beginner-steps li{margin:14px 0}progress{display:block;width:100%;height:18px;margin:18px 0;accent-color:var(--accent)}'
    page=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '',page)
    page=re.sub(r'<link rel="stylesheet"[^>]*>', '',page)
    page=re.sub(r'<script src="[^"]+" defer></script>', '',page)
    page=page.replace('{{VERSION}}',VERSION)
    page=page.replace('guide.html','Guide.html').replace('href="index.html"','href="Calculator.html"')
    page=page.replace('Open-Calculator.html','Calculator.html')
    def embed(match):
        relative=match.group(1)
        path=(ROOT/'calculator'/relative).resolve()
        if not path.is_relative_to((ROOT/'docs/images').resolve()): raise ValueError('Unexpected image path')
        mime='image/svg+xml' if path.suffix=='.svg' else 'image/png'
        return 'src="data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()+'"'
    page=re.sub(r'src="(\.\./docs/images/[^"]+)"',embed,page)
    page=re.sub(r'href="\.\./docs/[^"#]+\.md(?:#[^"]*)?"','href="https://github.com/Oskarhn/rns315-cid-calculator/tree/main/docs"',page)
    hashes=["'sha256-"+base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()+"'" for s in scripts]
    stylehash=base64.b64encode(hashlib.sha256(styles.encode()).digest()).decode()
    policy="default-src 'none'; script-src "+(' '.join(hashes) if hashes else "'none'")+"; style-src 'sha256-"+stylehash+"'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"
    page=page.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+html.escape(policy,quote=True)+'">',1)
    page=page.replace('</head>','<style>'+styles+'</style></head>',1)
    for script in scripts:
        if re.search(r'</script',script,re.I): raise ValueError('Unexpected closing script tag')
    return page.replace('</body>',''.join('<script>'+s+'</script>' for s in scripts)+'</body>')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'dist')
    parser.add_argument('--platformio-core',type=Path,default=Path(os.environ.get('PLATFORMIO_CORE_DIR',Path.home()/'.platformio')))
    args=parser.parse_args()
    out=args.output.resolve(); out.mkdir(parents=True,exist_ok=True)
    build=ROOT/'sd-card/esp32/.pio/build/esp32-wroom-32d'
    binaries=[(0x1000,build/'bootloader.bin'),(0x8000,build/'partitions.bin'),(0xe000,args.platformio_core/'packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin'),(0x10000,build/'firmware.bin')]
    files=[]
    for address,path in binaries:
        raw=path.read_bytes()
        if not raw or len(raw)>1048576:raise ValueError('Unexpected firmware size')
        files.append({'address':address,'size':len(raw),'sha256':digest(raw),'base64':base64.b64encode(raw).decode()})
    # Explicit offsets match the pinned classic-ESP32 PlatformIO build.
    payload='window.Rns315Firmware = '+json.dumps({'chip':'ESP32','version':VERSION,'files':files},separators=(',',':'))+';'
    bundle=subprocess.run(['node',str(ROOT/'scripts/release/bundle-flasher.cjs')],cwd=ROOT,capture_output=True,text=True,check=True).stdout
    calculator=standalone(read('calculator/index.html'),[read('calculator/assets/password-calculator.js'),read('calculator/assets/card-connection.js'),read('calculator/assets/interface.js')])
    calculator=calculator.replace('Wire the module and install the ESP32 program first.','Wire the module first.').replace('<p>Use Chrome or Edge on your computer.','<p><a href="Install-ESP32.html">First time? Install the ESP32 program here →</a></p><p>Use Chrome or Edge on your computer.')
    pages={'START-HERE.html':standalone(read('scripts/release/start-here.html.in')),
           'Calculator.html':calculator,
           'Guide.html':standalone(read('calculator/guide.html')),
           'Install-ESP32.html':standalone(read('scripts/release/install-esp32.html.in'),[payload,read('calculator/assets/password-calculator.js'),bundle,read('scripts/release/installer.js')]),
           'LICENSE.txt':read('LICENSE')}
    notices=['Third-party components used by the offline ESP32 installer.\nTheir licenses apply to their respective code; project code remains MIT.\n']
    for name,licensefile in [('esptool-js','LICENSE'),('pako','LICENSE'),('atob-lite','LICENSE.md')]:
        package=json.loads(read('node_modules/'+name+'/package.json'))
        notices.append('\n'+name+' '+package['version']+'\n'+read('node_modules/'+name+'/'+licensefile))
    notices.append('\nCompiled ESP32 firmware dependencies:\nArduino-ESP32 2.0.17 (LGPL-2.1-or-later): https://github.com/espressif/arduino-esp32/tree/2.0.17\nESP-IDF 4.4.7 (Apache-2.0): https://github.com/espressif/esp-idf/tree/v4.4.7\nThe complete application source and rebuild instructions are available at https://github.com/Oskarhn/rns315-cid-calculator/tree/v'+VERSION+'/sd-card/esp32 and docs/development.md.\nThe PlatformIO platform and framework versions are pinned in the source project.\n')
    notices.append(read('scripts/release/licenses/arduino-esp32-LICENSE.txt'))
    pages['THIRD-PARTY-NOTICES.txt']='\n'.join(notices)
    sha=subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
    pages['release-info.json']=json.dumps({'version':VERSION,'source_commit':sha,'firmware':[dict(address=f['address'],size=f['size'],sha256=f['sha256']) for f in files]},indent=2)
    archive=out/'RNS315-Easy-Start.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name,content in pages.items():
            entry=zipfile.ZipInfo('RNS315-Easy-Start/'+name,date_time=(2026,1,1,0,0,0)); entry.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(entry,content.encode('utf-8'))
    (out/'SHA256SUMS.txt').write_text(digest(archive.read_bytes())+'  '+archive.name+'\n',encoding='utf-8')
    print(json.dumps({'archive':str(archive),'version':VERSION,'source_commit':sha,'files':len(pages),'bytes':archive.stat().st_size}))

if __name__=='__main__': main()
