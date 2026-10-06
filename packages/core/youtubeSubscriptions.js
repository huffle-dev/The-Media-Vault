// Google Takeout -> YouTube -> subscriptions.csv: one row per channel you follow,
// with exactly the columns "Channel ID", "Channel URL" and "Channel title".
// Each row becomes a Web Video channel item; subscriber counts, the picture and
// the description are filled in afterwards by one batched YouTube lookup
// (main.js youtube:refreshChannels). Pure functions so they can be tested.

const isYoutubeSubscriptions = (headers) =>
  headers.includes("Channel ID") && headers.includes("Channel URL") && headers.includes("Channel title");

// A row without a channel id or a title maps to { title: null } and is dropped
// by the importer's `.filter(row => row.title)`.
const mapYoutubeSubscriptionRow = (row) => {
  const id = (row["Channel ID"] || "").trim();
  const title = (row["Channel title"] || "").trim();
  if (!id || !title) return { title: null };
  return {
    title,
    media_type: "Web Video",
    status: "not-started",
    platform_id: id,
    creator: title,
    platform: "YouTube",
    url: (row["Channel URL"] || "").trim() || `https://www.youtube.com/channel/${id}`,
  };
};

module.exports = { isYoutubeSubscriptions, mapYoutubeSubscriptionRow };
