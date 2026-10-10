import { createServer } from 'node:http';

const HOST = '127.0.0.1';
const PORT = Number(process.env.CHROME109_MOCK_PORT || 3030);

function getLoopbackAppOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('CHROME109_MOCK_APP_ORIGIN must be an HTTP loopback origin.');
  }

  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('CHROME109_MOCK_APP_ORIGIN must be an HTTP loopback origin.');
  }

  return url.origin;
}

const APP_ORIGIN = getLoopbackAppOrigin(
  process.env.CHROME109_MOCK_APP_ORIGIN || 'http://127.0.0.1:4174',
);
const EMAIL = 'agent@example.test';
const PASSWORD = 'synthetic-password';
const TOKEN = 'synthetic-access-token';
const CONVERSATION_ID = '8a71d41a-1938-4caf-93bb-61bd4451db29';
const nowSeconds = Math.floor(Date.now() / 1000);
const events = [];

const user = {
  id: 'synthetic-agent-1',
  uid: 'synthetic-agent-1',
  name: 'Agente Sintético',
  email: EMAIL,
  confirmed: true,
  availability: 'online',
  role: { id: 'synthetic-role-1', key: 'agent', name: 'Agente' },
  ui_settings: {},
  pubsub_token: 'synthetic-pubsub-token',
};

const inbox = {
  id: 1,
  name: 'Caixa Sintética',
  channel_type: 'Channel::WebWidget',
  channel_id: 1,
  avatar_url: null,
};

const contact = {
  id: 2,
  name: 'Contato Sintético',
  email: 'contact@example.test',
  phone_number: '+5500000000000',
  thumbnail: '',
  additional_attributes: {},
  custom_attributes: {},
};

const conversation = {
  id: CONVERSATION_ID,
  uuid: CONVERSATION_ID,
  account_id: 1,
  inbox_id: 1,
  status: 'open',
  unread_count: 1,
  messages_count: 1,
  timestamp: nowSeconds,
  created_at: new Date(nowSeconds * 1000).toISOString(),
  updated_at: new Date(nowSeconds * 1000).toISOString(),
  last_activity_at: nowSeconds,
  last_non_activity_message: null,
  can_reply: true,
  meta: {
    sender: contact,
    assignee: user,
    assignee_type: 'User',
    team: null,
    hmac_verified: true,
  },
  contact,
  inbox,
  labels: [],
  custom_attributes: {},
  messages: [],
};

const initialMessage = {
  id: 'synthetic-message-1',
  content: 'Olá! Esta conversa é apenas um dado sintético para o teste local.',
  message_type: 0,
  private: false,
  status: 'sent',
  created_at: new Date(nowSeconds * 1000).toISOString(),
  conversation_id: CONVERSATION_ID,
  inbox_id: 1,
  sender: contact,
  attachments: [],
};
let messages = [initialMessage];

