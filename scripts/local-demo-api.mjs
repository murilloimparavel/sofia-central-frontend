import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Local UI simulation only. Bind loopback and never proxy production services.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.local-demo');
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'sofia-demo.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    salt TEXT NOT NULL, password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY, payload TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY, payload TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, payload TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, payload TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_tours (
    tour_key TEXT PRIMARY KEY, status TEXT NOT NULL, completed_at TEXT NOT NULL
  );
`);
// Remove the first-generation fixture identifiers when the demo API restarts.
db.prepare("DELETE FROM messages WHERE id LIKE 'demo-%'").run();
db.prepare("DELETE FROM conversations WHERE id LIKE 'demo-%'").run();
db.prepare("DELETE FROM contacts WHERE id LIKE 'demo-%'").run();
db.prepare("DELETE FROM channels WHERE id LIKE 'demo-%'").run();

const email = 'demo@sofia.local';
const password = 'SofiaDemo2026!';
const now = new Date().toISOString();
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (!existing) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  db.prepare('INSERT INTO users (id,email,name,salt,password_hash) VALUES (?,?,?,?,?)')
    .run('local-demo-user', email, 'Atendente Demonstração', salt, hash);
}

const demoChannel = { id: '00000000-0000-4000-8000-000000000001', name: 'WhatsApp • Demonstração', display_name: 'WhatsApp Demo', channel_id: '00000000-0000-4000-8000-000000000007', channel_type: 'Channel::Api', provider: 'local-demo', phone_number: '+55 64 90000-0100', connection_state: 'connected', health_source: 'stored_flag', greeting_enabled: false, enable_auto_assignment: false, created_at: now };
const demoContact = { id: '00000000-0000-4000-8000-000000000002', name: 'Marina Oliveira (Teste)', type: 'person', email: 'marina.teste@example.invalid', phone_number: '+55 64 90000-0200', thumbnail: '', avatar: '', avatar_url: '', identifier: 'marina-demo', tax_id: '', website: '', industry: '', created_at: now, updated_at: now, last_activity_at: now, custom_attributes: { demo: true }, additional_attributes: { city: 'Caldas Novas', country: 'Brasil' }, contact_inboxes: [{ source_id: '00000000-0000-4000-8000-000000000006', inbox: { id: demoChannel.id, name: demoChannel.name } }], labels: [], conversations_count: 1 };
const demoMessage = { id: '00000000-0000-4000-8000-000000000004', content: 'Olá! Gostaria de saber sobre disponibilidade para este fim de semana.', content_attributes: {}, content_type: 'text', conversation_id: '00000000-0000-4000-8000-000000000003', created_at: now, sender_type: 'contact', external_source_ids: {}, message_type: 'incoming', private: false, sender: { id: demoContact.id, name: demoContact.name, type: 'contact' }, source_id: '00000000-0000-4000-8000-000000000006', status: 'read', attachments: [] };
const demoConversation = { id: '00000000-0000-4000-8000-000000000003', uuid: '00000000-0000-4000-8000-000000000003', inbox_id: demoChannel.id, inbox_name: demoChannel.name, status: 'open', assignee_id: null, team_id: null, display_id: 'DEMO-001', contact_last_seen_at: now, agent_last_seen_at: null, additional_attributes: {}, can_reply: true, channel: 'Channel::Api', contact_inbox_id: '00000000-0000-4000-8000-000000000005', created_at: now, updated_at: now, custom_attributes: { demo: true }, first_reply_created_at: null, identifier: 'marina-demo', last_activity_at: now, muted: false, priority: 'medium', pipeline_id: null, snoozed_until: null, timestamp: Math.floor(Date.now()/1000), unread_count: 1, waiting_since: Math.floor(Date.now()/1000), meta: { hmac_verified: true, sender: { id: demoContact.id, name: demoContact.name, type: 'contact', email: demoContact.email, phone_number: demoContact.phone_number } }, contact: demoContact, inbox: demoChannel, assignee: null, team: null, labels: [], messages: [demoMessage], last_non_activity_message: { id: demoMessage.id, content: demoMessage.content, message_type: 'incoming', created_at: now, processed_message_content: demoMessage.content, sender: { id: demoContact.id, name: demoContact.name, type: 'contact' } } };
db.prepare('INSERT INTO channels (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(demoChannel.id, JSON.stringify(demoChannel));
db.prepare('INSERT INTO contacts (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(demoContact.id, JSON.stringify(demoContact));
db.prepare('INSERT INTO conversations (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(demoConversation.id, JSON.stringify(demoConversation));
db.prepare('INSERT INTO messages (id,conversation_id,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET conversation_id=excluded.conversation_id,payload=excluded.payload').run(demoMessage.id, demoConversation.id, JSON.stringify(demoMessage));

const resources = ['conversations','contacts','pipelines','products','automation_rules','journeys','campaigns','ai_agents','ai_custom_tools','ai_custom_mcp_servers','inboxes','accounts','users','teams','labels','custom_attribute_definitions','segments','canned_responses','ai_api_keys','ai_integration_credentials','message_templates','macros','crm_forms','chat_pages','templates','integrations','access_tokens','roles','installation_configs'];
const actions = ['read','create','update','delete','manage'];
const allPermissions = resources.flatMap(resource => actions.map(action => ({
  key: `${resource}.${action}`, resource, action,
  display_name: `${resource} ${action}`, resource_name: resource, action_name: action,
  description: `Permissão simulada de demonstração para ${resource}`,
})));
const resourceMap = Object.fromEntries(resources.map(resource => [resource, {
  name: resource, description: 'Recurso fictício da demonstração',
  actions: Object.fromEntries(actions.map(action => [action, { name: action, description: action }])),
}]));

function send(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Local-Demo': 'true',
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function publicUser(row) {
  return {
    id: row.id, uid: row.id, email: row.email, name: row.name,
    display_name: row.name, confirmed: true, availability: 'online',
    role: { id: 'local-demo-admin', key: 'admin', name: 'Administração de demonstração',
      description: 'Papel fictício local', system: true, type: 'account', created_at: now, updated_at: now },
  };
}

function getSession(req) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return db.prepare(`SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > ?`).get(token, Date.now()) || null;
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const allowedOrigins = new Set(['http://127.0.0.1:5174','http://localhost:5174','http://127.0.0.1:5173','http://localhost:5173']);
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return send(res, 204, {});

  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const route = url.pathname.replace(/^\/api\/v1/, '');
  try {
    if (req.method === 'GET' && route === '/health') return send(res, 200, { mode: 'local-demo', database: 'sqlite', realServices: false });
    if (req.method === 'GET' && route === '/setup/status') return send(res, 200, { status: 'active', instance_id: 'local-demo', licensed: false });
    if (req.method === 'GET' && route === '/global_config') return send(res, 200, { hasFacebookConfig: false, hasWhatsappConfig: false, hasInstagramConfig: false, hasEvolutionConfig: false, openaiConfigured: false });

    if (req.method === 'POST' && route === '/auth/login') {
      const body = await readBody(req);
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(body.email || '').trim().toLowerCase());
      if (!user) return send(res, 401, { success: false, message: 'E-mail ou senha inválidos.' });
      const attempted = scryptSync(String(body.password || ''), user.salt, 64);
      const expected = Buffer.from(user.password_hash, 'hex');
      if (attempted.length !== expected.length || !timingSafeEqual(attempted, expected)) {
        return send(res, 401, { success: false, message: 'E-mail ou senha inválidos.' });
      }
      const token = randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, user.id, Date.now() + 12 * 60 * 60 * 1000);
      return send(res, 200, { success: true, data: { user: publicUser(user), token: { access_token: token, token_type: 'Bearer', expires_in: 43200 } }, message: 'Login de demonstração realizado.' });
    }

    const user = getSession(req);
    if (req.method === 'POST' && route === '/auth/validate') {
      if (!user) return send(res, 401, { success: false, message: 'Sessão inválida.' });
      return send(res, 200, { success: true, data: { user: publicUser(user) } });
    }
    if (req.method === 'POST' && route === '/auth/logout') {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return send(res, 200, { success: true, data: {} });
    }
    if (!user) return send(res, 401, { success: false, message: 'Faça login na demonstração local.' });

    if (req.method === 'GET' && route === '/resource_actions') {
      return send(res, 200, { success: true, data: { resources: resourceMap, all_permissions: allPermissions }, meta: { timestamp: now, total_resources: resources.length, total_permissions: allPermissions.length, last_updated: now } });
    }
    if (req.method === 'GET' && route === '/permissions') return send(res, 200, { success: true, data: { permissions: allPermissions.map(permission => permission.key) } });
    if (req.method === 'GET' && route === '/dashboard_apps') return send(res, 200, { success: true, data: [], meta: { count: 0, total_count: 0 } });
    if (req.method === 'GET' && ['/pipelines','/teams','/labels','/users'].includes(route)) return send(res, 200, { success: true, data: [], meta: { count: 0, total_count: 0, current_page: 1 } });
    if (req.method === 'GET' && route === '/user_tours') {
      const tours = db.prepare('SELECT tour_key,status,completed_at FROM user_tours').all().map(row => ({ id: row.tour_key, tour_key: row.tour_key, status: row.status, completed_at: row.completed_at }));
      return send(res, 200, { success: true, data: tours });
    }
    if (req.method === 'POST' && route === '/user_tours') {
      const body = await readBody(req);
      const tourKey = String(body.tour?.tour_key || 'welcome-tour');
      const status = body.tour?.status === 'completed' ? 'completed' : 'skipped';
      const completedAt = new Date().toISOString();
      db.prepare('INSERT INTO user_tours (tour_key,status,completed_at) VALUES (?,?,?) ON CONFLICT(tour_key) DO UPDATE SET status=excluded.status,completed_at=excluded.completed_at').run(tourKey, status, completedAt);
      return send(res, 200, { success: true, data: { id: tourKey, tour_key: tourKey, status, completed_at: completedAt } });
    }
    const resetTourMatch = route.match(/^\/user_tours\/([^/]+)$/);
    if (req.method === 'DELETE' && resetTourMatch) {
      db.prepare('DELETE FROM user_tours WHERE tour_key = ?').run(decodeURIComponent(resetTourMatch[1]));
      return send(res, 200, { success: true, data: {} });
    }
    if (req.method === 'GET' && route === '/conversations/unanswered_count') return send(res, 200, { success: true, data: { unanswered_count: 1 } });
    if (req.method === 'GET' && route === '/conversations/meta') return send(res, 200, { success: true, data: { open_count: 1, resolved_count: 0, pending_count: 0, mine_count: 0, unassigned_count: 1, all_count: 1 } });
    if (req.method === 'GET' && route === '/conversations') {
      const rows = db.prepare('SELECT payload FROM conversations ORDER BY id').all().map(row => JSON.parse(row.payload));
      return send(res, 200, { success: true, data: { payload: rows }, meta: { count: rows.length, total_count: rows.length, mine_count: 0, unassigned_count: rows.length, all_count: rows.length, current_page: 1 } });
    }
    const conversationMatch = route.match(/^\/conversations\/([^/]+)(?:\/(messages))?$/);
    if (req.method === 'GET' && conversationMatch) {
      const row = db.prepare('SELECT payload FROM conversations WHERE id = ?').get(conversationMatch[1]);
      if (!row) return send(res, 404, { success: false, message: 'Conversa não encontrada.' });
      const conversation = JSON.parse(row.payload);
      if (conversationMatch[2]) {
        const messages = db.prepare('SELECT payload FROM messages WHERE conversation_id = ? ORDER BY id').all(conversationMatch[1]).map(item => JSON.parse(item.payload));
        return send(res, 200, { success: true, data: messages });
      }
      return send(res, 200, { success: true, data: conversation });
    }
    const markReadMatch = route.match(/^\/conversations\/([^/]+)\/update_last_seen$/);
    if (req.method === 'POST' && markReadMatch) {
      const row = db.prepare('SELECT payload FROM conversations WHERE id = ?').get(markReadMatch[1]);
      if (!row) return send(res, 404, { success: false, message: 'Conversa não encontrada.' });
      const conversation = { ...JSON.parse(row.payload), unread_count: 0, agent_last_seen_at: new Date().toISOString() };
      db.prepare('UPDATE conversations SET payload = ? WHERE id = ?').run(JSON.stringify(conversation), conversation.id);
      return send(res, 200, { success: true, data: conversation });
    }
    if (req.method === 'GET' && /^\/conversations\/[^/]+\/pipelines$/.test(route)) return send(res, 200, { success: true, data: [] });
    if (req.method === 'GET' && route === '/inboxes') {
      const rows = db.prepare('SELECT payload FROM channels').all().map(row => JSON.parse(row.payload));
      return send(res, 200, { success: true, data: rows, meta: { count: rows.length, total_count: rows.length, current_page: 1 } });
    }
    if (req.method === 'GET' && (route === '/contacts' || route === '/contacts/all' || route === '/contacts/active')) {
      const rows = db.prepare('SELECT payload FROM contacts').all().map(row => JSON.parse(row.payload));
      return send(res, 200, { success: true, data: rows, meta: { count: rows.length, total_count: rows.length, current_page: 1 } });
    }
    const contactMatch = route.match(/^\/contacts\/([^/]+)$/);
    if (req.method === 'GET' && contactMatch) {
      const row = db.prepare('SELECT payload FROM contacts WHERE id = ?').get(contactMatch[1]);
      return row ? send(res, 200, { success: true, data: JSON.parse(row.payload) }) : send(res, 404, { success: false, message: 'Contato não encontrado.' });
    }

    // Deliberately empty, read-only-safe fallbacks let the shell render without
    // fabricating customer records or forwarding requests to a live backend.
    if (req.method === 'GET') return send(res, 200, { success: true, data: [], meta: { count: 0, total_count: 0, current_page: 1, per_page: 20 } });
    return send(res, 501, { success: false, message: 'Ação indisponível no modo de demonstração local.' });
  } catch {
    return send(res, 400, { success: false, message: 'Requisição inválida no modo de demonstração.' });
  }
});

server.on('error', error => {
  console.error(`Não foi possível iniciar a API local: ${error.message}`);
  process.exitCode = 1;
});
server.listen(4180, '127.0.0.1', () => {
  console.log('API demo SQLite ativa apenas em http://127.0.0.1:4180');
  console.log(`Login local: ${email} / ${password}`);
});

for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
