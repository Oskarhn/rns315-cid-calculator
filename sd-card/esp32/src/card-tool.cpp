// RNS315_SD_TOOL_1: CID-bound, explicit-commit SD password operations.
// No filesystem or sector writes, no erase/CID change, no automatic CMD42.
// ASVS V2.2: strict field sizes, known operations and a short-lived commit token.
// Password bytes stay in RAM and are never echoed or written to ESP32 NVS.
#include <Arduino.h>
#include <SPI.h>
#include <inttypes.h>
#include <esp_system.h>

constexpr int PIN_SCK = 18;
constexpr int PIN_MISO = 19;
constexpr int PIN_MOSI = 23;
constexpr int PIN_CS = 27;
constexpr char BANNER[] = "RNS315_SD_TOOL_1";
static uint32_t spiHz = 250000;
static bool selfTestOK = false;

static uint8_t crc7(const uint8_t *bytes, size_t count) {
  uint8_t crc = 0;
  for (size_t i = 0; i < count; ++i) {
    for (uint8_t mask = 0x80; mask; mask >>= 1) {
      const bool feedback = bool(crc & 0x40) != bool(bytes[i] & mask);
      crc = uint8_t((crc << 1) & 0x7f);
      if (feedback) crc ^= 0x09;
    }
  }
  return crc;
}

static uint16_t crc16(const uint8_t *bytes, size_t count) {
  uint16_t crc = 0;
  for (size_t i = 0; i < count; ++i) {
    crc ^= uint16_t(bytes[i]) << 8;
    for (int bit = 0; bit < 8; ++bit)
      crc = (crc & 0x8000) ? uint16_t((crc << 1) ^ 0x1021) : uint16_t(crc << 1);
  }
  return crc;
}

static bool allowedCommand(uint8_t cmd) {
  switch (cmd) {
    case 0: case 8: case 9: case 10: case 13: case 41: case 42: case 55: case 58:
      return true;
    default: return false;
  }
}

static bool waitReady(uint32_t timeoutMs) {
  const uint32_t start = millis();
  do {
    if (SPI.transfer(0xff) == 0xff) return true;
    yield();
  } while (uint32_t(millis() - start) < timeoutMs);
  return false;
}

static void finishCommand() {
  digitalWrite(PIN_CS, HIGH);
  SPI.transfer(0xff);
  SPI.endTransaction();
}

// Caller always finishes the transaction, even when response is 0xff.
static uint8_t command(uint8_t cmd, uint32_t arg) {
  SPI.beginTransaction(SPISettings(spiHz, MSBFIRST, SPI_MODE0));
  digitalWrite(PIN_CS, LOW);
  if (!allowedCommand(cmd) || !waitReady(250)) return 0xff;
  const uint8_t packet[] = {uint8_t(0x40 | cmd), uint8_t(arg >> 24),
                           uint8_t(arg >> 16), uint8_t(arg >> 8), uint8_t(arg)};
  for (uint8_t byte : packet) SPI.transfer(byte);
  SPI.transfer(uint8_t((crc7(packet, sizeof packet) << 1) | 1));
  for (int i = 0; i < 16; ++i) {
    const uint8_t response = SPI.transfer(0xff);
    if (!(response & 0x80)) return response;
  }
  return 0xff;
}

static bool initializeCard() {
  spiHz = 250000;
  digitalWrite(PIN_CS, HIGH);
  SPI.beginTransaction(SPISettings(spiHz, MSBFIRST, SPI_MODE0));
  for (int i = 0; i < 10; ++i) SPI.transfer(0xff);
  SPI.endTransaction();
  uint8_t response = 0xff;
  for (int attempt = 0; attempt < 10; ++attempt) {
    response = command(0, 0);
    finishCommand();
    if (response == 1) break;
    delay(10);
  }
  if (response != 1) {
    Serial.printf("ERROR CMD0 R1=0x%02X; check wiring, supply and card\n", response);
    return false;
  }
  response = command(8, 0x1aa);
  const bool version2 = response == 1;
  uint8_t r7[4] = {};
  if (version2) for (uint8_t &byte : r7) byte = SPI.transfer(0xff);
  finishCommand();
  if ((version2 && (r7[2] != 1 || r7[3] != 0xaa)) || (!version2 && response != 5)) {
    Serial.printf("ERROR CMD8 R1=0x%02X; response is not a supported SD card\n", response);
    return false;
  }
  const uint32_t start = millis();
  bool ready = false;
  do {
    response = command(55, 0);
    finishCommand();
    if (response > 1) break;
    response = command(41, version2 ? 0x40000000 : 0);
    finishCommand();
    if (response == 0) { ready = true; break; }
    if (response != 1) break;
    delay(10);
  } while (uint32_t(millis() - start) < 4000);
  if (!ready) {
    Serial.printf("ERROR ACMD41 R1=0x%02X; card did not initialize\n", response);
    return false;
  }
  response = command(58, 0);
  uint8_t ocr[4] = {};
  if (response == 0) for (uint8_t &byte : ocr) byte = SPI.transfer(0xff);
  finishCommand();
  if (response != 0 || !(ocr[0] & 0x80)) {
    Serial.printf("ERROR CMD58 R1=0x%02X; invalid OCR\n", response);
    return false;
  }
  Serial.printf("OCR=%02X%02X%02X%02X\n",ocr[0],ocr[1],ocr[2],ocr[3]);
  Serial.printf("BLOCK_ADDRESSING=%s\n", (ocr[0] & 0x40) ? "yes" : "no");
  spiHz = 1000000;
  return true;
}

