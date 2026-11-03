// Petit client de l'API GitHub (contenu d'un dépôt). Fonctionne dans le navigateur et sous Node (tests).
const toBase64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromBase64 = (b64) => {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export class GitHubError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const explain = (status, body) => {
  if (status === 401) return 'Jeton GitHub refusé (expiré ou incorrect).';
  if (status === 403) return 'Accès refusé par GitHub (droits du jeton insuffisants ou limite atteinte).';
  if (status === 404) return 'Dépôt introuvable, ou jeton sans accès à ce dépôt.';
  return `Erreur GitHub ${status}${body && body.message ? ` : ${body.message}` : ''}`;
};

export class GitHub {
  constructor({ owner, repo, branch = 'main', token, apiBase = 'https://api.github.com', fetchImpl }) {
    Object.assign(this, { owner, repo, branch, token, apiBase });
    this.f = fetchImpl || ((...a) => fetch(...a));
  }

  async req(method, path, body) {
    let res;
    try {
      res = await this.f(`${this.apiBase}/repos/${this.owner}/${this.repo}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      });
    } catch (e) {
      throw new GitHubError(0, 'Impossible de joindre GitHub (api.github.com). Vérifiez la connexion internet, désactivez le bloqueur de publicités / VPN / filtre réseau pour ce site, puis réessayez. Détail : ' + (e && e.message ? e.message : e));
    }
    let json = null;
    try { json = await res.json(); } catch { /* corps vide */ }
    return { status: res.status, ok: res.ok, json };
  }

  /** Vérifie l'accès au dépôt ; renvoie le nom complet. */
  async check() {
    const r = await this.req('GET', '');
    if (!r.ok) throw new GitHubError(r.status, explain(r.status, r.json));
    if (r.json && r.json.permissions && r.json.permissions.push === false) throw new GitHubError(403, 'Le jeton n\'a pas le droit d\'écrire dans ce dépôt (permission « Contents : Read and write » requise).');
    return { name: r.json.full_name, private: !!r.json.private };
  }

  async getFile(path) {
    const r = await this.req('GET', `/contents/${path}?ref=${encodeURIComponent(this.branch)}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new GitHubError(r.status, explain(r.status, r.json));
    if (r.json.content) return { sha: r.json.sha, bytes: fromBase64(r.json.content) };
    // Fichier > 1 Mo : l'API « contents » ne renvoie pas le contenu, on passe par les blobs.
    const b = await this.req('GET', `/git/blobs/${r.json.sha}`);
    if (!b.ok) throw new GitHubError(b.status, explain(b.status, b.json));
    return { sha: r.json.sha, bytes: fromBase64(b.json.content) };
  }

  async getFileBytes(path) {
    const f = await this.getFile(path);
    return f ? f.bytes : null;
  }

  /** Crée ou met à jour un fichier. `sha` = version qu'on pense remplacer (absent pour une création). */
  async putFile(path, bytes, message, sha) {
    const r = await this.req('PUT', `/contents/${path}`, { message, content: toBase64(bytes), branch: this.branch, ...(sha ? { sha } : {}) });
    if (!r.ok) throw new GitHubError(r.status, explain(r.status, r.json));
    return r.json && r.json.content ? r.json.content.sha : null;
  }

  /** Identifiants des fichiers présents dans un dossier du dépôt. */
  async listFiles(dir) {
    const r = await this.req('GET', `/git/trees/${encodeURIComponent(this.branch)}?recursive=1`);
    if (r.status === 404 || r.status === 409) return new Set(); // dépôt vide
    if (!r.ok) throw new GitHubError(r.status, explain(r.status, r.json));
    return new Set((r.json.tree || []).filter((t) => t.type === 'blob' && t.path.startsWith(dir)).map((t) => t.path.slice(dir.length)));
  }
}
