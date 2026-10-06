// GOG has no official way for a third-party app to sign in, so this feature borrows the
// app credentials GOG's own Galaxy launcher (and community tools) use. That is unofficial
// and could stop working, or be unwelcome to GOG, at any time — so in both apps it is OFF
// until the person turns it on after reading this, and turning it off signs out.
const GOG_WARNING = [
  "GOG offers no official way for other apps to sign in. This feature uses the same app credentials GOG's own Galaxy launcher uses, which other community tools use too.",
  "That makes it unofficial: it could stop working without warning, and GOG could treat it as against their terms. Your GOG password is never seen by this app — you sign in on GOG's own page — but it is your GOG account, so only turn this on if you're comfortable with that.",
];

module.exports = { GOG_WARNING };
