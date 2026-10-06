// Shown INSTEAD of the app when the last run ended in a crash the person hasn't seen yet. It uses nothing that
// could have caused the crash (no library, no providers), so it opens even when the normal app won't:
// it says what happened, lets the log be sent to the computer or shared, can clear this phone's saved copy of
// the library (the usual suspect after a bad update), and then tries the app again.
import { useState } from "react";
import { ScrollView, Share, StyleSheet, View } from "react-native";
import Text from "./Text";
import AppButton from "./AppButton";
import { diag, ackFatal } from "./diag";
import { buildHeader, sendLogToComputer } from "./diagSend";
import { clearLibraryCache } from "./libraryCache";
import { C, F } from "./colors";

export default function CrashRecovery({ crash, onContinue }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try { await sendLogToComputer(); setStatus("Sent. Open The Media Vault on your computer: Settings → Cloud Sync → The phone's log."); }
    catch (e) { setStatus(`Couldn't send it: ${e.message}`); }
    setBusy(false);
  };
  const clearCopy = () => { try { clearLibraryCache(); setStatus("Cleared this phone's saved copy of your library. It downloads again next time."); } catch (e) { setStatus(`Couldn't clear it: ${e.message}`); } };
  const carryOn = () => { ackFatal(); onContinue(); };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={styles.body}>
      <Text style={styles.title}>The app closed unexpectedly</Text>
      <Text style={styles.p}>{buildHeader()}</Text>
      <Text style={styles.p}>Last time The Media Vault stopped because of this:</Text>
      <View style={styles.box}>
        <Text style={styles.err}>{crash.message}</Text>
        {crash.detail ? <Text style={styles.detail} numberOfLines={14}>{crash.detail}</Text> : null}
      </View>
      <Text style={styles.p}>Send the log to your computer so it can be looked at, then try again.</Text>
      <View style={styles.buttons}>
        <AppButton title={busy ? "Sending…" : "Send log to my computer"} variant="primary" disabled={busy} onPress={send} />
        <AppButton title="Share the log another way" variant="action" onPress={() => Share.share({ message: diag.toText(buildHeader()) })} />
        <AppButton title="Clear the saved library copy" variant="action" onPress={clearCopy} />
        <AppButton title="Try the app again" variant="action" onPress={carryOn} />
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingTop: 48, gap: 12 },
  title: { fontFamily: F.serif, color: C.text, fontSize: 24 },
  p: { color: C.muted, fontSize: 13.5, lineHeight: 20 },
  box: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 12, gap: 6 },
  err: { color: C.danger, fontSize: 13.5, lineHeight: 19 },
  detail: { color: C.muted, fontFamily: F.mono, fontSize: 10.5, lineHeight: 15 },
  buttons: { gap: 10, alignItems: "flex-start" },
  status: { color: C.text, fontSize: 13, lineHeight: 19 },
});
