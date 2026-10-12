const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const out = path.join(root, 'dist');
const assets = ['index.html', 'styles.css', 'app.js', 'workflow.schema.json'];

fs.mkdirSync(out, { recursive: true });
for (const asset of assets) fs.copyFileSync(path.join(root, asset), path.join(out, asset));
console.log(`Built ${assets.length} local assets into dist/`);