function resetFixture() {
  messages = [initialMessage];
  conversation.unread_count = 1;
  conversation.messages_count = 1;
  conversation.last_activity_at = nowSeconds;
  conversation.last_non_activity_message = initialMessage;
  conversation.messages = messages;
}
conversation.last_non_activity_message = messages[0];
conversation.messages = messages;

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': APP_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Timing-Allow-Origin': APP_ORIGIN,
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function authorized(req) {
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

const server = createServer(async (req, res) => {
  if (req.headers.origin && req.headers.origin !== APP_ORIGIN) {
    return send(res, 403, { error: 'origin_not_allowed' });
  }
  if (req.method === 'OPTIONS') return send(res, 204, {});

  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const path = url.pathname.replace(/^\/api\/v1/, '');

  if (req.method === 'GET' && path === '/__mock__/stats') {
    return send(res, 200, { events });
  }

  if (req.method === 'POST' && path === '/__mock__/reset') {
    resetFixture();
    events.length = 0;
    return send(res, 200, { success: true, data: {} });
  }

  if (path === '/setup/status' && req.method === 'GET') {
    return send(res, 200, { status: 'active', instance_id: 'synthetic-instance', licensed: true });
  }

  if (path === '/auth/login' && req.method === 'POST') {
    const body = await readJson(req);
    if (body.email !== EMAIL || body.password !== PASSWORD) {
      events.push({ method: 'POST', path, outcome: 'rejected_synthetic_credentials' });
      return send(res, 401, { success: false, message: 'Credenciais sintéticas inválidas' });
    }
    events.push({ method: 'POST', path, outcome: 'synthetic_login' });
    return send(res, 200, {
      success: true,
      data: { user, token: { access_token: TOKEN } },
      message: 'synthetic login',
    });
  }

  if (path === '/auth/refresh' && req.method === 'POST') {
    if (!authorized(req)) return send(res, 401, { message: 'synthetic session absent' });
    return send(res, 200, { success: true, data: { access_token: TOKEN } });
  }

  if (path === '/auth/validate' && req.method === 'POST') {
    if (!authorized(req)) return send(res, 401, { message: 'synthetic session absent' });
    events.push({ method: 'POST', path, outcome: 'synthetic_session_validated' });
    return send(res, 200, { success: true, data: { user, token: { access_token: TOKEN } } });
  }

  if (path === '/auth/logout' && req.method === 'POST') return send(res, 200, { success: true, data: {} });

  if (path === '/resource_actions' && req.method === 'GET') {
    return send(res, 200, {
      success: true,
      data: {
        resources: {
          conversations: {
            name: 'Conversas',
            description: 'Fixture local',
            actions: {
              read: { name: 'Ler', description: 'Ler fixture' },
              update: { name: 'Atualizar', description: 'Atualizar fixture' },
            },
          },
        },
        all_permissions: [
          { key: 'conversations.read', resource: 'conversations', action: 'read', display_name: 'Ler conversas', resource_name: 'Conversas', action_name: 'Ler', description: 'Fixture' },
          { key: 'conversations.update', resource: 'conversations', action: 'update', display_name: 'Atualizar conversas', resource_name: 'Conversas', action_name: 'Atualizar', description: 'Fixture' },
        ],
      },
      meta: {},
    });
  }

  if (path === '/permissions' && req.method === 'GET') {
    return send(res, 200, { success: true, data: { permissions: ['conversations.read', 'conversations.update'] } });
  }

  if (path === '/account' && req.method === 'GET') {
    return send(res, 200, { success: true, data: { id: 1, name: 'Conta Sintética', locale: 'pt-BR', settings: {} } });
  }

  if (path === '/global_config' && req.method === 'GET') return send(res, 200, {});

  if (path === '/inboxes' && req.method === 'GET') {
    return send(res, 200, { success: true, data: [inbox], meta: { count: 1 } });
  }

  if (path === '/user_tours' && req.method === 'GET') return send(res, 200, { success: true, data: [] });
  if (path === '/conversations/unanswered' && req.method === 'GET') return send(res, 200, { success: true, data: [] });

  if (path === '/conversations' && req.method === 'GET') {
    events.push({ method: 'GET', path, outcome: 'synthetic_list_read' });
    return send(res, 200, {
      payload: [conversation],
      meta: { page: 1, page_size: 20, total: 1, total_pages: 1 },
    });
  }

  const messagePath = path.match(/^\/conversations\/([^/]+)\/messages$/);
  if (messagePath && req.method === 'GET') {
    events.push({ method: 'GET', path, outcome: 'synthetic_messages_read' });
    return send(res, 200, {
      payload: messages,
      meta: { page: 1, page_size: 50, total: messages.length, total_pages: 1 },
    });
  }

  const readPath = path.match(/^\/conversations\/([^/]+)\/update_last_seen$/);
  if (readPath && req.method === 'POST') {
    conversation.unread_count = 0;
    events.push({ method: 'POST', path, outcome: 'synthetic_mark_read' });
    return send(res, 200, { success: true, data: {} });
  }

  if (messagePath && req.method === 'POST') {
    const body = await readJson(req);
    if (body.private !== false || !String(body.content || '').trim()) {
      return send(res, 422, { success: false, message: 'Mock permite apenas envio de texto público não vazio' });
    }
    const message = {
      id: `synthetic-message-${messages.length + 1}`,
      content: String(body.content),
      message_type: 1,
      private: false,
      status: 'sent',
      created_at: new Date().toISOString(),
      conversation_id: CONVERSATION_ID,
      inbox_id: 1,
      sender: user,
      attachments: [],
    };
    messages = [...messages, message];
    conversation.last_non_activity_message = message;
    conversation.messages = messages;
    events.push({
      method: 'POST',
      path,
      outcome: 'synthetic_text_send',
      message_type: body.message_type,
      private: body.private,
      content_length: String(body.content).length,
    });
    return send(res, 200, { success: true, data: message });
  }

  if (path.startsWith('/conversations/')) {
    events.push({ method: req.method, path, outcome: 'synthetic_noop' });
    return send(res, 200, { success: true, data: conversation });
  }

  events.push({ method: req.method, path, outcome: 'synthetic_empty_fallback' });
  return send(res, 200, { success: true, data: [], payload: [], meta: {} });
});

server.on('upgrade', (_req, socket) => socket.destroy());
server.listen(PORT, HOST, () => {
  console.log(`Chrome 109 mock API listening only on http://${HOST}:${PORT}`);
  console.log(`Accepted frontend origin: ${APP_ORIGIN}`);
  console.log(`Synthetic login: ${EMAIL} / ${PASSWORD}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
