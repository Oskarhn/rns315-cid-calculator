"""Parse observed word-normalized Blackfin stream framing without execution.

ASVS 5.2.1/5.3.2: bounded exact input digests, fixed numeric output paths.
Types are structural observations; raw/fill/execute semantics need code tracing.
"""
from pathlib import Path
import collections
import hashlib
import json
import struct

ROOT=Path(__file__).resolve().parents[1]
EXPECTED={58:'df2a9a3da6772bc7dccb36adbddc778a04dfb56ff4ea701810a7edf817b13efd',66:'5d2a077f87d0a2c69ea23abe0e7ba21e9ea4af30824b1689673154eb9aa31565'}

def parse(index):
    source=ROOT/'private-artifacts'/'records-v2'/f'record-{index:04d}-swap16.bin'
    data=source.read_bytes()
    if hashlib.sha256(data).hexdigest()!=EXPECTED[index]:
        raise ValueError('Unexpected normalized input')
    p=0
    frames=[]
    for n in range(10000):
        if p==len(data):break
        if p+12>len(data):raise ValueError('Truncated frame header')
        typ,check,addr,size=struct.unpack_from('<HHII',data,p)
        if typ in (4,5):payload_size=size*2
        elif typ==3:payload_size=size
        elif typ in (2,6,8):payload_size=0
        else:raise ValueError(f'Unknown frame type {typ:x} at {p:x}')
        start=p+12
        end=start+payload_size
        if end>len(data):raise ValueError('Frame outside input')
        blob=data[start:end]
        calculated=(typ+(addr&65535)+(size&65535))&65535
        if typ in (4,5):
            calculated=(calculated+sum(struct.unpack('<'+str(len(blob)//2)+'H',blob)))&65535
        if calculated!=check:raise ValueError(f'Frame checksum mismatch {n}')
        next_offset=(end+3)&~3
        if next_offset>len(data) or data[end:next_offset]!=bytes(next_offset-end):
            raise ValueError('Nonzero/outside padding')
        frame=dict(index=n,header_offset=p,type=typ,checksum=check,checksum_calculated=calculated,address=addr,size_field=size,payload_offset=start,payload_bytes=payload_size,padding_bytes=next_offset-end,payload_sha256=hashlib.sha256(blob).hexdigest(),payload_first16=blob[:16].hex())
        frames.append(frame)
        if payload_size:
            destination=ROOT/'private-artifacts'/f'maincodec-record{index:04d}-frame{n:04d}.bin'
            if destination.exists() and destination.read_bytes()!=blob:
                raise ValueError('Existing output differs')
            if not destination.exists():destination.write_bytes(blob)
        p=next_offset
    if p!=len(data):raise ValueError('Iteration limit before EOF')
    report=dict(normalized_record=index,normalized_sha256=EXPECTED[index],input_size=len(data),parsed_end=p,frame_count=len(frames),types=dict(collections.Counter(f['type'] for f in frames)),all_checksums_match=True,checksum_rule='(type + address_low16 + size_low16 + sum(payload LE16 words for types 4/5 only)) modulo65536',frames=frames,target_executed=False)
    (ROOT/'evidence'/f'maincodec-record{index:04d}-frames.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='frames'},indent=2))

if __name__=='__main__':
    for n in (58,66):parse(n)
