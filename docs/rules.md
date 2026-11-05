# What each finding means

Every finding is explained here under its id, which `--json` prints. Each section says what the finding means, and how to fix it where there is a fix.

The zone findings look for sharp detail, such as text or a logo, inside a zone. They do not read anything. A zone found only on frames filled edge to edge is a warning instead, because scenery and text look alike here, and the line says so. Look at those yourself.

## zone-right-buttons
Fail. Something sits where the like, comment and share buttons draw over the video. Move it left of 82% of the width, or above 53% of the height.

## zone-bottom-band-channel-and-title
Fail. Something sits where the channel name and title draw over the video, the lowest 15%, which keeps one spare line above the channel row. Move it higher.

## zone-status-bar
Fail. Something sits under the phone's clock and battery, the top 4.5%. Move it lower.

## zone-top-right-icons
Warning. Something sits under the cast, search and menu icons. Move it below 11.5% of the height or left of 62% of the width.

## zone-back-arrow
Warning. Something sits under the back arrow at the top left. Move it below 11.5% of the height or right of 15% of the width.

## empty-first-frame
Fail. The first frame holds almost nothing. A nearly empty opening gives a viewer nothing to look at, so put the subject on it.

## not-nine-sixteen
Warning. The file is taller than wide, or square, but not 9:16. The zones were measured at 9:16, so positions are approximate. Render at 1080x1920 for an exact read.

## not-vertical
Fail. The file is wider than it is tall. The zones assume a vertical frame, so the picture was not checked. Render at 1080x1920.

## silent-track
Fail. There is an audio track but nothing on it, so a viewer hears nothing. This is what a voice step that failed quietly looks like. Check that the voice was mixed in before the final render.

## clipping
Fail. The audio reaches full scale, so loud moments can distort. Lower the mix and limit it to about -1.5 dBTP.

## near-clipping
Warning. True peak is above -1 dBFS. Encoding can push it over. Limit to about -1.5 dBTP.

## quiet
Warning. Loudness is below -20 LUFS, so it may sound quiet on a phone. Raise the mix; about -14 LUFS is a common target.

## no-audio
Warning. The file has no audio track. Fine if you meant that; otherwise check the step that adds the voice.

## sound-unread
Warning. ffmpeg could not measure the audio, so sound was not checked.
