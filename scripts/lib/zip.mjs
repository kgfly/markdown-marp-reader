import { deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * Tiny deterministic ZIP writer. Chrome Web Store requires a plain .zip with
 * manifest.json at its root; the DEFLATE method and fixed timestamps are
 * enough, and avoid pulling in a dependency just for packaging.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let crc = n;
    for (let k = 0; k < 8; k += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[n] = crc >>> 0;
  }
  return table;
})();

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * @param {Array<{name: string, data: Buffer|Uint8Array|string, date?: Date}>} entries
 * @returns {Buffer}
 */
export function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of sorted) {
    const name = Buffer.from(entry.name.replaceAll('\\', '/'), 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const compressed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);
    const { time, date } = dosTimestamp(entry.date ?? new Date(2026, 0, 1));

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 filename
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length

    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8); // UTF-8 filename
    central.writeUInt16LE(8, 10); // deflate
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // central directory start disk
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, ...centralParts, end]);
}

/**
 * Read a ZIP produced by createZip. Only used by tests, but keeping it here
 * lets the test verify the archive with the same assumptions as the writer.
 */
export function readZip(buffer) {
  const entries = new Map();
  let offset = 0;

  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const checksum = buffer.readUInt32LE(offset + 14);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const size = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const dataStart = offset + 30 + nameLength + extraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(compressed) : compressed;

    entries.set(name, {
      data,
      size,
      checksum,
      crcMatches: crc32(data) === checksum,
    });
    offset = dataStart + compressedSize;
  }

  return entries;
}

function dosTimestamp(date) {
  const safe = Number.isNaN(date.getTime()) ? new Date(2026, 0, 1) : date;
  const time =
    (Math.floor(safe.getSeconds() / 2) & 0x1f) |
    ((safe.getMinutes() & 0x3f) << 5) |
    ((safe.getHours() & 0x1f) << 11);
  const day =
    (safe.getDate() & 0x1f) |
    (((safe.getMonth() + 1) & 0x0f) << 5) |
    (((safe.getFullYear() - 1980) & 0x7f) << 9);
  return { time, date: day };
}
