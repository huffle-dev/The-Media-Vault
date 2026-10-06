// "Your server" on the phone: the address and publishable key of the person's
// own Supabase project, with a Test button that says which setup step is
// missing. Shown on the sign-in screen when no server is set, and from the
// "Change" link there. The setup SQL itself is easiest to copy from the desktop
// app (Settings → Cloud Sync → Your server → Copy setup SQL).
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import BarcodeScanner from "./BarcodeScanner";
import AppButton from "./AppButton";
import Text from "./Text";
import TextInput from "./TextInput";
import { saveServerConfig } from "./supabase";
import setup from "@media-vault/core/supabaseSetup";
import { decodeSetupCode, looksLikeSetupCode } from "@media-vault/core/setupCode";
import { SETUP_GUIDE_URL } from "@media-vault/core/links.js";
import { C } from "./colors";

export default function ServerSetupForm({ onDone, onCancel }) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(null); // "test" | "save"
  const [result, setResult] = useState(null);
  const [scanning, setScanning] = useState(false);

  // A setup code (scanned, or pasted into either box) fills in both values.
  function applyCode(text) {
    const decoded = decodeSetupCode(text);
    if (!decoded.ok) { setResult({ ok: false, message: decoded.error }); return false; }
    setUrl(decoded.url);
    setKey(decoded.key);
    setResult({ ok: true, message: "Setup code read. Press Test connection, then Save." });
    return true;
  }
  const onUrlText = (t) => { if (looksLikeSetupCode(t)) applyCode(t); else setUrl(t); };
  const onKeyText = (t) => { if (looksLikeSetupCode(t)) applyCode(t); else setKey(t); };

  async function test() {
    setBusy("test");
    setResult(null);
    setResult(await setup.testSupabaseConnection({ url, key }));
    setBusy(null);
  }

  async function save() {
    setBusy("save");
    setResult(null);
    try {
      await saveServerConfig(url, key);
      onDone && onDone();
    } catch (e) {
      setResult({ ok: false, message: e.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.box}>
      <Text style={styles.lead}>
        This app syncs with The Media Vault on your computer, through a Supabase project that belongs to you. Set that up on your computer first (Settings → Cloud Sync → Your server). Then, there, press <Text style={styles.bold}>Set up my phone</Text> and scan the code here.
      </Text>
      <AppButton title="Scan setup code" variant="primary" onPress={() => setScanning(true)} />
      <Text style={styles.or}>or type them in (the address and the publishable key from your Supabase project's API settings)</Text>
      <TextInput
        style={styles.input} placeholder="Project URL (https://abcdefgh.supabase.co)" placeholderTextColor="#777"
        autoCapitalize="none" autoCorrect={false} keyboardType="url" value={url} onChangeText={onUrlText}
      />
      <TextInput
        style={styles.input} placeholder="Publishable key (sb_publishable_…)" placeholderTextColor="#777"
        autoCapitalize="none" autoCorrect={false} value={key} onChangeText={onKeyText}
      />
      {result && <Text style={[styles.result, { color: result.ok ? C.accent : C.danger }]}>{result.ok ? "✓ " : ""}{result.message}</Text>}
      <View style={styles.row}>
        <AppButton title={busy === "test" ? "Testing…" : "Test connection"} variant="action" onPress={test} disabled={!!busy || !url || !key} />
        <AppButton title={busy === "save" ? "Saving…" : "Save"} variant="primary" onPress={save} disabled={!!busy || !url || !key} />
      </View>
      <AppButton title="Don't have a server yet? Read the setup guide" variant="ghost" onPress={() => Linking.openURL(SETUP_GUIDE_URL)} />
      {onCancel && <AppButton title="Cancel" variant="ghost" onPress={onCancel} />}
      <BarcodeScanner
        visible={scanning} onClose={() => setScanning(false)} what="setup code" types={["qr"]}
        badHint="That isn't a Media Vault setup code. Use the one from Set up my phone on your computer."
        accept={(data) => (decodeSetupCode(data).ok ? data : null)}
        onCode={(data) => { setScanning(false); applyCode(data); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  lead: { color: C.muted, fontSize: 13, lineHeight: 19 },
  bold: { color: C.text, fontWeight: "700" },
  or: { color: C.muted, fontSize: 12, lineHeight: 17 },
  input: { backgroundColor: C.surface, color: C.text, borderRadius: 8, padding: 12, fontSize: 15 },
  result: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: "row", gap: 10 },
});
