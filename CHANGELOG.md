# Changelog

## Unreleased

- README: shape warnings allow a width/height ratio within 0.01 of 9:16, as the code always did.

## 0.1.0 - 2026-11-05

- First version: zones, first frame, shape, sound.
- A file that stops decoding partway, an audio track ffmpeg cannot finish, and an audio file with cover art exit 2, with no verdict.
- Shape counts non-square pixels and rotation marks.
- Works with ffmpeg before 5.1, which lacks -fps_mode.
