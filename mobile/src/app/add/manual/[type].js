import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import Text from "../../../../Text";
import Screen from "../../../../Screen";
import ItemForm from "../../../../ItemForm";
import { addItemToLibrary } from "../../../../addToLibrary";
import { useLibrary } from "../../../../LibraryContext";
import { getTypeConfig } from "@media-vault/core/tokens/mediaTypes.js";
import { C } from "../../../../colors";

export default function AddManualRoute() {
  const { type } = useLocalSearchParams();
  const router = useRouter();
  const { reload, offline, customTypes } = useLibrary();
  const rawType = decodeURIComponent(String(type));
  // "custom:<id>" = a type made on desktop; its items are stored as media_type "Custom".
  const customType = rawType.startsWith("custom:") ? customTypes.find((t) => t.id === rawType.slice(7)) : null;
  const mediaType = rawType.startsWith("custom:") ? "Custom" : rawType;

  return (
    <Screen>
      {offline ? (
        <View style={styles.center}><Text style={styles.error}>You're offline — adding needs a connection.</Text></View>
      ) : (
        <ItemForm
          mediaType={mediaType} customType={customType} initial={null} isNew
          title={`Add ${customType ? customType.label : getTypeConfig(mediaType).label}`} submitLabel="Add to library"
          onCancel={() => router.back()}
          onSubmit={async (values) => {
            const row = customType ? { ...values, custom_type_sync_id: customType.sync_id } : values;
            await addItemToLibrary({ mediaType, title: values.title, platformId: null, details: null, quickRow: row });
            await reload();
            router.dismissTo("/");
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: { color: C.danger, textAlign: "center" },
});
