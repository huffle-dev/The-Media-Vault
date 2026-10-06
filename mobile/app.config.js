// app.json stays the single source of the app's settings. The only thing added here is, for the browser
// demo, the folder the page is served from (e.g. /the-repo/demo-phone on GitHub Pages).
module.exports = ({ config }) => {
  const base = process.env.MEDIA_VAULT_PHONE_DEMO_BASE;
  return base ? { ...config, experiments: { ...(config.experiments || {}), baseUrl: base } } : config;
};
