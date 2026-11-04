from pathlib import Path
from html import escape

root = Path(__file__).resolve().parents[1]
images = root / 'docs/images'
images.mkdir(parents=True, exist_ok=True)

def svg(name, title, height, body):
    (images / name).write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="{height}" viewBox="0 0 1100 {height}" role="img" aria-label="{escape(title)}">
<title>{escape(title)}</title><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#196656"/></marker></defs>
<style>text{{font-family:Segoe UI,Arial,sans-serif;fill:#192a31}}.title{{font-size:30px;font-weight:700}}.small{{font-size:17px;fill:#52646a}}.label{{font-size:21px;font-weight:600}}.mono{{font-family:Consolas,monospace;font-size:19px}}.white{{fill:#fffefa}}.green{{fill:#196656}}</style>
<rect width="1100" height="{height}" rx="12" fill="#f2f0eb"/>{body}</svg>''', encoding='utf-8')

svg('map-update-overview.svg', 'From map package to RNS315 in four steps', 330, '''
<text x="40" y="54" class="title">Four steps to a prepared map card</text>
<text x="40" y="87" class="small">Copy the files before locking the card.</text>
''' + ''.join(f'''<rect x="{40+i*265}" y="130" width="225" height="145" rx="8" fill="#fffefa" stroke="#ced5d3"/>
<circle cx="{70+i*265}" cy="164" r="16" fill="#196656"/><text x="{65+i*265}" y="170" style="font-size:17px;fill:white">{i+1}</text>
<text x="{58+i*265}" y="212" class="label">{title}</text><text x="{58+i*265}" y="245" class="small">{subtitle}</text>
''' + (f'<path d="M{270+i*265} 200h24" stroke="#196656" stroke-width="3" marker-end="url(#arrow)"/>' if i<3 else '') for i,(title,subtitle) in enumerate([('Copy maps','Computer → SD card'),('Calculate password','CID → calculator'),('Lock the card','ESP32 → CMD42'),('Update the radio','SD card → RNS315')])) )

svg('sd-card-folders.svg', "Place the map folder directly in the SD card's root", 470, '''
<text x="40" y="54" class="title">The correct folder layout</text>
<rect x="40" y="90" width="640" height="325" rx="8" fill="#fffefa" stroke="#ced5d3"/>
<rect x="40" y="90" width="640" height="45" rx="8" fill="#e6ece8"/>
<text x="65" y="120" class="small">This PC  /  SD card</text>
<text x="70" y="175" class="mono">SD card (root)</text>
<text x="100" y="220" class="mono">└─ navpsf_update/</text>
<rect x="135" y="240" width="305" height="115" rx="5" fill="#eaf2ee" stroke="#196656" stroke-width="2"/>
<text x="155" y="270" class="mono">├─ files.md5</text>
<text x="155" y="305" class="mono">├─ version.txt</text>
<text x="155" y="340" class="mono">└─ … other map files</text>
<path d="M735 200H440" stroke="#196656" stroke-width="3" marker-end="url(#arrow)"/>
<text x="735" y="165" class="label">In the root directory</text>
<text x="735" y="240" class="small">No extra V12 folder</text><text x="735" y="267" class="small">around navpsf_update.</text>
<text x="70" y="390" class="small">Copy extracted files, not the ZIP/RAR archive itself.</text>
<text x="40" y="450" class="small">Illustrated folder layout. Map filenames vary by package.</text>''')

colors=['#394b53','#ae4936','#8a6418','#735a94','#196656','#326b9b']
pins=[('GND','GND'),('5V','5V / VIN'),('CS','GPIO27'),('MOSI','GPIO23'),('SCK / CLK','GPIO18'),('MISO','GPIO19')]
wires=''
for i,((left,right),color) in enumerate(zip(pins,colors)):
    y=195+i*54
    wires += f'<text x="248" y="{y+6}" text-anchor="end" class="mono">{left}</text><circle cx="280" cy="{y}" r="7" fill="{color}"/><path d="M288 {y}H752" stroke="{color}" stroke-width="5"/><circle cx="760" cy="{y}" r="7" fill="{color}"/><text x="790" y="{y+6}" class="mono">{right}</text>'
svg('esp32-sd-wiring.svg','Wiring between MH-SD and a classic ESP32',670, f'''
<text x="40" y="54" class="title">Follow the printed pin names</text>
<text x="40" y="87" class="small">Unplug USB before changing wires or moving the SD card.</text>
<rect x="55" y="120" width="260" height="430" rx="10" fill="#fffefa" stroke="#ced5d3"/>
<rect x="725" y="120" width="315" height="430" rx="10" fill="#fffefa" stroke="#ced5d3"/>
<text x="85" y="155" class="label">MH-SD module</text><text x="755" y="155" class="label">ESP32-WROOM-32</text>
{wires}<text x="85" y="522" class="small">3V3: disconnected*</text>
<text x="40" y="593" class="small">*For a module with a 5V input, 3.3 V regulator and suitable level shifting.</text>
<text x="40" y="623" class="small">Never feed 5 V into a bare SD card or a 3.3 V-only module.</text>
<text x="40" y="653" class="small">Schematic illustration. Physical pin positions vary between boards.</text>''')

svg('expected-card-status.svg','Expected status after locking the SD card',400, '''
<text x="40" y="54" class="title">Expected output after locking</text>
<rect x="40" y="90" width="650" height="235" rx="8" fill="#192a31"/>
<text x="65" y="135" class="mono" style="fill:#d2e4db">LOCK_VERIFIED</text>
<text x="65" y="182" class="mono" style="fill:#d2e4db">CMD13_R1=0x00 R2=0x01</text>
<text x="65" y="229" class="mono" style="fill:#d2e4db">CARD_LOCKED_FLAG=yes</text>
<text x="65" y="285" class="mono" style="fill:#d2e4db">END_READONLY_REPORT OK</text>
<path d="M755 135H430" stroke="#196656" stroke-width="3" marker-end="url(#arrow)"/>
<text x="760" y="125" class="label">Lock confirmed</text>
<path d="M755 229H565" stroke="#196656" stroke-width="3" marker-end="url(#arrow)"/>
<text x="760" y="218" class="label">Card is locked</text>
<text x="40" y="367" class="small">Unplug USB for ten seconds, then read status again to confirm that the lock persists.</text>''')

svg('rns315-installation.svg','Illustrated RNS315 map-update choices',820, '''
<text x="40" y="54" class="title">Look for these choices on RNS315</text>
<text x="40" y="87" class="small">Illustrations. Menu wording and appearance may vary.</text>
<rect x="40" y="115" width="650" height="180" rx="10" fill="#242c33"/>
<text x="75" y="155" class="label" style="fill:white">Assign this SD card?</text>
<text x="75" y="192" class="small" style="fill:#ccd5da">The card becomes associated with this unit.</text>
<rect x="350" y="222" width="290" height="47" rx="4" fill="#eaf2ee"/>
<text x="435" y="253" class="label">Assign</text>
<circle cx="493" cy="246" r="69" fill="none" stroke="#d6a53e" stroke-width="4"/>
<path d="M765 245H650" stroke="#196656" stroke-width="3" marker-end="url(#arrow)"/>
<text x="785" y="230" class="label">1. Assign the card</text>
<text x="785" y="262" class="small">When prompted.</text>
<rect x="40" y="325" width="650" height="180" rx="10" fill="#242c33"/>
<text x="75" y="370" class="label" style="fill:white">Map data on SD: EU West V12</text>
<rect x="75" y="414" width="240" height="54" rx="4" fill="#d8dfdf"/><text x="150" y="449" class="label">Use SD</text>
<rect x="350" y="414" width="290" height="54" rx="4" fill="#eaf2ee"/><text x="440" y="449" class="label">Install</text>
<path d="M765 442H650" stroke="#196656" stroke-width="3" marker-end="url(#arrow)"/>
<text x="785" y="420" class="label">2. Install the maps</text><text x="785" y="452" class="small">Leave the card inserted.</text>
<rect x="40" y="535" width="650" height="180" rx="10" fill="#242c33"/>
<text x="75" y="580" class="label" style="fill:white">Navigation database</text>
<text x="75" y="627" class="mono" style="fill:#eaf2ee">Installed map version: V12</text>
<rect x="350" y="652" width="290" height="43" rx="4" fill="#eaf2ee"/><text x="417" y="681" class="label">Remove SD card</text>
<path d="M765 620H650" stroke="#196656" stroke-width="3" marker-end="url(#arrow)"/>
<text x="785" y="602" class="label">3. Check V12</text><text x="785" y="634" class="small">Eject it through the menu.</text>
<text x="40" y="772" class="small">Use SD reads maps directly from the card, which must remain in the radio.</text>''')

# Keep the full illustrated guide available locally, without GitHub or a server.
import markdown
text=(root/'docs/update-maps.md').read_text(encoding='utf-8')
text=text.replace('](images/', '](../docs/images/').replace('](map-downloads.md)', '](#map-sources)')
text=text.replace('](credits.md)', '](../docs/credits.md)').replace('](tested-results.md)', '](../docs/tested-results.md)')
text=text.replace('](native-sd-readers.md)', '](#native-reader)')
maps=(root/'docs/map-downloads.md').read_text(encoding='utf-8').replace('# RNS315 V12 EU West maps', '## Map sources')
reader=(root/'docs/native-sd-readers.md').read_text(encoding='utf-8')
reader=reader.replace("# Can I use my computer's SD slot instead of an ESP32?", '## Native SD reader notes')
reader=reader.replace('](update-maps.md#4-connect-the-esp32-and-sd-module)', '](#equipment)')
content=markdown.markdown(text+'\n\n'+maps+'\n\n'+reader, extensions=['tables','fenced_code'])
content=content.replace('<h2>Map sources</h2>','<h2 id="map-sources">Map sources</h2>')
content=content.replace('<h2>Native SD reader notes</h2>','<h2 id="native-reader">Native SD reader notes</h2>')
for heading, ident in [('4. Connect the ESP32 and SD module','equipment'),('5. Install the ESP32 program','esp32'),('8. Update the radio','radio')]:
    content=content.replace('<h2>'+heading+'</h2>',f'<h2 id="{ident}">{heading}</h2>')
(root/'calculator/guide.html').write_text('''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>RNS315 · Illustrated guide</title><link rel="stylesheet" href="assets/styles.css"></head><body><main class="guide"><header><a class="brand" href="index.html">← RNS315 calculator</a></header><article class="surface">'''+content+'''</article><footer>Original illustrations. Sources and credits are included in the repository.</footer></main></body></html>''',encoding='utf-8')
print('Created five annotated SVG illustrations and the local HTML guide.')
