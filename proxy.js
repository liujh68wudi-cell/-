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
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { pr.write(d); pr.end(); });
  } else {
    pr.end();
  }
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const u = new URL(req.url, 'http://x');

  if (u.pathname === '/token') {
    forward(req, res, 'https://aip.baidubce.com/oauth/2.0/token?' + u.searchParams.toString(), 'GET');
    return;
  }

  if (u.pathname === '/asr') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let bd;
      try {
        bd = JSON.parse(body);
      } catch (e) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ err_no: 1001, err_msg: 'Invalid JSON body' }));
        return;
      }

      // Baidu API 接收 PCM 或 WAV (16kHz mono)
      const format = bd.format || 'wav';
      const rate = bd.rate || 16000;
      const dev_pid = bd.dev_pid || '1737';
      const token = bd.token;

      if (!token) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ err_no: 1002, err_msg: 'Missing token' }));
        return;
      }

      // 用 URLSearchParams 方式（application/x-www-form-urlencoded）上传
      // 百度 server_api 支持这种方式，音频 base64 放 speex 参数
      const params = new URLSearchParams({
        token: token,
        format: format,
        rate: String(rate),
        dev_pid: String(dev_pid),
        channel: '1',
        speech: bd.speech || '',
        len: String(Math.floor((bd.speech || '').length * 3 / 4))
      });

      const postData = params.toString();
      const options2 = {
        hostname: 'vop.baidu.com',
        port: 443,
        path: '/server_api',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const pr = https.request(options2, prx => {
        let d = '';
        prx.on('data', c => d += c);
        prx.on('end', () => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(d);
        });
      });

      pr.on('error', e => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ err_no: 1003, err_msg: e.message }));
      });

      pr.write(postData);
      pr.end();
    });
    return;
  }

  // 未知路由
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ err_no: 404, err_msg: 'Not found' }));
}).listen(PORT, () => console.log('Proxy running on port', PORT));
