import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import AppButton from "./AppButton";
import Text from "./Text";
import TextInput from "./TextInput";
import { supabase, serverHost, getServerConfig, useServerConfig } from "./supabase";
import { supabaseUsersDashboardUrl } from "@media-vault/core/supabaseSetup";
import { validateSignUp, signUpOutcome, SIGN_UP_MESSAGES } from "@media-vault/core/authForm";
import ServerSetupForm from "./ServerSetupForm";
import { C, F } from "./colors";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // New here? The same form can make the account on your server instead of signing in.
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // No server yet (a fresh install), or the person chose to change it.
  const server = useServerConfig();
  const [changing, setChanging] = useState(false);

  async function createAccount() {
    const problem = validateSignUp({ email, password, confirm });
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    setNotice(null);
    const outcome = signUpOutcome(await supabase.auth.signUp({ email: email.trim(), password }));
    if (outcome.kind === "signedIn") setNotice(SIGN_UP_MESSAGES.afterSignIn); // the session listener takes over from here
    else if (outcome.kind === "confirm") { setNotice(SIGN_UP_MESSAGES.confirm); setCreating(false); }
    else if (outcome.kind === "exists") { setError(SIGN_UP_MESSAGES.exists); setCreating(false); }
    else setError(outcome.message);
    setBusy(false);
  }

  const resetUrl = server ? supabaseUsersDashboardUrl(getServerConfig()?.url) : null;

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError(err.message);
    setBusy(false);
  }

  if (!server || changing) {
    return (
      <View style={styles.center}>
        <Text style={styles.h1}>The Media Vault</Text>
        <ServerSetupForm onDone={() => setChanging(false)} onCancel={server ? () => setChanging(false) : undefined} />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Text style={styles.h1}>The Media Vault</Text>
      <TextInput
        style={styles.input} placeholder="Email" placeholderTextColor="#777"
        autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}
      />
      <TextInput
        style={styles.input} placeholder="Password" placeholderTextColor="#777"
        secureTextEntry value={password} onChangeText={setPassword}
      />
      {creating && (
        <TextInput
          style={styles.input} placeholder="Confirm password" placeholderTextColor="#777"
          secureTextEntry value={confirm} onChangeText={setConfirm}
        />
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      {notice && <Text style={styles.notice}>{notice}</Text>}
      <AppButton
        variant="primary" title={busy ? (creating ? "Creating…" : "Signing in…") : (creating ? "Create account" : "Sign in")}
        onPress={creating ? createAccount : signIn} disabled={busy || !email || !password || (creating && !confirm)}
      />
      <Text style={styles.server} accessibilityRole="button" onPress={() => { setCreating((c) => !c); setError(null); setNotice(null); }}>
        <Text style={styles.serverLink}>{creating ? "I already have an account" : "New here? Create an account"}</Text>
      </Text>
      {resetUrl && (
        <Text style={styles.server} accessibilityRole="link" onPress={() => Linking.openURL(resetUrl)}>
          <Text style={styles.serverLink}>Forgot your password?</Text> Reset it in your Supabase dashboard
        </Text>
      )}
      <Text style={styles.server}>Server: {serverHost()}  ·  <Text style={styles.serverLink} onPress={() => setChanging(true)}>Change</Text></Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  h1: { fontFamily: F.serif, color: C.text, fontSize: 26, fontWeight: "700", marginBottom: 12 },
  input: { backgroundColor: C.surface, color: C.text, borderRadius: 8, padding: 12, fontSize: 16 },
  error: { color: C.danger },
  notice: { color: C.text, fontSize: 13, lineHeight: 19 },
  server: { color: C.muted, fontSize: 12, marginTop: 8, textAlign: "center" },
  serverLink: { color: C.accent },
});
