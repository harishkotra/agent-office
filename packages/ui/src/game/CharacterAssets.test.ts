const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function pngDimensions(filePath) {
    const buffer = fs.readFileSync(filePath);
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20)
    };
}

function decodePngRgba(filePath) {
    const buffer = fs.readFileSync(filePath);
    const signature = buffer.subarray(0, 8).toString('hex');
    expect(signature).toBe('89504e470d0a1a0a');
    let offset = 8;
    let width = 0;
    let height = 0;
    let colorType = 0;
    const idat = [];
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            expect(data[8]).toBe(8);
            colorType = data[9];
            expect([2, 6]).toContain(colorType);
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
        offset += 12 + length;
    }
    const bytesPerPixel = colorType === 6 ? 4 : 3;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * bytesPerPixel;
    const pixels = Buffer.alloc(height * stride);
    let rawOffset = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[rawOffset++];
        const row = raw.subarray(rawOffset, rawOffset + stride);
        const priorRow = y === 0 ? null : pixels.subarray((y - 1) * stride, y * stride);
        const outRow = pixels.subarray(y * stride, (y + 1) * stride);
        for (let x = 0; x < stride; x++) {
            const left = x >= bytesPerPixel ? outRow[x - bytesPerPixel] : 0;
            const up = priorRow ? priorRow[x] : 0;
            const upLeft = priorRow && x >= bytesPerPixel ? priorRow[x - bytesPerPixel] : 0;
            const pa = Math.abs(up - upLeft);
            const pb = Math.abs(left - upLeft);
            const pc = Math.abs(left + up - upLeft - upLeft);
            const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
            const value =
                filter === 0 ? row[x] :
                filter === 1 ? row[x] + left :
                filter === 2 ? row[x] + up :
                filter === 3 ? row[x] + Math.floor((left + up) / 2) :
                filter === 4 ? row[x] + predictor :
                (() => { throw new Error(`Unsupported PNG filter ${filter}`); })();
            outRow[x] = value & 255;
        }
        rawOffset += stride;
    }
    return { width, height, pixels, bytesPerPixel };
}

function pngStats(filePath) {
    const { pixels, bytesPerPixel } = decodePngRgba(filePath);
    const colors = new Set();
    let opaque = 0;
    for (let index = 0; index < pixels.length; index += bytesPerPixel) {
        const alpha = bytesPerPixel === 4 ? pixels[index + 3] : 255;
        if (alpha > 0) opaque++;
        colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${alpha}`);
    }
    return { colors: colors.size, opaque };
}

describe('production character sprite roster', () => {
    const root = path.join(__dirname, '../../public/assets/characters');

    it('ships twelve 7x3 sprite sheets, including cartoon/anime-inspired variants', () => {
        for (let i = 0; i < 12; i++) {
            const assetPath = path.join(root, `char_${i}.png`);
            expect(fs.existsSync(assetPath)).toBe(true);
            expect(pngDimensions(assetPath)).toEqual({ width: 112, height: 96 });
        }
    });

    it('keeps the expanded cast detailed enough for professional game-grade sprites', () => {
        for (let i = 6; i < 12; i++) {
            const assetPath = path.join(root, `char_${i}.png`);
            const stats = pngStats(assetPath);
            expect(stats.colors).toBeGreaterThanOrEqual(16);
            expect(stats.opaque).toBeGreaterThanOrEqual(5400);
        }
    });
});
