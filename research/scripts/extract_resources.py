"""Offline Technisat v5 resource decoder; only writes under resource-decoded.

Observed format: cumulative LE32 deltas, then 4 KiB independent byte-LZSS pages.
No card, radio, serial, network or firmware-execution operations.
"""
from pathlib import Path
import struct, json, hashlib, math, re

BASE=Path(__file__).resolve().parents[1]
OUT=BASE/'private-artifacts/resource-decoded'
MAGIC=0x65117485

def undelta(data):
    out=bytearray();state=0
    for off in range(0,len(data),4):
        n=min(4,len(data)-off);mask=(1<<(8*n))-1
        state=(state+int.from_bytes(data[off:off+n],'little'))&mask
        out.extend(state.to_bytes(n,'little'))
    return bytes(out)

def redelta(data):
    out=bytearray();previous=0
    for off in range(0,len(data),4):
        n=min(4,len(data)-off);mask=(1<<(8*n))-1
        value=int.from_bytes(data[off:off+n],'little')
        out.extend(((value-previous)&mask).to_bytes(n,'little'))
        previous=value
    return bytes(out)

def lzss_page(data,expected):
    out=bytearray();pos=0;tokens=0
    while pos<len(data):
        flags=data[pos];pos+=1
        for bit in range(8):
            if pos==len(data):break
            if flags&(1<<bit):
                out.append(data[pos]);pos+=1
            else:
                if pos+2>len(data):raise ValueError('truncated reference')
                token=int.from_bytes(data[pos:pos+2],'little');pos+=2
                distance=(token&0xfff)+1
                length=(token>>12)+3
                if distance>len(out):raise ValueError('reference before page start')
                for _ in range(length):out.append(out[-distance])
            tokens+=1
            if len(out)>expected:raise ValueError('page output exceeds declared size')
    if len(out)!=expected:raise ValueError(f'page length {len(out)}, expected {expected}')
    return bytes(out),tokens

def extract(path):
    raw=path.read_bytes();data=undelta(raw)
    magic,version,count,page_size,total_size,data_start=struct.unpack_from('<6I',data)
    if magic!=MAGIC or version!=5:raise ValueError('not observed v5 resource format')
    if page_size!=4096 or not 0<total_size<=64*1024*1024:raise ValueError('unsupported size')
    if count!=math.ceil(total_size/page_size) or data_start!=24+count*4:raise ValueError('invalid page table')
    ends=struct.unpack_from(f'<{count}I',data,24)
    if not 0<=len(data)-ends[-1]<=3:raise ValueError(f'last page end differs from file size by {len(data)-ends[-1]} bytes')
    if any(a>=b for a,b in zip((data_start,)+ends[:-1],ends)):raise ValueError('invalid page boundaries')
    decoded=bytearray();page_lengths=[];total_tokens=0;start=data_start
    for end in ends:
        expected=min(page_size,total_size-len(decoded))
        page,tokens=lzss_page(data[start:end],expected)
        decoded.extend(page);page_lengths.append(len(page));total_tokens+=tokens;start=end
    if redelta(data)!=raw:raise ValueError('delta roundtrip failed')
    outpath=OUT/(path.stem+'-decoded.bin');outpath.write_bytes(decoded)
    names=[m.decode('ascii') for m in re.findall(rb'[a-zA-Z0-9_\-./]{3,}\.(?:bin|dat|png|bmp|ttf|wav)',decoded)[:12]]
    return {'record':path.stem,'source_size':len(raw),'source_sha256':hashlib.sha256(raw).hexdigest(),'decoded_size':len(decoded),'decoded_sha256':hashlib.sha256(decoded).hexdigest(),'version':version,'page_size':page_size,'pages':count,'all_page_sizes_match':True,'last_page_size':page_lengths[-1],'references_in_bounds':True,'delta_roundtrip_exact':True,'total_lz_tokens':total_tokens,'outer_trailing_bytes_ignored':len(data)-ends[-1],'output':str(outpath),'inner_magic_le32':hex(struct.unpack_from('<I',decoded)[0]),'inner_name_candidates':names}

def selftest():
    assert undelta(redelta(b'\x01\x02\x03\x04\x05\x06\x07'))==b'\x01\x02\x03\x04\x05\x06\x07'
    assert lzss_page(b'\xffABCDEFGH',8)[0]==b'ABCDEFGH'
    assert lzss_page(b'\x01A\x00\x00',4)[0]==b'AAAA'
    try:lzss_page(b'\x00\x00\x00',3)
    except ValueError:pass
    else:raise AssertionError('invalid distance accepted')

if __name__=='__main__':
    selftest();OUT.mkdir(exist_ok=True)
    results=[];errors=[]
    for p in sorted((BASE/'private-artifacts/records-v2').glob('record-*.bin')):
        with p.open('rb') as f:magic=f.read(4)
        if magic!=struct.pack('<I',MAGIC):continue
        try:r=extract(p);results.append(r);print(r['record'],r['decoded_size'],r['pages'],r['inner_name_candidates'][:3],flush=True)
        except (ValueError,struct.error) as e:errors.append({'record':p.stem,'error':str(e)})
    report={'status':'decoded-with-structural-validation' if not errors else 'partial','algorithm':'cumulative-LE32-delta then independent byte-LZSS pages','tests':['delta roundtrip including 3-byte tail','8 literal bytes','overlapping backreference','invalid reference rejected'],'resources_decoded':len(results),'total_decoded_bytes':sum(r['decoded_size'] for r in results),'results':results,'errors':errors,'limits':['Static decoding only; no target execution or device operations.','This format recovery does not establish any CID-to-password derivation.','Extracted resource payloads remain private artifacts; no publication performed.']}
    (BASE/'evidence/resource-extraction-validated.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print('SUMMARY',report['resources_decoded'],report['total_decoded_bytes'],'errors',errors)
