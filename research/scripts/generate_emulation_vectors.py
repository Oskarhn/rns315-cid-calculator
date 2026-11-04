"""Generate public/synthetic CID vectors only; never reads the private pair.
Expected values use Python hashlib; firmware is later interpreted independently.
"""
from pathlib import Path
import hashlib,json,struct
ROOT=Path(__file__).resolve().parents[1]
samples=[('public-vw-example','5d53424c32424d31013917ca53010400'),('public-v12-example','744a605344432020103333fcb8012999'),('synthetic-zero','00'*16),('synthetic-ff','ff'*16),('synthetic-ascending',bytes(range(16)).hex()),('synthetic-descending',bytes(range(255,239,-1)).hex())]
samples.extend((f'synthetic-sha256-{i}',hashlib.sha256(f'rns315-offline-emulation-{i}'.encode()).digest()[:16].hex())for i in range(4))
salts=(0xa552f5e8,0x73935351,0x9077fadf,0xc4012483)
def crc7(data):
    value=0
    for byte in data:
        for shift in range(7,-1,-1):
            incoming=(byte>>shift)&1
            feedback=((value>>6)&1)^incoming
            value=(value<<1)&127
            if feedback:value^=9
    return value
vectors=[]
for label,text in samples:
    original=bytes.fromhex(text)
    canonical=original[:15]+bytes([crc7(original[:15])<<1])
    words=struct.unpack('>4I',canonical)
    native=struct.pack('<4I',*words)
    transformed=struct.pack('<4I',*((word+salt)&0xffffffff for word,salt in zip(words,salts)))
    vectors.append(dict(id=label,source_cid=text,canonical_cid=canonical.hex(),cid_native_le=native.hex(),expected_password=hashlib.md5(transformed).hexdigest()))
(ROOT/'evidence'/'maincodec-semantic-emulation-vectors.json').write_text(json.dumps(vectors,indent=2))
print('Generated',len(vectors),'public/synthetic offline vectors. No private record was read.')
