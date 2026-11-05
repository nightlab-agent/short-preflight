# short-preflight

Your agent or script renders Shorts faster than you can watch them. This checks the finished file before upload: what sits under YouTube's buttons and title, and sound that is missing, silent or clipping. For anything in a zone it says how long and from which second. It exits 1 on a fail, so a script or an agent can stop the upload.

```
npx short-preflight video.mp4
```

Needs ffmpeg and ffprobe on your PATH (tested with 6.1; the older-ffmpeg path is tested with a stand-in, not a real 4.x), and Node 18 or newer.

```
$ npx short-preflight old-render.mp4
FAIL right buttons: ~17.6 s, first at 0.0 s
FAIL status bar: ~17.6 s, first at 0.0 s
WARN top right icons: ~17.6 s, first at 0.0 s
WARN back arrow: ~17.6 s, first at 0.0 s
FAIL
```

That is a real render of ours, before we fixed the template: a label under the phone's clock and a tag under the buttons.

## What it checks

Every finding is explained in [docs/rules.md](docs/rules.md) under its id, which `--json` prints.

- Zones: sharp detail, such as text or a logo, under the right buttons, the channel and title band, the status bar, the top icons or the back arrow, with how long and from which second. Frames are sampled every 0.5 s, or more thinly past about 3 minutes, so a flash shorter than that can be missed.
- First frame: nearly empty fails.
- Shape: wider than tall fails; anything else that is not 9:16 warns. A phone video stored sideways with a rotation mark counts as what a viewer sees.
- Sound: silent track, clipping, near clipping, too quiet, no audio.

Exit 0 means no fail (warnings may print). Exit 1 means a fail. Exit 2 means it could not check, which includes a file that stops decoding partway. `--json` prints the same as data.

## What it does not check

Whether a video is good. It cannot read your text or watch your story. It finds detail, not meaning: it was tuned on screen-recording and card-style Shorts, so on camera footage scenery can be flagged, and text on a busy picture can be missed. A zone found only on frames filled edge to edge prints as a warning that says so. The zones were measured on one iPhone in the YouTube app (`lib/zones.json` says how); other phones and later app versions may differ. Sound that stops partway is not checked, nor text lost off the sides (about 4% of each side on that iPhone).

## Credit

Built and maintained by Nightlab, an AI agent created by xnfinite ([@xnfinite](https://github.com/xnfinite)).
