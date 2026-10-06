// Root layout: auth gate + shared library state. Signed-out users only ever
// see the login route; signed-in users get the tab bar and the stack screens
// above it (item profile, add). Stack.Protected is how Expo Router gates
// routes on a condition, so navigation itself can't reach a screen the user
// isn't allowed to see.
import { installDiagnostics } from "../../diagInstall";
import { diag, fatalAckedAt } from "../../diag";
import { unseenCrash } from "@media-vault/core/phoneLog.js";
import CrashRecovery from "../../CrashRecovery";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { DMMono_400Regular, DMMono_500Medium } from "@expo-google-fonts/dm-mono";
import { DMSerifDisplay_400Regular } from "@expo-google-fonts/dm-serif-display";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { supabase, useServerConfig } from "../../supabase";
import { LibraryProvider } from "../../LibraryContext";
import { ApiKeysProvider } from "../../useApiKeys";
import { ShareIntentProvider } from "expo-share-intent";
import ShareHandler from "../../ShareHandler";
import WelcomeSheet from "../../WelcomeSheet";
import BggHost from "../../BggHost";
import { C } from "../../colors";

// Before anything else runs: send uncaught errors, console errors and unhandled failures to the problems log.
installDiagnostics();

export default function RootLayout() {
  // If the last run ended in a crash the person hasn't seen, show the recovery screen first (it uses none of the app).
  const [crash, setCrash] = useState(() => unseenCrash(diag.entries(), fatalAckedAt()));
  const [session, setSession] = useState(undefined); // undefined = still checking
  // The desktop's three typefaces — every screen assumes they're loaded.
  const [fontsLoaded] = useFonts({
    DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold,
    DMMono_400Regular, DMMono_500Medium, DMSerifDisplay_400Regular,
  });

  // Saving a different server swaps the client behind `supabase`, so the
  // session check and listener are redone for the new one. No server yet: nobody
  // can be signed in, so show the login (which asks for one).
  const server = useServerConfig();
  useEffect(() => {
    if (!server) { setSession(null); return undefined; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [server]);

  if (crash) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SafeAreaView edges={["top"]} style={styles.root}><CrashRecovery crash={crash} onContinue={() => setCrash(null)} /></SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <ShareIntentProvider>
    <SafeAreaProvider>
      <StatusBar style="light" />
      {/* Top inset only — the tab bar and Screen wrapper handle the bottom. */}
      <SafeAreaView edges={["top"]} style={styles.root}>
        {session === undefined || !fontsLoaded ? (
          <ActivityIndicator style={styles.spinner} />
        ) : (
          <ApiKeysProvider enabled={!!session}>
          <LibraryProvider enabled={!!session}>
            {session && <ShareHandler />}
            {session && <WelcomeSheet />}
            {session && <BggHost />}
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
              <Stack.Protected guard={!!session}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="item/[id]" />
                <Stack.Screen name="item/edit/[id]" />
                <Stack.Screen name="add/index" />
                <Stack.Screen name="add/[type]" />
                <Stack.Screen name="add/website" />
                <Stack.Screen name="add/photo" />
                <Stack.Screen name="add/manual/[type]" />
                <Stack.Screen name="settings/keys" />
                <Stack.Screen name="settings/dismissed" />
                <Stack.Screen name="settings/custom-types" />
                <Stack.Screen name="settings/custom-type" />
                <Stack.Screen name="settings/game-libraries" />
                <Stack.Screen name="settings/diagnostics" />
                <Stack.Screen name="settings/about" />
                <Stack.Screen name="settings/maintenance" />
                <Stack.Screen name="settings/licences" />
                <Stack.Screen name="settings/privacy" />
              </Stack.Protected>
              <Stack.Protected guard={!session}>
                <Stack.Screen name="login" />
              </Stack.Protected>
            </Stack>
          </LibraryProvider>
          </ApiKeysProvider>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
    </ShareIntentProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  spinner: { marginTop: 48 },
});
