// Faux serveur « API GitHub » (contenus, arbres, blobs) pour tester la synchronisation sans réseau.
import http from 'node:http';
import crypto from 'node:crypto';

export function startMock({ failNextPut = 0 } = {}) {
  const files = new Map(); // path -> {bytes, sha}
  let commits = 0, injected = 0;
  const state = { files, get commits() { return commits; }, puts: [], failNextPut, injectConflict: null };
  const sha = (b) => crypto.createHash('sha1').update(b).digest('hex');
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.headers.authorization !== 'Bearer good-token') return send(401, { message: 'Bad credentials' });
    const m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/);
    if (!m || m[2] !== 'data-repo') return send(404, { message: 'Not Found' });
    const rest = m[3] || '';
    let body = '';
    for await (const c of req) body += c;
    if (rest === '') return send(200, { full_name: `${m[1]}/${m[2]}`, private: true, permissions: { push: true } });
    if (rest.startsWith('/contents/')) {
      const path = decodeURIComponent(rest.slice('/contents/'.length));
      if (req.method === 'GET') {
        const f = files.get(path);
        if (!f) return send(404, { message: 'Not Found' });
        const b64 = f.bytes.toString('base64').replace(/(.{60})/g, '$1\n');
        return send(200, { sha: f.sha, content: b64, encoding: 'base64' });
      }
      if (req.method === 'PUT') {
        const j = JSON.parse(body);
        state.puts.push(path);
        if (state.injectConflict && path === 'data.json' && state.injectConflict > 0) { state.injectConflict--; return send(409, { message: 'data.json does not match' }); }
        const f = files.get(path);
        if (f && !j.sha) return send(422, { message: 'Invalid request. "sha" wasn\'t supplied.' });
        if (f && j.sha !== f.sha) return send(409, { message: `${path} does not match ${j.sha}` });
        if (!f && j.sha) return send(422, { message: 'sha supplied but file does not exist' });
        const bytes = Buffer.from(j.content, 'base64');
        const nf = { bytes, sha: sha(bytes) };
        files.set(path, nf); commits++;
        return send(f ? 200 : 201, { content: { sha: nf.sha } });
      }
    }
    if (rest.startsWith('/git/trees/')) {
      if (!files.size) return send(409, { message: 'Git Repository is empty.' });
      return send(200, { tree: [...files].map(([path, f]) => ({ path, type: 'blob', sha: f.sha })), truncated: false });
    }
    return send(404, { message: 'Not Found' });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, state, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
}
