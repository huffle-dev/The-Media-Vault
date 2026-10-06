// Full-screen camera that reads a barcode or QR code and hands back what `accept` makes of it.
// Asks for the camera the first time; says so plainly if that is refused.
import { useEffect, useRef, useState } from "react";
import { Linking, Modal, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Text from "./Text";
import AppButton from "./AppButton";
import { C } from "./colors";

// `accept(data)` returns the code to use (or null for one that is not wanted); `what` is
// the thing being scanned, for the hints ("book", "CD or record").
export default function BarcodeScanner({ visible, onClose, accept, onCode, what = "book", types = ["ean13", "ean8", "upc_a"], badHint }) {
  const [permission, requestPermission] = useCameraPermissions();
  const startHint = what === "setup code" ? "Point the camera at the QR code on your computer (Settings → Cloud Sync → Set up my phone)."
    : `Point the camera at the barcode on the ${what === "book" ? "back of the book" : "back of the " + what}.`;
  const [hint, setHint] = useState(startHint);
  const handled = useRef(false);
  // Each time the camera opens it is ready for a fresh scan (the parent closes it after a hit).
  useEffect(() => { if (visible) { handled.current = false; setHint(startHint); } }, [visible]);

  const onScanned = ({ data }) => {
    if (handled.current) return;
    const code = accept(data);
    if (!code) {
      setHint(badHint || (what === "book" ? "That is not a book barcode. Try the one with 978 or 979 on the back." : "That barcode could not be read. Hold steady and try again."));
      return;
    }
    handled.current = true;
    onCode(code);
  };

  const close = () => { handled.current = false; setHint(startHint); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.screen}>
        {!permission ? null : !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.text}>
              {permission.canAskAgain
                ? "Scanning needs the camera. Nothing is recorded or uploaded; the picture is only used to read the barcode."
                : "The camera is turned off for this app. Turn it on in your phone's settings to scan."}
            </Text>
            {permission.canAskAgain
              ? <AppButton title="Allow camera" variant="primary" onPress={requestPermission} style={{ marginTop: 16 }} />
              : <AppButton title="Open settings" variant="primary" onPress={() => Linking.openSettings()} style={{ marginTop: 16 }} />}
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFill} facing="back"
              barcodeScannerSettings={{ barcodeTypes: types }}
              onBarcodeScanned={onScanned}
            />
            <View style={styles.frame} pointerEvents="none" />
            <Text style={styles.hint}>{hint}</Text>
          </>
        )}
        <AppButton title="Cancel" variant="action" onPress={close} style={styles.cancel} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  text: { color: C.text, textAlign: "center", fontSize: 14, lineHeight: 20 },
  frame: { position: "absolute", left: "10%", right: "10%", top: "32%", height: 140, borderWidth: 2, borderColor: C.accent, borderRadius: 10 },
  hint: { position: "absolute", left: 16, right: 16, top: 64, color: "#fff", textAlign: "center", fontSize: 14, textShadowColor: "#000", textShadowRadius: 4 },
  cancel: { position: "absolute", bottom: 32, alignSelf: "center" },
});
