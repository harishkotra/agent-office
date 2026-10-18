const fs = require('node:fs');
const path = require('node:path');

describe('browser chrome polish', () => {
    it('ships a favicon so localhost preview has no 404 console noise', () => {
        const favicon = path.join(__dirname, '../../public/favicon.ico');
        expect(fs.existsSync(favicon)).toBe(true);
        expect(fs.statSync(favicon).size).toBeGreaterThan(0);
    });
});
