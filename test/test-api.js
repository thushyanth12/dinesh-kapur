const http = require('http');
const assert = require('assert');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: process.env.PORT || 4000, path, timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    }).on('error', reject);
  });
}

function request(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: b }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  try {
    console.log('Testing /api/list');
    const r1 = await get('/api/list');
    assert.equal(r1.statusCode, 200);
    const json1 = JSON.parse(r1.body);
    assert.ok(Array.isArray(json1.list));

    console.log('Testing /api/search?key=7');
    const r2 = await get('/api/search?key=7');
    assert.equal(r2.statusCode, 200);
    const json2 = JSON.parse(r2.body);
    assert.strictEqual(typeof json2.index, 'number');

    // Test add
    console.log('Testing add poster');
  const ADMIN_KEY = process.env.ADMIN_API_KEY || 'change-me';
  const add = await request({ hostname: 'localhost', port: process.env.PORT || 4000, path: '/api/posters', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': ADMIN_KEY } }, JSON.stringify({ key: 12345 }));
    assert.equal(add.statusCode, 200);
    const addJson = JSON.parse(add.body);
    assert.ok(Array.isArray(addJson.list));
    assert.ok(addJson.list.includes(12345));

    // Test delete
    console.log('Testing delete poster');
  const del = await request({ hostname: 'localhost', port: process.env.PORT || 4000, path: '/api/posters?key=12345', method: 'DELETE', headers: { 'x-api-key': ADMIN_KEY } });
    assert.equal(del.statusCode, 200);
    const delJson = JSON.parse(del.body);
    assert.ok(Array.isArray(delJson.list));
    assert.ok(!delJson.list.includes(12345));

    console.log('All tests passed');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
