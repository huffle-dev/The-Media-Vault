// GOG's own sign-in page in a window. The password is typed on GOG's page, never into this
// app; when GOG redirects with a one-time code, the window closes and hands the code back.
// Navigation is limited to GOG's own sites.
import { Modal, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import Text from "./Text";
import AppButton from "./AppButton";
import { GOG_AUTH_URL } from "@media-vault/core/gogLibrary.js";
import { extractGogCode } from "@media-vault/core/authValidation.js";
import { C } from "./colors";

const ALLOWED_HOSTS = ["auth.gog.com", "login.gog.com", "www.gog.com", "embed.gog.com", "gog.com"];

export const isGogHost = (url) => {
  try { return ALLOWED_HOSTS.includes(new URL(url).hostname); } catch { return false; }
};

export default function GogLogin({ visible, onCode, onClose }) {
  // Look at every address the page is about to load: a code means done; anything off GOG is refused.
  const check = ({ url }) => {
    const code = extractGogCode(url);
    if (code) { onCode(code); return false; }
    return isGogHost(url) || url.startsWith("about:");
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.bar}>
          <Text style={styles.title}>Sign in with GOG</Text>
          <AppButton title="Cancel" variant="action" onPress={onClose} />
        </View>
        {visible && (
          <WebView
            source={{ uri: GOG_AUTH_URL }} style={{ flex: 1 }}
            onShouldStartLoadWithRequest={check}
            onNavigationStateChange={(nav) => { const code = extractGogCode(nav.url); if (code) onCode(code); }}
            setSupportMultipleWindows={false} thirdPartyCookiesEnabled={false}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  bar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  title: { color: C.text, fontSize: 15, fontWeight: "700" },
});
