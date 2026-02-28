import fs from 'fs';
process.on('uncaughtException', (err) => {
    fs.writeFileSync('import-error.txt', err.stack);
});
import('./index.js').catch(err => {
    fs.writeFileSync('import-error.txt', err.stack);
});
