/**
 * Enough PNG to measure a screenshot, and no dependency to install.
 *
 * The images this reads are produced by `scripts/screenshot.ps1` through
 * System.Drawing: eight bits a channel, no interlacing, RGB or RGBA. That is
 * the whole surface supported here — anything else is refused loudly rather
 * than decoded wrongly, because a measurement taken from a misread image is
 * worse than no measurement.
 *
 * Node already has zlib, which is the only hard part of the format.
 */
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** @returns {{width: number, height: number, data: Buffer}} RGBA, 4 bytes a pixel. */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');

  let width = 0;
  let height = 0;
  let depth = 0;
  let colourType = 0;
  const idat = [];

  let at = 8;
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString('ascii', at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    at += 12 + length; // length + type + data + crc

    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colourType = body[9];
      if (body[12] !== 0) throw new Error('interlaced PNG is not supported');
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
  const channels = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`unsupported colour type ${colourType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    unfilter(filter, row, previous, channels);

    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      out[to] = row[from];
      out[to + 1] = row[from + 1];
      out[to + 2] = row[from + 2];
      out[to + 3] = channels === 4 ? row[from + 3] : 255;
    }
    previous = row;
  }

  return { width, height, data: out };
}

function unfilter(filter, row, previous, channels) {
  const length = row.length;
  for (let i = 0; i < length; i += 1) {
    const a = i >= channels ? row[i - channels] : 0; // the pixel to the left
    const b = previous[i]; // the pixel above
    const c = i >= channels ? previous[i - channels] : 0; // above-left

    switch (filter) {
      case 0:
        break;
      case 1:
        row[i] = (row[i] + a) & 0xff;
        break;
      case 2:
        row[i] = (row[i] + b) & 0xff;
        break;
      case 3:
        row[i] = (row[i] + ((a + b) >> 1)) & 0xff;
        break;
      case 4:
        row[i] = (row[i] + paeth(a, b, c)) & 0xff;
        break;
      default:
        throw new Error(`unknown row filter ${filter}`);
    }
  }
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Nearest-neighbour, which is all a contact sheet needs. */
export function scale(image, targetWidth) {
  const ratio = targetWidth / image.width;
  const width = Math.max(1, Math.round(targetWidth));
  const height = Math.max(1, Math.round(image.height * ratio));
  const data = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(image.height - 1, Math.floor(y / ratio));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(image.width - 1, Math.floor(x / ratio));
      image.data.copy(
        data,
        (y * width + x) * 4,
        (sy * image.width + sx) * 4,
        (sy * image.width + sx) * 4 + 4
      );
    }
  }

  return { width, height, data };
}

export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // no filter: the sheet is written once and read by eye
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}
