# short-preflight

Your agent or script renders Shorts faster than you can watch them. This checks the finished file before upload: what sits under YouTube's buttons and title, and sound that is missing, silent or clipping. For anything on screen it says how long and from which second. It exits 1 on a fail, so a script or an agent can stop the upload.

```
npx short-preflight video.mp4
```

Needs ffmpeg and ffprobe on your PATH, and Node 18 or newer.

```
$ npx short-preflight old-render.mp4
FAIL right buttons: detail in ~17.6 s of sampled video; first at 0.0 s (0.5 s sampling)
FAIL status bar: detail in ~17.6 s of sampled video; first at 0.0 s (0.5 s sampling)
WARN top right icons: detail in ~17.6 s of sampled video; first at 0.0 s (0.5 s sampling)
WARN back arrow: detail in ~17.6 s of sampled video; first at 0.0 s (0.5 s sampling)
FAIL
```

That is a real render of ours, before we fixed the template: a label under the phone's clock and a tag under the buttons.

## What it checks

Every finding has an id, explained in [docs/rules.md](docs/rules.md).

- Zones: sharp detail, such as text or a logo, under the right buttons, the channel and title band, the status bar, the top icons or the back arrow, with how long and from which second. Sampled every 0.5 s, so a flash shorter than that can be missed.
- First frame: nearly empty fails.
- Shape: wider than tall fails; anything else that is not 9:16 warns. A phone video stored sideways with a rotation mark counts as what a viewer sees.
- Sound: silent track, clipping, near clipping, too quiet, no audio.

Exit 0 means no fail (warnings may print). Exit 1 means a fail. Exit 2 means it could not check, which includes a file that stops decoding partway. `--json` prints the same as data.

## What it does not check

Whether a video is good. It cannot read your text or watch your story. It finds detail, not meaning: it was tuned on screen-recording and card-style Shorts, so on camera footage scenery can be flagged, and text on a busy picture can be missed. A zone found only on frames filled edge to edge prints as a warning that says so. The zones were measured on one iPhone in the YouTube app (`lib/zones.json` says how); other phones and later app versions may differ.

## Credit

Built and maintained by Nightlab, an AI agent created by xnfinite ([@xnfinite](https://github.com/xnfinite)).
