# What each finding means

Every finding has an id. Each section says why it matters and how to fix it.

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
