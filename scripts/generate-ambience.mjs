import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sampleRate = 44100;
const durationSeconds = 12;
const sampleCount = sampleRate * durationSeconds;
const outputDirectory = path.resolve(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "ambience")
);

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createPeriodicTexture({ seed, voices, minHz, maxHz, slope, level, accents = [] }) {
  const random = createRandom(seed);
  const samples = new Float64Array(sampleCount);
  for (let voice = 0; voice < voices; voice += 1) {
    const frequency = minHz * Math.pow(maxHz / minHz, (voice + random()) / voices);
    const cycles = Math.max(1, Math.round(frequency * durationSeconds));
    const angularStep = (Math.PI * 2 * cycles) / sampleCount;
    const amplitude = Math.pow(Math.max(frequency, 1), slope) * (0.55 + random() * 0.9);
    const phase = random() * Math.PI * 2;
    let oscillator = Math.sin(phase);
    let quadrature = Math.cos(phase);
    const stepSin = Math.sin(angularStep);
    const stepCos = Math.cos(angularStep);
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] += oscillator * amplitude;
      const nextOscillator = oscillator * stepCos + quadrature * stepSin;
      quadrature = quadrature * stepCos - oscillator * stepSin;
      oscillator = nextOscillator;
    }
  }

  for (const accent of accents) {
    const cycles = Math.max(1, Math.round(accent.hz * durationSeconds));
    const modulationCycles = Math.max(1, Math.round(accent.modulationHz * durationSeconds));
    for (let index = 0; index < sampleCount; index += 1) {
      const phase = (Math.PI * 2 * index) / sampleCount;
      const envelope = Math.pow((Math.sin(phase * modulationCycles - Math.PI / 2) + 1) / 2, accent.sharpness);
      samples[index] += Math.sin(phase * cycles + accent.phase) * accent.level * envelope;
    }
  }

  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const scale = peak > 0 ? level / peak : 0;
  return Int16Array.from(samples, (sample) => Math.round(sample * scale * 32767));
}

function writeWav(fileName, samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index], 44 + index * 2);
  }
  fs.writeFileSync(path.join(outputDirectory, fileName), buffer);
}

writeWav("soft-rain.wav", createPeriodicTexture({
  seed: 0x51a7,
  voices: 52,
  minHz: 280,
  maxHz: 9200,
  slope: -0.08,
  level: 0.42,
  accents: [{ hz: 96, modulationHz: 0.5, sharpness: 4, level: 0.08, phase: 0.7 }]
}));
writeWav("quiet-cafe.wav", createPeriodicTexture({
  seed: 0xcafe,
  voices: 44,
  minHz: 55,
  maxHz: 2100,
  slope: -0.35,
  level: 0.38,
  accents: [
    { hz: 620, modulationHz: 0.25, sharpness: 18, level: 0.035, phase: 1.4 },
    { hz: 930, modulationHz: 1 / 6, sharpness: 24, level: 0.025, phase: 0.2 }
  ]
}));
writeWav("brown-noise.wav", createPeriodicTexture({
  seed: 0xb20a,
  voices: 56,
  minHz: 18,
  maxHz: 980,
  slope: -0.72,
  level: 0.44
}));

console.log(`Generated 3 ambience loops (${durationSeconds}s, ${sampleRate}Hz, mono PCM).`);
