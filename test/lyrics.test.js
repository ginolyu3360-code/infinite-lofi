const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findActiveLyricIndex,
  lyricsFromEmbeddedTags,
  lyricsFromRemoteRecord,
  normalizeLyrics,
  parseLrc
} = require("../src/lyrics");

test("parses synchronized LRC timestamps, offsets, and duplicate timestamps", () => {
  assert.deepEqual(parseLrc([
    "[offset:500]",
    "[00:01.00][00:03.250]Hello",
    "[00:05.5]World"
  ].join("\n")), {
    synced: true,
    lines: [
      { time: 1.5, text: "Hello" },
      { time: 3.75, text: "Hello" },
      { time: 6, text: "World" }
    ]
  });
});

test("keeps plain lyrics and ignores LRC metadata", () => {
  assert.deepEqual(parseLrc("[ar:Artist]\nFirst line\n\nSecond line"), {
    synced: false,
    lines: [{ text: "First line" }, { text: "Second line" }]
  });
});

test("normalizes embedded and remote lyric payloads", () => {
  assert.deepEqual(lyricsFromEmbeddedTags([{ syncText: [
    { timestamp: 1000, text: "One" },
    { timestamp: 2500, text: "Two" }
  ] }]), {
    source: "embedded",
    synced: true,
    instrumental: false,
    lines: [{ time: 1, text: "One" }, { time: 2.5, text: "Two" }]
  });
  assert.equal(lyricsFromRemoteRecord({ instrumental: true }).instrumental, true);
  assert.equal(lyricsFromRemoteRecord({ syncedLyrics: "[00:01]Remote" }).lines[0].time, 1);
  assert.equal(normalizeLyrics(null), null);
});

test("finds the active synchronized line across seeks", () => {
  const lines = [{ time: 2, text: "A" }, { time: 5, text: "B" }, { time: 9, text: "C" }];
  assert.equal(findActiveLyricIndex(lines, 1), -1);
  assert.equal(findActiveLyricIndex(lines, 5), 1);
  assert.equal(findActiveLyricIndex(lines, 999), 2);
});