static bool readRegister(uint8_t cmd, uint8_t (&data)[16]) {
  const uint8_t response = command(cmd, 0);
  if (response != 0) {
    finishCommand();
    Serial.printf("ERROR CMD%u R1=0x%02X\n", cmd, response);
    return false;
  }
  uint8_t token = 0xff;
  const uint32_t start = millis();
  do {
    token = SPI.transfer(0xff);
    if (token != 0xff) break;
    yield();
  } while (uint32_t(millis() - start) < 500);
  if (token != 0xfe) {
    finishCommand();
    Serial.printf("ERROR CMD%u token=0x%02X\n", cmd, token);
    return false;
  }
  for (uint8_t &byte : data) byte = SPI.transfer(0xff);
  uint16_t received = uint16_t(SPI.transfer(0xff)) << 8;
  received |= SPI.transfer(0xff);
  finishCommand();
  const uint16_t calculated = crc16(data, sizeof data);
  Serial.printf("CMD%u_DATA_CRC16=%s received=%04X calculated=%04X\n",
                cmd, received == calculated ? "OK" : "FAIL", received, calculated);
  return received == calculated;
}

static void printHex(const char *label, const uint8_t (&data)[16]) {
  Serial.print(label);
  for (uint8_t byte : data) Serial.printf("%02X", byte);
  Serial.println();
}

static void readOnlyReport() {
  Serial.println("BEGIN_READONLY_REPORT");
  Serial.println(BANNER);
  Serial.printf("CHIP=%s\n", ESP.getChipModel());
  Serial.printf("PINS SCK=%d MISO=%d MOSI=%d CS=%d\n", PIN_SCK,PIN_MISO,PIN_MOSI,PIN_CS);
  if (!selfTestOK || !initializeCard()) { Serial.println("END_READONLY_REPORT ERROR"); return; }
  uint8_t cid[16] = {}, csd[16] = {};
  const bool cidOK = readRegister(10, cid);
  const bool csdOK = readRegister(9, csd);
  if (cidOK) printHex("CID_HEX=", cid);
  if (csdOK) {
    printHex("CSD_HEX=", csd);
    const uint16_t classes = (uint16_t(csd[4]) << 4) | (csd[5] >> 4);
    Serial.printf("COMMAND_CLASSES=0x%03X\nCCC7_PASSWORD_CLASS_ADVERTISED=%s\n",classes,(classes & 0x80) ? "yes" : "no");
    if ((csd[0] >> 6) == 1) {
      const uint32_t csize = (uint32_t(csd[7] & 0x3f) << 16) | (uint32_t(csd[8]) << 8) | csd[9];
      const uint64_t bytes = uint64_t(csize + 1) * 512ULL * 1024ULL;
      Serial.printf("CAPACITY_BYTES=%" PRIu64 "\nCAPACITY_CLASS=%s\n",bytes,bytes > 32ULL*1024*1024*1024 ? "SDXC" : "SDHC");
    }
  }
  const uint8_t r1 = command(13, 0);
  const uint8_t r2 = r1 == 0 ? SPI.transfer(0xff) : 0xff;
  finishCommand();
  Serial.printf("CMD13_R1=0x%02X R2=0x%02X\n",r1,r2);
  if (r1 == 0) Serial.printf("CARD_LOCKED_FLAG=%s\n",(r2 & 1) ? "yes" : "no");
  Serial.println("THIS_REPORT_WRITES=NONE; CMD42_NOT_SENT_BY_READ_REPORT");
  Serial.println(cidOK && csdOK && r1==0 && (r2 & 0xfe)==0 ? "END_READONLY_REPORT OK" : "END_READONLY_REPORT ERROR");
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  const uint8_t cmd0[] = {0x40,0,0,0,0};
  const uint8_t cmd8[] = {0x48,0,0,1,0xaa};
  const uint8_t check[] = {'1','2','3','4','5','6','7','8','9'};
  selfTestOK = (((crc7(cmd0,5) << 1) | 1) == 0x95) &&
               (((crc7(cmd8,5) << 1) | 1) == 0x87) && crc16(check,9) == 0x31c3;
  Serial.println(BANNER);
  Serial.printf("CRC_SELFTEST=%s\n", selfTestOK ? "OK" : "FAIL");
  pinMode(PIN_CS,OUTPUT);
  digitalWrite(PIN_CS,HIGH);
  SPI.begin(PIN_SCK,PIN_MISO,PIN_MOSI,PIN_CS);
  readOnlyReport();
}


