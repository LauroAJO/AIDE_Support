// AIDE Cron Worker — satellite Worker (NOT Pages).
// Cloudflare Pages can't host [triggers], so this standalone Worker fires the
// daily deadline notifications by calling AIDE's POST /api/cron/run.
//
// Deploy:
//   cd aide_cron_worker
//   npx wrangler deploy
//
// Secrets (Dashboard → Workers → aide-cron → Settings → Variables):
//   CRON_SECRET = "<a mesma string definida como secret no Pages aide-support>"
//   AIDE_URL is set in wrangler.toml [vars] (override here if needed).

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/ping') {
      return new Response(JSON.stringify({ ok: true, service: 'aide-cron' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET /trigger?secret=XXX — manual run for testing.
    // ?job=bridge dispara o poll de conclusões em vez da rotina diária.
    if (url.pathname === '/trigger') {
      if (url.searchParams.get('secret') !== env.CRON_SECRET) {
        return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const job = url.searchParams.get('job') === 'bridge' ? 'bridge' : 'daily';
      ctx.waitUntil(job === 'bridge' ? runBridgeSync(env) : runCron(env));
      return new Response(JSON.stringify({ ok: true, message: `Cron triggered manually (${job})` }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('AIDE Cron Worker — use /ping ou /trigger?secret=[&job=bridge]', { status: 200 });
  },

  // Dois horários no mesmo Worker (ver wrangler.toml [triggers]): event.cron diz
  // QUAL disparou. Sem este switch, o poll de 5 minutos passaria a mandar 288
  // notificações diárias por dia.
  async scheduled(event, env, ctx) {
    if (event.cron === '*/5 * * * *') ctx.waitUntil(runBridgeSync(env));
    else ctx.waitUntil(runCron(env));
  },
};

async function runCron(env) {
  return callAide(env, '/api/cron/run', 'AIDE Cron');
}

// Poll das conclusões do Lifegame (FIX_BRIDGE_AUTOSYNC). Corre de 5 em 5 min.
// Silencioso quando não há nada a fechar — só loga quando fecha alguma coisa,
// senão eram 288 linhas de "0 conclusões" por dia nos logs.
async function runBridgeSync(env) {
  return callAide(env, '/api/cron/bridge-sync', 'AIDE Bridge Sync', (data) => (data.closed || 0) > 0);
}

async function callAide(env, path, label, shouldLog = () => true) {
  if (!env.CRON_SECRET) {
    console.error(`${label}: CRON_SECRET not configured`);
    return;
  }
  const baseUrl = (env.AIDE_URL || 'https://aide-support.pages.dev').replace(/\/$/, '');
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': env.CRON_SECRET },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`${label}: HTTP ${res.status}`, JSON.stringify(data));
      return;
    }
    if (shouldLog(data)) console.log(`${label} OK:`, JSON.stringify(data.result || data));
  } catch (err) {
    console.error(`${label} fetch failed:`, err.message);
  }
}
