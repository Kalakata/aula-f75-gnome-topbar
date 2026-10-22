# aula-f75

Linux lighting control for the Aula F75 keyboard (wired USB-C, `258a:010c`), with a GNOME top-bar menu.

```
./install.sh                 # links aulactl + extension, then log out/in once
aulactl list | effect NAME | brightness N | speed N | color N | save FILE | restore FILE
aulactl animate [pulse|music|aurora|fire|twinkle|snake|scanner|heartbeat] [SECONDS]
```

`music` and `pulse` read whatever audio is playing (PipeWire sink monitor via `pw-record`, needs numpy).
Access without sudo needs the udev rule `/etc/udev/rules.d/99-aula-f75.rules` (plugdev/uaccess on 258a:010c).

## Protocol

Recovered from the vendor driver (`AULA F75 Setup v2.0 20240509.exe` → `OemDrv.exe`, class `CDevG5KB`)
and verified on hardware. HID feature report ID 6, 520 bytes:

```
06 CMD SUB 00 NPAGES PAGE LEN_lo LEN_hi | payload (max 512)
```

Reads use `CMD | 0x80`. Write commands:

| cmd  | what                                   | notes |
|------|----------------------------------------|-------|
| `04` | config (0x80 bytes)                    | effect at buf `0x12`, per-effect `[brightness][speed<<4\|colour]` at `0x40+2n`, end marker `5a a5` |
| `06` | per-key colours, SUB = layer           | 378 bytes: R, G, B planes of 126; **saved to flash, never stream it** |
| `08` | live frame (music-mode channel)        | 378 bytes RGB interleaved; RAM only, safe at 30 fps |
| `0a` | colour presets                         | 7 RGB colours per effect; colour nibble 0-6 picks one, 7 = rainbow |
| `03`/`05`/`0b` | keymap / macros / screen params | not used here |

- LED index = column × 6 + row. The F75 has 15 columns (LED 0-89); row 0 is the F-key row.
- Effect 21 (Self-define) needs config byte `0x11` = 1 as well, or the board stays dark. Its brightness is byte `0x7d` (Fn+↑ changes it).
- Effect 11 crashes the firmware (USB re-enumerates); `aulactl` refuses it.