static char expectedCid[33] = {};
static uint8_t preparedPassword[16] = {};
static bool prepared = false;
static uint8_t preparedMode = 0;
static uint32_t preparedAt = 0, commitToken = 0;
static char inputLine[128] = {};
static size_t inputLength = 0;
static bool overflowed = false;

static int hexDigit(char c) {
  if (c >= '0' && c <= '9') return c-'0';
  if (c >= 'a' && c <= 'f') return c-'a'+10;
  if (c >= 'A' && c <= 'F') return c-'A'+10;
  return -1;
}

static void clearPrepared() {
  volatile uint8_t *bytes=preparedPassword;
  for (size_t i=0;i<sizeof preparedPassword;++i) bytes[i]=0;
  memset(expectedCid,0,sizeof expectedCid);
  prepared=false; preparedMode=0; commitToken=0; preparedAt=0;
}

static bool cardStatus(uint8_t &status) {
  const uint8_t r1=command(13,0);
  status=r1==0 ? SPI.transfer(0xff) : 0xff;
  finishCommand();
  if (r1!=0 || status==0xff) {
    Serial.printf("STATUS_INVALID R1=%02X R2=%02X\n",r1,status); return false;
  }
  return true;
}

static bool checkBoundCard(bool &locked) {
  if (!selfTestOK || !initializeCard()) return false;
  uint8_t cid[16]={},csd[16]={};
  if (!readRegister(10,cid) || !readRegister(9,csd)) return false;
  char actual[33]={};
  for(size_t i=0;i<16;++i) snprintf(actual+2*i,3,"%02X",cid[i]);
  if (strcmp(actual,expectedCid)!=0 || (csd[0]>>6)!=1) {
    Serial.println("CARD_IDENTITY_MISMATCH; NO_PASSWORD_OPERATION"); return false;
  }
  const uint32_t csize=(uint32_t(csd[7]&0x3f)<<16)|(uint32_t(csd[8])<<8)|csd[9];
  const uint64_t capacity=uint64_t(csize+1)*512ULL*1024ULL;
  const uint16_t classes=(uint16_t(csd[4])<<4)|(csd[5]>>4);
  if (capacity==0 || !(classes&0x80)) {
    Serial.println("CARD_CAPACITY_OR_CCC7_MISMATCH"); return false;
  }
  uint8_t status=0xff;
  if (!cardStatus(status) || (status&0xfe)) return false;
  locked=bool(status&1);
  Serial.printf("BOUND_CARD_OK CID=%s CAPACITY=%" PRIu64 " LOCKED=%s\n",actual,capacity,locked?"yes":"no");
  return true;
}

static void prepareOperation(char *line) {
  clearPrepared();
  char *save=nullptr;
  char *verb=strtok_r(line," ",&save);
  char *operation=strtok_r(nullptr," ",&save);
  char *cid=strtok_r(nullptr," ",&save);
  char *password=strtok_r(nullptr," ",&save);
  char *extra=strtok_r(nullptr," ",&save);
  if (!verb || strcmp(verb,"PREPARE") || !operation || !cid || !password || extra ||
      strlen(cid)!=32 || strlen(password)!=32 ||
      (strcmp(operation,"LOCK") && strcmp(operation,"CLEAR"))) {
    Serial.println("PREPARE_REJECTED; NO_PASSWORD_OPERATION"); return;
  }
  // ASVS 2.2.1 / 1.4.1: validate the complete identity before bounded copy.
  for(size_t i=0;i<32;++i) {
    if(hexDigit(cid[i])<0) {Serial.println("CID_HEX_INVALID"); return;}
    expectedCid[i]="0123456789ABCDEF"[hexDigit(cid[i])];
  }
  expectedCid[32]=0;
  for(size_t i=0;i<16;++i) {
    int high=hexDigit(password[2*i]),low=hexDigit(password[2*i+1]);
    if(high<0||low<0) {clearPrepared();Serial.println("PASSWORD_HEX_INVALID");return;}
    preparedPassword[i]=uint8_t((high<<4)|low);
  }
  bool locked=false;
  if(!checkBoundCard(locked)) {clearPrepared();return;}
  const bool lock=strcmp(operation,"LOCK")==0;
  if(lock && locked) {clearPrepared();Serial.println("ALREADY_LOCKED; NO_OPERATION");return;}
  preparedMode=lock?0x05:0x02; // Only SET_PWD|LOCK or CLR_PWD. Never FORCE_ERASE.
  commitToken=esp_random();
  preparedAt=millis(); prepared=true;
  Serial.printf("PREPARED %s TOKEN=%08X EXPIRES_MS=60000; CMD42_NOT_YET_SENT\n",operation,commitToken);
}

