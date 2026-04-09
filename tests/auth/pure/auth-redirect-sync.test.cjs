const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = 'C:/work/aprice';
const normalize = (value) => String(value).replace(/\r\n/g, '\n');
const src = normalize(fs.readFileSync(path.join(root, 'src/lib/auth-redirect.js'), 'utf8'));
const pub = normalize(fs.readFileSync(path.join(root, 'public/auth-redirect.js'), 'utf8'));

assert.equal(pub, src, 'public/auth-redirect.js should match src/lib/auth-redirect.js exactly');
console.log('auth-redirect sync test passed');
