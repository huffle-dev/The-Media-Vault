// When a page is shared to this app from another (IMDb, Steam, Audible,
// Goodreads, YouTube...), open Add for that kind of thing with the title already
// searched. Lives inside the signed-in screens, so a share made while signed out
// is simply dropped. See shareParse.js for what is recognised.
import { useEffect } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { parseShared } from "./shareParse";

export default function ShareHandler() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent) return;
    const found = parseShared({ text: shareIntent?.text, webUrl: shareIntent?.webUrl, title: shareIntent?.meta?.title });
    resetShareIntent();
    if (!found) {
      Alert.alert("Not sure what that is", "Share a page from IMDb, Steam, GOG, Audible, Goodreads, Discogs or YouTube, or add it with the + button.");
      return;
    }
    router.push({ pathname: "/add/[type]", params: { type: encodeURIComponent(found.mediaType), q: found.query } });
  }, [hasShareIntent, shareIntent, resetShareIntent, router]);

  return null;
}
