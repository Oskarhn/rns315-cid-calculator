// Bounded offline p-code interpretation of the actual decoded firmware routine.
// No native firmware execution, host device, process or network callbacks.
// Args: public/synthetic vector-json, result-json.
//@category Blackfin
import ghidra.app.script.GhidraScript;
import ghidra.app.emulator.EmulatorHelper;
import ghidra.program.model.address.*;
import java.nio.file.*;
import java.util.*;
import java.security.MessageDigest;
import com.google.gson.*;

public class BlackfinPasswordEmulation extends GhidraScript {
 static byte[] hex(String text){byte[] out=new byte[text.length()/2];for(int i=0;i<out.length;i++)out[i]=(byte)Integer.parseInt(text.substring(2*i,2*i+2),16);return out;}
 public void run() throws Exception {
  if(getScriptArgs().length != 2) throw new IllegalArgumentException("Expected vector JSON and result JSON paths");
  if(Files.size(Path.of(getScriptArgs()[0])) > 1000000) throw new IllegalArgumentException("Vector file too large");
  if(!"83c53981623c9f94500ab76b1844f64bc43af2a3f921b2dcd4589be04c880173".equals(currentProgram.getExecutableSHA256())) throw new IllegalArgumentException("Unexpected analysis ELF");
  for(long pc:new long[]{0x17c158,0x187820,0x187858,0x187888,0x1878b8,0x188138,0x1881d8,0x1cce88,0x1d28e0})disassemble(toAddr(pc));
  JsonArray vectors=JsonParser.parseString(Files.readString(Path.of(getScriptArgs()[0]))).getAsJsonArray();
  if(vectors.size() > 64) throw new IllegalArgumentException("Too many cases");
  for(JsonElement element:vectors){JsonObject v=element.getAsJsonObject();for(String field:new String[]{"cid_native_le","expected_password"}) if(!v.get(field).getAsString().matches("[0-9a-fA-F]{32}")) throw new IllegalArgumentException("Invalid vector bytes");}
  ArrayList<Object> rows=new ArrayList<>();
  final long stack=0x10010000L,cid=0x10030000L,out=0x10030100L,sentinel=0x10040000L;
  for(JsonElement element:vectors){
   JsonObject vector=element.getAsJsonObject();Map<String,Object> row=new LinkedHashMap<>();row.put("id",vector.get("id").getAsString());
   EmulatorHelper emu=new EmulatorHelper(currentProgram);
   long steps=0,pc=0;String error=null;boolean returned=false;
   try{
    for(String reg:new String[]{"R0","R1","R2","R3","R4","R5","R6","R7","P0","P1","P2","P3","P4","P5","I0","I1","I2","I3","M0","M1","M2","M3","B0","B1","B2","B3","L0","L1","L2","L3","LC0","LC1","LT0","LT1","LB0","LB1","ASTAT_RSV","CC","AZ","AN","AC0","AC1","AV0","AV1","V","VS"})emu.writeRegister(reg,0);
    emu.writeMemory(toAddr(0x10000000L),new byte[0x20000]);
    emu.writeMemory(toAddr(cid),new byte[0x200]);
    emu.writeMemory(toAddr(cid),hex(vector.get("cid_native_le").getAsString()));
    emu.writeRegister("SP",stack);emu.writeRegister("FP",stack);emu.writeRegister("RETS",sentinel);
    emu.writeRegister("R0",0x236a60);emu.writeRegister("R1",cid);emu.writeRegister("R2",out);
    emu.writeRegister(emu.getPCRegister(),0x17c158);
    emu.enableMemoryWriteTracking(true);
    for(;steps<1_000_000;steps++){
     pc=emu.getExecutionAddress().getOffset();
     if(pc==sentinel){returned=true;break;}
     if(pc>=0xf0000000L||!currentProgram.getMemory().contains(toAddr(pc))){error="Execution left mapped non-MMIO firmware code at "+Long.toHexString(pc);break;}
     if(!emu.step(monitor)){error=emu.getLastError();break;}
    }
    if(steps==1_000_000)error="Instruction budget exceeded";
    byte[] actual=emu.readMemory(toAddr(out),17);
    byte[] digest=Arrays.copyOfRange(actual,1,17);
    row.put("returned",returned);row.put("steps",steps);row.put("return_r0",emu.readRegister("R0").longValue());row.put("length_byte",actual[0]&255);row.put("password_matches_python",returned&&actual[0]==16&&MessageDigest.isEqual(digest,hex(vector.get("expected_password").getAsString())));
    AddressSetView written=emu.getTrackedMemoryWriteSet();
    AddressSet allowed=new AddressSet(toAddr(0x10000000L),toAddr(0x1001ffffL));allowed.add(toAddr(cid),toAddr(cid+0x1ff));
    AddressSet ramWrites=new AddressSet();Map<String,Integer> internal=new LinkedHashMap<>();
    for(AddressRange range:written.getAddressRanges()){
     if(range.getMinAddress().getAddressSpace().equals(currentProgram.getAddressFactory().getDefaultAddressSpace()))ramWrites.add(range);
     else internal.merge(range.getMinAddress().getAddressSpace().getName(),1,Integer::sum);
    }
    row.put("writes_outside_scratch_ram",!allowed.contains(ramWrites));row.put("ram_write_ranges",ramWrites.toString());row.put("internal_pcode_write_range_counts",internal);
   }catch(Exception ex){error=ex.getClass().getName()+": "+ex.getMessage();row.put("returned",returned);row.put("steps",steps);row.put("password_matches_python",false);}
   finally{emu.dispose();}
   row.put("last_pc",Long.toHexString(pc));row.put("error",error);rows.add(row);println(row.get("id")+": returned="+row.get("returned")+" match="+row.get("password_matches_python")+" steps="+steps+" error="+error);
  }
  Map<String,Object> report=new LinkedHashMap<>();report.put("method","Ghidra EmulatorHelper interpreting actual decoded Blackfin p-code");report.put("entry", "0x17C158");report.put("configuration_address","0x236A60");report.put("program",currentProgram.getName());report.put("analysis_elf_sha256",currentProgram.getExecutableSHA256());report.put("language",currentProgram.getLanguageID().toString());report.put("instruction_limit_per_case",1000000);report.put("cases",rows);report.put("private_paid_pair_used",false);report.put("physical_radio_or_sd_access",false);report.put("native_firmware_executed",false);report.put("firmware_interpreted_offline",true);report.put("limitation","CID normalization is a supplied input representation; this does not emulate physical SDH response capture.");
  Files.writeString(Path.of(getScriptArgs()[1]),new GsonBuilder().setPrettyPrinting().create().toJson(report));
 }
}
