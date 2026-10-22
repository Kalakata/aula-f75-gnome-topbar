# Notes for AI coding agents

This repo drives a real keyboard's firmware. Read "Before you use it" in README.md first.

## Adding an animation

Everything lives in `aulactl`; there is nothing else to register.

1. Write a factory next to the others (`a_scanner` is the simplest to copy):

   ```python
   def a_ripple():
       """One line saying what it looks like."""
       def px(c, r, t):                  # column 0-14, row 0-5, time in seconds
           d = math.hypot(c - 7, r - 2.5) # distance from the centre key
           v = 0.5 + 0.5 * math.sin(d - t * 4)
           return (0, v, v)              # R, G, B as floats 0-1
       return px
   ```

2. Add it to the `ANIMS` dict. The top-bar menu reads `aulactl animations`, so it shows up without a re-login.

### The contract

- `px(c, r, t)` is called for every LED every frame (30 fps) and returns `(R, G, B)` floats in 0-1.
  Values are clipped and scaled by the brightness slider for you.
- `t` is animation time, not wall time: it runs faster or slower with the speed slider. Base all motion on `t`.
- State that changes per frame (a game, a simulation) goes in a `step(t)` function attached as `px.step = step`;
  it is called once per frame before any `px`. `a_snake` and `a_fire` are worked examples.
- Keep `px` cheap: 90 LEDs × 30 fps runs in pure Python. Seed `random.Random(n)` if you want a fixed layout.
- Audio-reactive animations use `_spectrum()`; see `a_music` / `a_pulse`. They need numpy and `pw-record`.

### The grid

- 15 columns × 6 rows, `COLS`/`ROWS`. Row 0 is the F-key row, row 5 the space-bar row. LED index = `c*6 + r`.
- `NO_KEY` lists grid positions with no LED (gaps, the knob, wide keys). Anything you draw there is invisible,
  and the space-bar row is mostly holes, so moving objects should avoid it (see `a_snake`'s `CELLS`).
- The centre is about `(7, 2.5)`. Corners and edges are the most visible keys on the real board, so effects
  read better weighted towards the middle.

## Checking your work

- Without hardware: `./preview.py NAME 6 /tmp/NAME.gif` renders exactly the frames the keyboard would get.
  Look at a few frames before claiming it works. It cannot run `music` or `pulse` (live audio).
- On hardware: `aulactl animate NAME 10`. Ctrl+C or any other `aulactl` command stops it.
- If you are adding a GIF to the README, keep it under ~3 MB.

## Hard rules

- Animations only ever use command `0x08` (RAM). Never stream command `0x06`: it writes to flash.
- Never loop config writes (`0x04`), including in tests: rapid writes crash the firmware. Keep the 1.5 s spacing in `write_cfg`.
- Never set effect 11, and don't remove `UNSTABLE`.
- Don't widen the udev rule: interface 00 carries keystrokes and must stay root-only.
- Don't add vendor files (driver, KB.ini, images) to the repo.
