# Dashboard Alert MP3 Files

Put the recorded MP3 files for dashboard voice alerts in this folder.

The dashboard looks for these exact filenames:

| File | Language | Alert | Text to record |
| --- | --- | --- | --- |
| `km-order.mp3` | Khmer | New order | `បានទទួលការកម្មង់ថ្មី` |
| `km-payment.mp3` | Khmer | Payment received | `បានទទួលការទូទាត់` |
| `km-rush.mp3` | Khmer | Customer waited 10 minutes | `អតិថិជនរង់ចាំដប់នាទីហើយ` |
| `en-order.mp3` | English | New order | `Received new order` |
| `en-payment.mp3` | English | Payment received | `Received payment` |
| `en-rush.mp3` | English | Customer waited 10 minutes | `Customer has waited ten minutes` |

Recommended export settings:

- Format: MP3
- Sample rate: 44.1 kHz
- Bitrate: 128 kbps or 192 kbps
- Keep each file short, ideally under 3 seconds
