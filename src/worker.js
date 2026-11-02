/**
 * Cloudflare Worker: phục vụ static assets trong ./public.
 * Cấu hình ở wrangler.toml ([assets] directory = "./public").
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
