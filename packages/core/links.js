// Where error reports and feature requests go, as a pre-filled GitHub "new issue"
// link (query text only, nothing is sent until the person presses Submit there).
// The phone uses this; desktop builds the same link in main.js.

const REPO_ISSUES_URL = "https://github.com/huffle-dev/The-Media-Vault/issues/new";
const SETUP_GUIDE_URL = "https://github.com/huffle-dev/The-Media-Vault/blob/HEAD/docs/setup-your-server.md";

// `kind`: "bug" or "enhancement". `env` is shown in the report so it never misses the version.
function issueUrl(kind, { version, platform }) {
  const bug = kind === "bug";
  const body = [
    bug ? "**What happened?**" : "**What would you like to see?**",
    "",
    "",
    bug ? "**What did you expect?**" : "**Why would it help?**",
    "",
    "",
    `**App version:** ${version}`,
    `**Device:** ${platform}`,
  ].join("\n");
  return `${REPO_ISSUES_URL}?${new URLSearchParams({ labels: kind, body }).toString()}`;
}

module.exports = { REPO_ISSUES_URL, SETUP_GUIDE_URL, issueUrl };
