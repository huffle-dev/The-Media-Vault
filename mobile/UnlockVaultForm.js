// Unlocks Encrypted Key Sync on this phone (passphrase or recovery key) so
// the API keys synced from desktop can be pulled. Shared by Search & Add's
// key-setup prompt and Settings → API keys & sync.
//
// `onUnlocked(masterKeyHex)` runs after a successful unlock; if it throws,
// the message is shown under the form.
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import AppButton from "./AppButton";
import Text from "./Text";
import TextInput from "./TextInput";
import { unlockVaultWithPassphrase, unlockVaultWithRecoveryKey } from "./secretsSync";
import { C } from "./colors";

// Android's Autofill framework offers to fill/suggest a saved or freshly
// generated password for any secureTextEntry field unless explicitly told
// not to — a real bug hit live: a generated suggestion ended up in the
// passphrase field, and — compounded by the passphrase and recovery-key
// inputs sharing one state variable, also since fixed — was then visible in
// plain text after switching to the (unmasked) recovery-key field.
const noAutofillProps = {
  autoComplete: "off",
  importantForAutofill: "no", // Android
  textContentType: "none",    // iOS
  autoCapitalize: "none",
  autoCorrect: false,
};

export default function UnlockVaultForm({ onUnlocked }) {
  const [mode, setMode] = useState("passphrase"); // "passphrase" | "recovery"
  const [passphrase, setPassphrase] = useState("");
  const [recovery, setRecovery] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState(null);

  async function handleUnlock() {
    const value = mode === "passphrase" ? passphrase : recovery;
    if (!value.trim()) return;
    setUnlocking(true);
    setError(null);
    try {
      const masterKeyHex = mode === "passphrase"
        ? await unlockVaultWithPassphrase(value)
        : await unlockVaultWithRecoveryKey(value);
      await onUnlocked(masterKeyHex);
      setPassphrase("");
      setRecovery("");
    } catch (e) {
      setError(e.message);
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.modeRow}>
        {["passphrase", "recovery"].map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.pill, mode === m && styles.pillActive]}>
            <Text style={[styles.pillText, mode === m && styles.pillTextActive]}>
              {m === "passphrase" ? "Passphrase" : "Recovery Key"}
            </Text>
          </Pressable>
        ))}
      </View>
      {/* Both fields always mounted (just hidden), not swapped by the mode
          toggle — a fresh mount is exactly when Android's Autofill framework
          is most likely to attach a suggestion. */}
      <TextInput
        style={[styles.input, mode !== "passphrase" && { display: "none" }]}
        value={passphrase} onChangeText={setPassphrase}
        placeholder="Passphrase" placeholderTextColor="#777" secureTextEntry
        {...noAutofillProps}
      />
      <TextInput
        style={[styles.input, mode !== "recovery" && { display: "none" }]}
        value={recovery} onChangeText={setRecovery}
        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" placeholderTextColor="#777"
        {...noAutofillProps}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <AppButton variant="primary" title={unlocking ? "Unlocking…" : "Unlock"} onPress={handleUnlock} disabled={unlocking} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  modeRow: { flexDirection: "row", gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  pillActive: { borderColor: C.accent, backgroundColor: "#e3aa2622" },
  pillText: { color: C.textSoft, fontSize: 13 },
  pillTextActive: { color: C.accent, fontWeight: "700" },
  input: { backgroundColor: C.surface, color: C.text, borderRadius: 8, padding: 12, fontSize: 15, borderWidth: 1, borderColor: C.border },
  error: { color: C.danger, fontSize: 13 },
});
