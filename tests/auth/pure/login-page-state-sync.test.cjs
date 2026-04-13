const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = process.cwd();
const normalize = (value) => String(value).replace(/\r\n/g, '\n');
const src = normalize(fs.readFileSync(path.join(root, 'src/lib/login-page-state.js'), 'utf8'));
const pub = normalize(fs.readFileSync(path.join(root, 'public/login-page-state.js'), 'utf8'));

assert.equal(pub, src, 'public/login-page-state.js should match src/lib/login-page-state.js exactly');
console.log('login-page-state sync test passed');
