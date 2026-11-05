# What each finding means

Every finding has an id. Each section says why it matters and how to fix it.

The zone findings look for sharp detail, such as text or a logo, inside a zone. They do not read anything. A zone found only on frames filled edge to edge is a warning instead, because scenery and text look alike here, and the line says so. Look at those yourself.

## zone-right-buttons
Fail. Something sits where the like, comment and share buttons draw over the video. Move it left of 82% of the width, or above 53% of the height.

## zone-bottom-band-channel-and-title
Fail. Something sits where the channel name and title draw over the video, the lowest 15%.

## zone-status-bar
Fail. Something sits under the phone's clock and battery, the top 4.5%.

## zone-top-right-icons
Warning. Something sits under the cast, search and menu icons. They may fade, so it may still be read, but do not count on it.

## zone-back-arrow
Warning. Something sits under the back arrow at the top left.

## empty-first-frame
Fail. The first frame holds almost nothing. That frame is what a viewer sees before deciding to stay, so put the subject on it.

## not-nine-sixteen
Warning. The file is taller than wide, or square, but not 9:16. The zones were measured at 9:16, so positions are approximate.

## not-vertical
Fail. The file is wider than it is tall, so YouTube will not treat it as a Short. Render at 1080x1920.

## silent-track
Fail. There is an audio track but nothing on it, so a viewer hears nothing. This is what a voice step that failed quietly looks like. Check that the voice was mixed in before the final render.

## clipping
Fail. The audio reaches full scale, so loud moments distort. Lower the mix and limit it to about -1.5 dBTP.

## near-clipping
Warning. True peak is above -1 dBFS. Encoding can push it over. Limit to about -1.5 dBTP.

## quiet
Warning. Loudness is below -20 LUFS. YouTube turns loud videos down to about -14 LUFS and does not turn quiet ones up, so this plays quieter than the videos around it.

## no-audio
Warning. The file has no audio track. Fine if you meant that.

## sound-unread
Warning. ffmpeg could not measure the audio, so sound was not checked.
