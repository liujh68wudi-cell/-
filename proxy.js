const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;

function forward(req, res, targetUrl, method) {
  const url = new URL(targetUrl);
  const proto = url.protocol === 'https:' ? https : http;
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: method,
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
  };
  const pr = proto.request(options, prx => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(prx.statusCode, prx.headers);
    prx.pipe(res);
  });
  pr.on('error', e => { res.writeHead(502); res.end(e.message); });
  if (method === 'POST') {
    let d = ''; req.on('data', c => d += c); req.on('end', () => { pr.write(d); pr.end(); });
  } else { pr.end(); }
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(); return;
  }
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/token') {
    forward(req, res, 'https://aip.baidubce.com/oauth/2.0/token?' + u.searchParams.toString(), 'GET');
  } else if (u.pathname === '/asr') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      const bd = JSON.parse(body);
      const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
      const audioBuf = Buffer.from(bd.speech, 'base64');
      const headerBuf = Buffer.from([
        '--' + boundary,
        'Content-Disposition: form-data; name="token"\r\n\r\n' + bd.token,
        '--' + boundary,
        'Content-Disposition: form-data; name="format"\r\n\r\n' + (bd.format || 'pcm'),
        '--' + boundary,
        'Content-Disposition: form-data; name="rate"\r\n\r\n' + String(bd.rate || 16000),
        '--' + boundary,
        'Content-Disposition: form-data; name="dev_pid"\r\n\r\n' + String(bd.dev_pid || '1737'),
        '--' + boundary,
        'Content-Disposition: form-data; name="channel"\r\n\r\n1',
        '--' + boundary,
        'Content-Disposition: form-data; name="speech"; filename="recording.pcm"\r\nContent-Type: audio/pcm\r\n\r\n'
      ].join('\r\n'));
      const endBuf = Buffer.from('\r\n--' + boundary + '--\r\n');
      const fullBody = Buffer.concat([headerBuf, audioBuf, endBuf]);
      const options2 = {
        hostname: 'vop.baidu.com', port: 443, path: '/server_api', method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': fullBody.length }
      };
      const pr = https.request(options2, prx => {
        let d = ''; prx.on('data', c => d += c); prx.on('end', () => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(d);
        });
      });
      pr.on('error', e => { res.writeHead(502); res.end(e.message); });
      pr.write(fullBody); pr.end();
    });
  } else { res.writeHead(404); res.end('Not found'); }
}).listen(PORT, () => console.log('Proxy running on port', PORT));
