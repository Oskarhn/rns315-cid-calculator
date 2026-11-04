# Run the checks

From the repository root:

```text
python -m unittest discover -s tests -v
npm test
```

Python needs no extra packages. `npm test` runs the Node.js checks without installing browser dependencies.

| Check | Covers |
|---|---|
| `test_password_calculator.py` | Python CID/password results, CRC normalization and input validation. |
| `test_firmware_decoder.py` | Known values and failure cases for the firmware decoding helpers. |
| `test-password-calculator.cjs` | The independent JavaScript calculator, public pairs, CRC and MD5 checks. |
| `test-card-connection.cjs` | Serial framing, errors, timeouts and request handling. |
| `test-browser.cjs` | Interface, password download, mobile layout and a simulated ESP32 exchange. |
| `fixtures/public-cid-password-pairs.json` | Public expected values used by both calculators. |

For browser checks, install the development tools first:

```text
npm install
npx playwright install chromium
npm run test:browser
```

The browser test uses public example values. Actual card results and their scope are described in [tested-results.md](../docs/tested-results.md).
