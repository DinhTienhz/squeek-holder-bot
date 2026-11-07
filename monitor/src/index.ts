
/**
 * External health monitor: a separate Worker so it keeps running if the bot
 * Worker breaks. Every 5 minutes it calls the bot's /health and sends one
 * Telegram message on the up -> down transition (and on recovery).
 */
type Env = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  BOT_HEALTH_URL?: string;
  ALERT_CHAT_ID?: string;
};

async function readState(env: Env): Promise<{ state: string; at: number }> {
  const row = await env.DB.prepare("SELECT value FROM monitor WHERE key = 'state'").first<{ value: string }>();
  if (!row) return { state: '', at: 0 };
  const [state, at] = row.value.split('|');
  return { state, at: Number(at) || 0 };
}

async function writeState(env: Env, state: string, at: number): Promise<void> {
  await env.DB.prepare("INSERT INTO monitor (key, value) VALUES ('state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(`${state}|${at}`).run();
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

export default {
  async fetch(): Promise<Response> {
    return new Response('squeek-monitor', { headers: { 'content-type': 'text/plain' } });
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const url = env.BOT_HEALTH_URL ?? 'https://squeek-bot.chainn.workers.dev/health';
    const prev = await readState(env);
    let ok = false;
    let detail = '';
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'squeek-monitor/1' } });
      ok = res.ok;
      detail = `HTTP ${res.status}`;
    } catch (e) {
      detail = String((e as Error).message || e);
    }
    const now = Date.now();

    if (!ok) {
      console.log(JSON.stringify({ health: 'down', prev: prev.state, detail }));
      // One alert per outage, then a reminder every 6 hours.
      if (prev.state !== 'down' || now - prev.at > 6 * 3600_000) {
        await alert(env, `⚠️ <b>Squeek bot health check failed</b>\n${url}\n<i>${detail}</i>\n${new Date(now).toISOString()}`);
        await writeState(env, 'down', now);
      }
      return;
    }

    if (prev.state === 'down') {
      await alert(env, `✅ <b>Squeek bot recovered</b>\n${url}\n${new Date(now).toISOString()}`);
    }
    if (prev.state !== 'up') await writeState(env, 'up', now);
    console.log(JSON.stringify({ health: ok ? 'up' : 'down', prev: prev.state, detail }));
  },
};
