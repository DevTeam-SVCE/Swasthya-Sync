const http = require('node:http');

function request(path, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  try {
    const response = await request('/api/emergency/queue');
    if (response.status !== 401) {
      console.error('Expected 401 without auth, got', response.status, response.body);
      process.exit(1);
    }
    console.log('Emergency auth guard test passed');
  } catch (error) {
    console.error('Emergency auth guard test failed:', error.message);
    process.exit(1);
  }
})();
