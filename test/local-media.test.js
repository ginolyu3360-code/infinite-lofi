const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getVideoPlaybackPolicy,
  inferMediaKind,
  isSupportedMediaFile,
  normalizeMediaKind,
  normalizeVideoDisplayMode,
  shouldShowVideoBackground
} = require("../src/local-media");

test("classifies the bounded local audio and video formats", () => {
  assert.equal(inferMediaKind("Focus.MP3"), "audio");
  assert.equal(inferMediaKind("Focus.mp4"), "video");
  assert.equal(inferMediaKind("Focus.m4v"), "video");
  assert.equal(inferMediaKind("Focus.webm"), "video");
  for (const fileName of ["Focus.mov", "Focus.ogv", "Focus.mkv", "Focus.avi", "Focus.wmv", "Focus.flv", "Focus.f4v", "Focus.mpg", "Focus.mpeg", "Focus.ts", "Focus.mts", "Focus.m2ts", "Focus.3gp", "Focus.3g2"]) {
    assert.equal(inferMediaKind(fileName), "video", fileName);
  }
  assert.equal(isSupportedMediaFile("Focus.webm"), true);
  assert.equal(isSupportedMediaFile("Focus.txt"), false);
});

test("classifies native-first and proxy-first video playback", () => {
  assert.equal(getVideoPlaybackPolicy("movie.mp4"), "native-first");
  assert.equal(getVideoPlaybackPolicy("movie.MOV"), "native-first");
  assert.equal(getVideoPlaybackPolicy("movie.ogv"), "native-first");
  assert.equal(getVideoPlaybackPolicy("movie.mkv"), "proxy-first");
  assert.equal(getVideoPlaybackPolicy("movie.m2ts"), "proxy-first");
  assert.equal(getVideoPlaybackPolicy("track.mp3"), null);
});

test("normalizes media and video-display state without inventing values", () => {
  assert.equal(normalizeMediaKind("video"), "video");
  assert.equal(normalizeMediaKind("unknown", "clip.mp4"), "video");
  assert.equal(normalizeMediaKind("unknown", "track.flac"), "audio");
  assert.equal(normalizeVideoDisplayMode("background"), "background");
  assert.equal(normalizeVideoDisplayMode("fullscreen"), "audio-only");
});

test("shows video only for a healthy local video with the background preference", () => {
  const base = {
    mediaKind: "video",
    videoDisplayMode: "background",
    sourceMode: "local"
  };
  assert.equal(shouldShowVideoBackground(base), true);
  assert.equal(shouldShowVideoBackground({ ...base, mediaKind: "audio" }), false);
  assert.equal(shouldShowVideoBackground({ ...base, videoDisplayMode: "audio-only" }), false);
  assert.equal(shouldShowVideoBackground({ ...base, sourceMode: "external" }), false);
  assert.equal(shouldShowVideoBackground({ ...base, hasPlaybackError: true }), false);
});
