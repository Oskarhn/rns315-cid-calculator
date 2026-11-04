"""Wrap decoded segments in an analysis-only ELF32/Blackfin container.

This ELF is manufactured for disassembly; it is not an original executable.
ASVS 5.2.1/5.3.2: bounded segments, fixed filenames, digest validation.
"""
from pathlib import Path
import hashlib,json,struct
ROOT=Path(__file__).resolve().parents[1]

def main():
    decoded=json.loads((ROOT/'evidence'/'decoded-programs.json').read_text())
    for program in decoded:
        record=program['record'];segments=[]
        if any(f['status']=='failed' for f in program['frames']):raise ValueError('Incomplete decoded image')
        for f in program['frames']:
            if f['status']!='decoded':continue
            data=(ROOT/'private-artifacts'/'decoded-programs'/f['file_name']).read_bytes()
            if len(data)!=f['output_size'] or hashlib.sha256(data).hexdigest()!=f['sha256']:
                raise ValueError('Segment provenance mismatch')
            if f['address']+len(data)>1<<32:raise ValueError('32-bit address overflow')
            segments.append(dict(name=f".frame{f['index']:04d}",address=f['address'],data=data,source=f['file_name']))
        ordered=sorted(segments,key=lambda s:s['address'])
        for a,b in zip(ordered,ordered[1:]):
            if a['address']+len(a['data'])>b['address']:raise ValueError('Overlapping segments require an explicit policy')
        phnum=len(segments);offset=(52+phnum*32+15)&~15
        buf=bytearray(offset);headers=[];sections=[bytes(40)];names=bytearray(b'\x00');mapping=[]
        for s in segments:
            nameoff=len(names);names.extend(s['name'].encode()+b'\x00')
            fileoff=len(buf);buf.extend(s['data'])
            headers.append(struct.pack('<8I',1,fileoff,s['address'],s['address'],len(s['data']),len(s['data']),7,1))
            sections.append(struct.pack('<10I',nameoff,1,7,s['address'],fileoff,len(s['data']),0,0,1,0))
            mapping.append(dict(name=s['name'],address=s['address'],file_offset=fileoff,size=len(s['data']),source=s['source'],sha256=hashlib.sha256(s['data']).hexdigest()))
            buf.extend(bytes((-len(buf))%16))
        nameoff=len(names);names.extend(b'.shstrtab\x00');namesoff=len(buf);buf.extend(names);buf.extend(bytes((-len(buf))%4));shoff=len(buf)
        sections.append(struct.pack('<10I',nameoff,3,0,0,namesoff,len(names),0,0,1,0));buf.extend(b''.join(sections))
        entries=[f['address'] for f in program['frames'] if f['type']==6];entry=entries[-1] if entries else segments[0]['address']
        ident=b'\x7fELF'+bytes([1,1,1,0])+bytes(8)
        buf[:52]=struct.pack('<16sHHIIIIIHHHHHH',ident,2,106,1,entry,52,shoff,0,52,32,phnum,40,len(sections),len(sections)-1)
        buf[52:52+32*phnum]=b''.join(headers)
        output=ROOT/'private-artifacts'/f'analysis-record-{record:04d}.elf';output.write_bytes(buf)
        # Validate every source segment against the generated carrier independently.
        for s in mapping:
            if hashlib.sha256(buf[s['file_offset']:s['file_offset']+s['size']]).hexdigest()!=s['sha256']:
                raise ValueError('Carrier integrity check failed')
        evidence=dict(record=record,path=output.name,sha256=hashlib.sha256(buf).hexdigest(),bytes=len(buf),elf_machine=106,entrypoint_inferred_from_type6=entry,segments=mapping,limitations=['Wrapper permissions RWX are an analysis choice, not observed firmware memory permissions.','No target code executed; file addresses preserve decoded frame load metadata.'])
        (ROOT/'evidence'/f'analysis-elf-{record:04d}.json').write_text(json.dumps(evidence,indent=2))
        print(json.dumps({k:v for k,v in evidence.items() if k!='segments'},indent=2))
if __name__=='__main__':main()
