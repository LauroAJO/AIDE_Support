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
    if (url.pathname === '/trigger') {
      if (url.searchParams.get('secret') !== env.CRON_SECRET) {
        return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      ctx.waitUntil(runCron(env));
      return new Response(JSON.stringify({ ok: true, message: 'Cron triggered manually' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('AIDE Cron Worker — use /ping ou /trigger?secret=', { status: 200 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env));
  },
};

async function runCron(env) {
  if (!env.CRON_SECRET) {
    console.error('AIDE Cron: CRON_SECRET not configured');
    return;
  }
  const baseUrl = (env.AIDE_URL || 'https://aide-support.pages.dev').replace(/\/$/, '');
  try {
    const res = await fetch(`${baseUrl}/api/cron/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': env.CRON_SECRET },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`AIDE Cron: HTTP ${res.status}`, JSON.stringify(data));
      return;
    }
    console.log('AIDE Cron OK:', JSON.stringify(data.result || data));
  } catch (err) {
    console.error('AIDE Cron fetch failed:', err.message);
  }
}
