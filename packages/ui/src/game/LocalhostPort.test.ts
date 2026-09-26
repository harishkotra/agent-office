const fs = require('node:fs');
const path = require('node:path');

describe('local preview port', () => {
    it('serves the visible game UI on localhost:7777', () => {
        const source = fs.readFileSync(path.join(__dirname, '../../vite.config.ts'), 'utf8');
        expect(source).toContain('port: 7777');
        expect(source).toContain("'/api': 'http://localhost:3000'");
        expect(source).toContain('chunkSizeWarningLimit: 1300');
        expect(source).toContain("phaser: ['phaser']");
        expect(source).toContain("react: ['react', 'react-dom']");
    });
});
