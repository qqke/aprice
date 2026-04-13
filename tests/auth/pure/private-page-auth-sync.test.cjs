const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = process.cwd();
const normalize = (value) => String(value).replace(/\r\n/g, '\n');
const src = normalize(fs.readFileSync(path.join(root, 'src/lib/private-page-auth.js'), 'utf8'));
const pub = normalize(fs.readFileSync(path.join(root, 'public/private-page-auth.js'), 'utf8'));

assert.equal(pub, src, 'public/private-page-auth.js should match src/lib/private-page-auth.js exactly');
console.log('private-page-auth sync test passed');
