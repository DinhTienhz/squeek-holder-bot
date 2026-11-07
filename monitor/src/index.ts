
/**
 * External health monitor. Separate Worker so it survives a broken bot or site.
 * Every 5 minutes it checks each target and sends one Telegram message per
 * up -> down transition, a reminder every 6 hours, and one message on recovery.
 */
type Env = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  ALERT_CHAT_ID?: string;
  BOT_HEALTH_URL?: string;
  OTC_HOME_URL?: string;
  OTC_MARKET_URL?: string;
};

type Target = { name: string; url: string; marker: string };

async function readState(env: Env, key: string): Promise<{ state: string; at: number }> {
  const row = await env.DB.prepare('SELECT value FROM monitor WHERE key = ?').bind(key).first<{ value: string }>();
  if (!row) return { state: '', at: 0 };
  const [state, at] = row.value.split('|');
  return { state, at: Number(at) || 0 };
}

async function writeState(env: Env, key: string, state: string, at: number): Promise<void> {
  await env.DB.prepare('INSERT INTO monitor (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, `${state}|${at}`).run();
}

async function alert(env: Env, text: string): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN ?? '';
  const chat = env.ALERT_CHAT_ID ?? '';
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
    });
  } catch { /* the monitor must not fail because Telegram is down */ }
}

async function check(t: Target): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(t.url, {
      signal: AbortSignal.timeout(12_000),
      headers: { 'user-agent': 'squeek-monitor/1', accept: 'text/html,application/json' },
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const body = (await res.text()).slice(0, 40_000);
    if (t.marker && !body.includes(t.marker)) return { ok: false, detail: 'page loaded but marker missing' };
    return { ok: true, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: String((e as Error).message || e) };
  }
}

export default {
  async fetch(): Promise<Response> {
    return new Response('squeek-monitor', { headers: { 'content-type': 'text/plain' } });
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const targets: Target[] = [
      { name: 'bot', url: env.BOT_HEALTH_URL ?? 'https://squeek-bot.chainn.workers.dev/health', marker: '"ok":true' },
      { name: 'otc-home', url: env.OTC_HOME_URL ?? 'https://squeeksotc.bid/', marker: 'Squeek OTC' },
      { name: 'otc-market', url: env.OTC_MARKET_URL ?? 'https://squeeksotc.bid/market', marker: 'Squeek OTC' },
    ];

    await Promise.all(targets.map(async (t) => {
      const key = `state:${t.name}`;
      const prev = await readState(env, key);
      const { ok, detail } = await check(t);
      const now = Date.now();
      console.log(JSON.stringify({ target: t.name, ok, prev: prev.state, detail }));

      if (!ok) {
        if (prev.state !== 'down' || now - prev.at > 6 * 3600_000) {
          await alert(env, `⚠️ <b>${t.name} health check failed</b>\n${t.url}\n<i>${detail}</i>\n${new Date(now).toISOString()}`);
          await writeState(env, key, 'down', now);
        }
        return;
      }

      if (prev.state === 'down') {
        await alert(env, `✅ <b>${t.name} recovered</b>\n${t.url}\n${new Date(now).toISOString()}`);
      }
      if (prev.state !== 'up') await writeState(env, key, 'up', now);
    }));
  },
};
