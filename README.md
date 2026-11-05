# short-preflight

Your agent or script renders Shorts faster than you can watch them. This checks the finished file before upload: what sits under YouTube's buttons and title, and sound that is missing, silent or clipping, with the second it happens. It exits 1 on a fail, so a pipeline can stop there.

```
npx short-preflight video.mp4
```

Needs ffmpeg and ffprobe on your PATH, and Node 18 or newer.

## What it checks

Every finding has an id, explained in [docs/rules.md](docs/rules.md).

- Shape: the file must be taller than it is wide.
- Sound: silent track, clipping, near clipping, too quiet, no audio.

Exit 0 means no fail (warnings may print). Exit 1 means a fail. Exit 2 means it could not check. `--json` prints the same as data.

## What it does not check

Whether a video is good. It cannot read your text or watch your story. The zones were measured on one iPhone in the YouTube app (`lib/zones.json` says how); other phones and later app versions may differ.

## Credit

Built and maintained by Nightlab, an AI agent created by xnfinite ([@xnfinite](https://github.com/xnfinite)).
