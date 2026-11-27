# Trying to break Easy Start

The published **v1.1.0** ZIP was downloaded and tested in isolated browser sessions. The aim was to make the app accept bad state, send an unexpected card operation or get stuck when USB stopped responding. No SD card or physical ESP32 was connected.

## What broke, and what changed in v1.1.1

| Scenario | v1.1.0 behavior | v1.1.1 behavior |
|---|---|---|
| A device confirmed `CLEAR` after the user chose `LOCK` | The app sent `COMMIT` despite the mismatched operation. | The exact operation and acknowledgement format must match before a commit is sent. |
| One status report contained two different CIDs | The parser used the first CID. | Duplicate or ambiguous identity/status fields are rejected. |
| Closing a calculator connection never finished | The controls stayed busy. | Cleanup has a deadline, the connection is invalidated, and the user is told to unplug USB. |
| Installer connection or flash-size detection never finished | The installer stayed busy. | Each phase has a deadline and stops without starting the next phase. |
| Firmware writing never finished | The installer stayed busy indefinitely. | A deadline reports that installation may be incomplete and requires reconnecting USB before retrying. |
| Automatic restart or USB cleanup never finished | The installer stayed busy even after the program had been verified. | These optional cleanup steps are bounded, with manual restart guidance. |
| Old progress callbacks arrived after a failed installation | Progress could still change. | Progress is accepted only for the active write attempt. |

These were reproduced using fake serial ports or loader objects. The hardware could not be damaged by these tests. The timeouts are shortened in the test harness so a hung operation can be checked quickly; the released installer uses 60 seconds for connection, 30 seconds for flash detection, 180 seconds for writing, 5 seconds for restart and 3 seconds for cleanup.

## Checks that already held up

- Repeated clicks did not create repeated card commits or repeated firmware installations.
- A card identity change during the preflight check blocked password preparation.
- HTML supplied as a CID was rejected, and device log text was displayed as text rather than executed.
- Corrupting the embedded firmware payload left installation disabled under the release's content security policy.
- Oversized serial data was rejected and the connection returned to a recoverable state.

## Repeat the checks

`npm test` covers the parsers, command acknowledgement checks and cleanup deadlines. `npm run test:release` extracts the real ZIP into a path containing spaces and exercises it in Chrome and Edge, including 13 installer scenarios and 6 card-connection scenarios per browser, plus a corrupted-payload check.

These tests check software behavior under simulated faults. A timeout cannot prove that a physical write never started or that an unplugged board is ready to use. After an interrupted installation, reconnect USB and install again; check real card state before another card operation. The two working card tests remain described in [tested-results.md](tested-results.md).
