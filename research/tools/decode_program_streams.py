"""Decode RNS315 program streams using embedded RC4 metadata and word-LZ.

Static analysis only: no target code is executed or device is opened.
ASVS 5.2.1/5.2.3: bound all frame and output sizes.
ASVS 5.3.2: numeric output filenames; archive names are never disk paths.
RC4 here reproduces an existing format and is not a new security mechanism.
"""
from pathlib import Path
import hashlib,json,re
from firmware_codecs import decode_lz
from firmware_codecs import rc4_stream as stream
ROOT=Path(__file__).resolve().parents[1]

def main():
    outer=json.loads((ROOT/'evidence'/'tsd-records.json').read_text())['records']
    key=bytes.fromhex(next(r['metadata_hex'] for r in outer if r['tag']=='0x8005'))
    directory=ROOT/'private-artifacts'/'decoded-programs';directory.mkdir(exist_ok=True)
    result=[]
    for record in (58,66):
        inventory=json.loads((ROOT/'evidence'/f'maincodec-record{record:04d}-frames.json').read_text())
        if not inventory['all_checksums_match'] or inventory['parsed_end']!=inventory['input_size']:
            raise ValueError('Frame inventory is not verified')
        data=(ROOT/'private-artifacts'/'records-v2'/f'record-{record:04d}-swap16.bin').read_bytes()
        if hashlib.sha256(data).hexdigest()!=inventory['normalized_sha256']:
            raise ValueError('Inventory input digest mismatch')
        count=sum((f['payload_bytes']+33)//34 for f in inventory['frames'] if f['type']==5)
        masks=stream(key,count);cursor=0;frames=[]
        for frame in inventory['frames']:
            index=frame['index'];kind=frame['type'];start=frame['payload_offset']
            packed=data[start:start+frame['payload_bytes']]
            info={k:frame[k] for k in ('index','type','address','size_field','payload_bytes','checksum')}
            if kind not in (3,4,5):
                info['status']='control-or-fill';frames.append(info);continue
            if kind==5:
                groups=(len(packed)+33)//34;mask_start=cursor
                packed=bytes(v^masks[cursor+i//34] for i,v in enumerate(packed));cursor+=groups
                info.update(rc4_group_start=mask_start,rc4_groups=groups)
            try:
                if kind==3:output=packed
                else:output,refs=decode_lz(packed);info['reference_counts']=refs
            except ValueError as e:
                info.update(status='failed',error=str(e));frames.append(info);continue
            name=f'record-{record:04d}-frame-{index:04d}.bin';dest=directory/name;dest.write_bytes(output)
            info.update(status='decoded',file_name=name,output_size=len(output),output_end=frame['address']+len(output),sha256=hashlib.sha256(output).hexdigest())
            strings=[dict(offset=m.start(),address=frame['address']+m.start(),text=m.group().decode()) for m in re.finditer(rb'[\x20-\x7e]{6,}',output)]
            (ROOT/'evidence'/f'decoded-{record:04d}-{index:04d}-strings.json').write_text(json.dumps(strings,indent=2),encoding='utf-8')
            info['ascii_string_count']=len(strings)
            info['keyword_strings']=[s for s in strings if re.search(r'password|unlock|CMD42|sdcard|sd.card|navpsf|deviceid|CID|MD5|crypt|AES',s['text'],re.I)]
            frames.append(info)
        record_result=dict(record=record,input_sha256=inventory['normalized_sha256'],rc4_groups=cursor,rc4_reset='per program stream; continuous across type5 frames',frames=frames)
        result.append(record_result)
    (ROOT/'evidence'/'decoded-programs.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    for r in result:
        good=[f for f in r['frames'] if f['status']=='decoded'];bad=[f for f in r['frames'] if f['status']=='failed']
        print(json.dumps(dict(record=r['record'],decoded_frames=len(good),decoded_bytes=sum(f['output_size'] for f in good),failed_frames=bad,keyword_strings=[dict(frame=f['index'],matches=f['keyword_strings'][:60]) for f in good if f['keyword_strings']]),indent=2))
if __name__=='__main__':main()
