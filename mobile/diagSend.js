// "Send log to my computer": the problems log goes into the person's own Supabase project (one app_settings row),
// where the desktop app's Cloud Sync settings can show it. Only ever on a button press; the same function is used
// by the Problems & logs screen and by the crash recovery screen.
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import { diag } from "./diag";
import { buildPhoneLogRow } from "@media-vault/core/phoneLog.js";

export const buildHeader = () =>
  `The Media Vault v${Constants.expoConfig?.version || "?"} (build ${Constants.expoConfig?.android?.versionCode || "?"})`;

export async function sendLogToComputer() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth || !auth.user) throw new Error("Sign in first, so the log has somewhere to go.");
  const row = buildPhoneLogRow(diag.toText(buildHeader()), {
    version: Constants.expoConfig?.version, build: Constants.expoConfig?.android?.versionCode, device: `${Platform.OS} ${Platform.Version}`,
  });
  const { error } = await supabase.from("app_settings").upsert(
    { user_id: auth.user.id, key: row.key, value: row.value, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" },
  );
  if (error) throw new Error(error.message);
}