static void commitOperation(const char *line) {
  if(!prepared || uint32_t(millis()-preparedAt)>60000 || strlen(line)!=15 || strncmp(line,"COMMIT ",7)) {
    clearPrepared();Serial.println("COMMIT_REJECTED");return;
  }
  uint32_t supplied=0;
  for(int i=7;i<15;++i) {
    const int nibble=hexDigit(line[i]);
    if(nibble<0) {clearPrepared();Serial.println("COMMIT_REJECTED");return;}
    supplied=(supplied<<4)|uint32_t(nibble);
  }
  if(supplied!=commitToken) {clearPrepared();Serial.println("COMMIT_REJECTED");return;}
  bool wasLocked=false;
  if(!checkBoundCard(wasLocked) || (preparedMode==0x05 && wasLocked)) {clearPrepared();return;}
  uint8_t block[512]={};
  const uint8_t mode=preparedMode;
  block[0]=mode; block[1]=16;
  memcpy(block+2,preparedPassword,16);
  const uint16_t checksum=crc16(block,sizeof block);
  const uint8_t r1=command(42,0);
  if(r1!=0) {finishCommand();clearPrepared();memset(block,0,sizeof block);Serial.printf("CMD42_REJECTED R1=%02X\n",r1);return;}
  SPI.transfer(0xff); SPI.transfer(0xfe);
  for(uint8_t byte:block) SPI.transfer(byte);
  SPI.transfer(uint8_t(checksum>>8)); SPI.transfer(uint8_t(checksum));
  uint8_t response=0xff;
  for(int i=0;i<64 && response==0xff;++i) response=SPI.transfer(0xff);
  const bool accepted=(response&0x1f)==0x05;
  const bool ready=waitReady(5000);
  finishCommand();
  clearPrepared(); memset(block,0,sizeof block);
  uint8_t status=0xff;
  const bool valid=cardStatus(status);
  Serial.printf("CMD42_RESULT DATA_RESPONSE=%02X READY=%s STATUS=%02X\n",response,ready?"yes":"no",status);
  if(accepted && ready && valid && ((mode==0x05 && status==1)||(mode==0x02 && status==0)))
    Serial.println(mode==0x05?"LOCK_VERIFIED":"PASSWORD_CLEAR_VERIFIED");
  else Serial.println("PASSWORD_OPERATION_NOT_VERIFIED; KEEP_THE_PASSWORD_RECORD; DO_NOT_GUESS_OR_ERASE");
}

static void handleLine(char *line) {
  if(!strcmp(line,"r") || !strcmp(line,"READ")) {clearPrepared();readOnlyReport();}
  else if(!strcmp(line,"CANCEL")) {clearPrepared();Serial.println("PREPARATION_CANCELLED");}
  else if(!strncmp(line,"PREPARE ",8)) prepareOperation(line);
  else if(!strncmp(line,"COMMIT ",7)) commitOperation(line);
  else {clearPrepared();Serial.println("UNKNOWN_COMMAND; NO_PASSWORD_OPERATION");}
}

void loop() {
  static uint32_t lastBanner=0;
  if(uint32_t(millis()-lastBanner)>=2000) {
    Serial.println("READY_RNS315_SD_TOOL_1; password writes require PREPARE and COMMIT"); lastBanner=millis();
  }
  if(prepared && uint32_t(millis()-preparedAt)>60000) {clearPrepared();Serial.println("PREPARATION_EXPIRED");}
  while(Serial.available()) {
    const char c=char(Serial.read());
    if(c=='\r') continue;
    if(c=='\n') {
      if(!overflowed) {inputLine[inputLength]=0;handleLine(inputLine);}
      else {clearPrepared();Serial.println("INPUT_TOO_LONG; NO_PASSWORD_OPERATION");}
      memset(inputLine,0,sizeof inputLine);inputLength=0;overflowed=false;
    } else if(!overflowed) {
      if(inputLength+1<sizeof inputLine) inputLine[inputLength++]=c;
      else {memset(inputLine,0,sizeof inputLine);inputLength=0;overflowed=true;clearPrepared();}
    }
  }
  delay(10);
}
