/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-require-imports */
/* Simple CJS consumer test */
const lib = require('./dist-cjs');
console.log('CJS keys:', Object.keys(lib));
if (typeof lib.expectResponseShapeFor !== 'function') {
  console.error('Expected expectResponseShapeFor export missing');
  process.exit(1);
}
console.log('CJS validation success');
