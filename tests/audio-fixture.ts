import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
export function testAudioFile() {
  // Deterministic microphone input; delivery and decoding still use the actual SFU/WebRTC path.
  const rate = 48000,
    samples = rate * 3;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(
      Math.round(10000 * Math.sin((2 * Math.PI * 440 * i) / rate)),
      44 + i * 2,
    );
  const dir = resolve(".local");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "test-tone.wav");
  writeFileSync(file, wav);
  return file;
}
