# Additional public comparison vectors

Reviewed on 2 November 2026. Eight additional CID/password pairs matched the existing calculator on all 16 password bytes, without changing the calculation. This expanded the public set from two to ten distinct CID payloads.

| Source | CID or description | Kind |
|---|---|---|
| [MHH AUTO, post 595, 22 July 2024](https://mhhauto.com/Thread-VW-RNS315-map-update?page=67) | `035344534131364780532E054A015300` | Reported card |
| Same post | `03534453433136478054520AB3013800` | Reported card |
| Same post | `035344534C313647807CA64370011800` | Reported card |
| [MHH AUTO, posts 596/597](https://mhhauto.com/Thread-VW-RNS315-map-update?page=67) | `02544D5341303847049C0000A200A401` | Reported card |
| [GPS Zone, post 41](https://gpszone.ro/viewtopic.php?p=8177) | `1B534D30303030301071445382010C00` | Reported card |
| [Clouseau, post 1](https://mhhauto.com/Thread-RNS-315-UNLOCK-LOCK-DEVICE-PASSWORD-SUPPORT) | `10`, then fifteen zero bytes | Published demonstration |
| Same post | `20`, then fifteen zero bytes | Published demonstration |
| Same post | `30`, then fifteen zero bytes | Published demonstration |

Published passwords were transcribed as expected values, then stored as SHA-256 fingerprints of the binary password bytes. Those fingerprints were not generated from this calculator. Python and JavaScript are checked independently against them.

## Source limitations

The eight additional pairs were visible in public search-engine excerpts of the original forum posts. Direct MHH AUTO retrieval returned HTTP 403 and GPS Zone was unavailable to the browser tool. No login or bypass was attempted. Each is marked `retrieved_via: public-search-index-excerpt` in `tests/fixtures/public-cid-password-pairs.json`. This provides weaker source verification than a directly retrieved original post.

Five pairs are presented as card examples; the three zero-filled CIDs are demonstration values, not three additional physical cards. Several come from the same contributor. The number of pairs is not the number of independent implementations or authors. Repeated quoted replies are counted once. Duplicates are detected using the first 15 CID bytes, so a changed CRC/end byte does not count as another card.

The original two vectors remain in the JSON fixture. CIDs without an explicitly paired public password were not used. Archive passwords are not SD card passwords.

## Automated checks

Python and JavaScript both check all ten public pairs. JavaScript also exercises case, whitespace, the 15-byte form and supplied CRC/end-byte variations. The privately purchased comparison pair is separate and is not included in this repository.
