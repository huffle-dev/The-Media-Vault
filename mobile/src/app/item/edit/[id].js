import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Text from "../../../../Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import Screen from "../../../../Screen";
import ItemForm from "../../../../ItemForm";
import { supabase } from "../../../../supabase";
import { updateItem } from "../../../../itemActions";
import { savedMessage } from "../../../../itemUndo";
import { useLibrary } from "../../../../LibraryContext";
import { C } from "../../../../colors";

export default function EditItemRoute() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { reload, offline, offerUndo, customTypes } = useLibrary();
  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.from("items").select("*").eq("sync_id", id).single().then(({ data, error: e }) => {
      if (e || !data) setError(e ? e.message : "Item not found."); else setItem(data);
    });
  }, [id]);

  return (
    <Screen>
      {offline ? (
        <View style={styles.center}><Text style={styles.error}>You're offline — editing needs a connection.</Text></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.error}>{error}</Text></View>
      ) : !item ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : (
        <ItemForm
          mediaType={item.media_type} customType={item.custom_type_sync_id ? customTypes.find((t) => t.id === item.custom_type_sync_id) : null} initial={item} isNew={false}
          title={`Edit ${item.title}`} submitLabel="Save changes"
          onCancel={() => router.back()}
          onSubmit={async (patch) => {
            if (Object.keys(patch).length) {
              const undo = await updateItem(item, patch);
              offerUndo({ message: savedMessage(item), failed: 0, undo });
              await reload();
            }
            router.back();
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
