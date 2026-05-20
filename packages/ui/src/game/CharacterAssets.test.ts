const fs = require('node:fs');
const path = require('node:path');

function pngDimensions(filePath) {
    const buffer = fs.readFileSync(filePath);
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20)
    };
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
});
