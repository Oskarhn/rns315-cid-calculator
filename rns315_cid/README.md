# Python CID-to-password calculator

From the repository root, run:

```text
python -m rns315_cid 5D53424C32424D31013917CA53010400
```

This public example returns:

```text
C99A20843ED7D90B6801E49F2BC80277
```

Replace the example with your card's CID. Add `--json` to include the normalized CID and CRC details. No extra Python packages are needed.

For use in another Python program:

```python
from rns315_cid import calculate_password

password = calculate_password("5D53424C32424D31013917CA53010400")
```

`calculator.py` contains the calculation; `__main__.py` provides the command-line interface. This package calculates values without accessing a card. Use the [card setup guide](../docs/update-maps.md) for the hardware steps and the [technical analysis](../docs/technical-analysis.md) for the rule itself.
