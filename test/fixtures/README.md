# Local video smoke fixture

`local-video.webm` is an original two-second test asset generated from FFmpeg's
solid-color and sine-wave sources. It contains VP8 video and Opus audio, has no
external copyright dependency, and is excluded from packaged application files
with the rest of `test/`.

`local-video.avi` (MPEG-4 + MP3) and `local-video.mkv` (H.264 + AAC) are
similarly generated fixtures for the bundled compatibility-copy path. They are
also excluded from packaged application resources.

Regenerate it with:

```sh
ffmpeg -f lavfi -i color=c=0x4a3728:s=160x90:r=12:d=2 \
  -f lavfi -i sine=frequency=440:sample_rate=48000:duration=2 \
  -c:v libvpx -b:v 80k -c:a libopus -b:a 48k -shortest \
  test/fixtures/local-video.webm
```
