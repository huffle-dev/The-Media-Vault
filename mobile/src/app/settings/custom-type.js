// Settings -> Custom media types -> one type: its name, icon, colour and fields.
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Text from "../../../Text";
import TextInput from "../../../TextInput";
import { useLocalSearchParams, useRouter } from "expo-router";
import Screen from "../../../Screen";
import AppButton from "../../../AppButton";
import { supabase } from "../../../supabase";
import { useLibrary } from "../../../LibraryContext";
import { uuidv4 } from "../../../addToLibrary";
import {
  COLOR_CHOICES, FIELD_TYPES, ICON_CHOICES, deleteCustomType, emptyForm, formFromType, keyForNewLabel, newField, saveCustomType, validateTypeForm,
} from "../../../customTypeEdit";
import { C, F } from "../../../colors";

const KIND_LABELS = { text: "Text", number: "Number", url: "Link", checkbox: "Yes/No", date: "Date" };

export default function CustomTypeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { customTypes, items, refreshLists, offline } = useLibrary();
  const existing = id && id !== "new" ? customTypes.find((t) => t.id === id) : null;
  const [form, setForm] = useState(() => (existing ? formFromType(existing) : emptyForm()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const itemCount = useMemo(() => (existing ? (items || []).filter((i) => i.custom_type_sync_id === existing.sync_id).length : 0), [items, existing]);
  const otherLabels = customTypes.filter((t) => !existing || t.id !== existing.id).map((t) => t.label);

  const setField = (index, patch) => setForm((f) => ({ ...f, fields: f.fields.map((x, i) => (i === index ? { ...x, ...patch } : x)) }));
  const move = (index, delta) => setForm((f) => {
    const to = index + delta;
    if (to < 0 || to >= f.fields.length) return f;
    const next = [...f.fields];
    [next[index], next[to]] = [next[to], next[index]];
    return { ...f, fields: next };
  });

  async function save() {
    const problem = validateTypeForm(form, otherLabels);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getUser();
      await saveCustomType(supabase, { userId: data.user.id, form, existing, makeId: uuidv4 });
      await refreshLists();
      router.back();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteCustomType(supabase, existing, itemCount);
      await refreshLists();
      router.back();
    } catch (e) {
      setError(e.message);
      setConfirmDelete(false);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel"><Text style={styles.back}>‹ Cancel</Text></Pressable>
          <Text style={styles.h2}>{existing ? "Edit type" : "New type"}</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={form.label} onChangeText={(label) => setForm((f) => ({ ...f, label }))} placeholder="Vinyl, Wine, Coins…" placeholderTextColor="#777" />

          <Text style={styles.label}>Icon</Text>
          <View style={styles.wrap}>
            {ICON_CHOICES.map((icon) => (
              <Pressable key={icon} onPress={() => setForm((f) => ({ ...f, icon }))} style={[styles.iconCell, form.icon === icon && styles.on]} accessibilityRole="radio" accessibilityState={{ selected: form.icon === icon }} accessibilityLabel={`Icon ${icon}`}>
                <Text style={{ fontSize: 22 }}>{icon}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={[styles.input, { marginTop: 8 }]} value={form.icon} onChangeText={(icon) => setForm((f) => ({ ...f, icon: icon.slice(0, 4) }))} placeholder="…or type any emoji" placeholderTextColor="#777" />

          <Text style={styles.label}>Colour</Text>
          <View style={styles.wrap}>
            {COLOR_CHOICES.map((color) => (
              <Pressable key={color} onPress={() => setForm((f) => ({ ...f, color }))} style={[styles.swatch, { backgroundColor: color }, form.color === color && styles.swatchOn]} accessibilityRole="radio" accessibilityState={{ selected: form.color === color }} accessibilityLabel={`Colour ${color}`} />
            ))}
          </View>

          <Text style={styles.label}>Fields</Text>
          <Text style={styles.hint}>Extra things to record for this type. Changing a field's name later keeps what's already saved in it.</Text>
          {form.fields.map((f, i) => (
            <View key={f.sync_id || `new-${i}`} style={styles.fieldCard}>
              <TextInput
                style={styles.input} value={f.label} placeholder="Field name" placeholderTextColor="#777"
                onChangeText={(label) => setField(i, f.sync_id ? { label } : { label, key: keyForNewLabel(label, form.fields.filter((_, j) => j !== i).map((x) => x.key)) })}
              />
              <View style={styles.wrap}>
                {FIELD_TYPES.map((kind) => (
                  <Pressable key={kind} onPress={() => setField(i, { field_type: kind })} style={[styles.pill, f.field_type === kind && styles.on]} accessibilityRole="radio" accessibilityState={{ selected: f.field_type === kind }}>
                    <Text style={[styles.pillText, f.field_type === kind && { color: C.accent }]}>{KIND_LABELS[kind]}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.fieldActions}>
                <Pressable onPress={() => move(i, -1)} accessibilityRole="button" accessibilityLabel="Move up"><Text style={styles.small}>↑ Up</Text></Pressable>
                <Pressable onPress={() => move(i, 1)} accessibilityRole="button" accessibilityLabel="Move down"><Text style={styles.small}>↓ Down</Text></Pressable>
                <Pressable onPress={() => setForm((x) => ({ ...x, fields: x.fields.filter((_, j) => j !== i) }))} accessibilityRole="button" accessibilityLabel="Remove field"><Text style={[styles.small, { color: C.danger }]}>Remove</Text></Pressable>
              </View>
            </View>
          ))}
          <AppButton title="+ Add a field" variant="action" onPress={() => setForm((f) => ({ ...f, fields: [...f.fields, newField(f.fields.map((x) => x.key))] }))} style={{ alignSelf: "flex-start", marginTop: 8 }} />

          {error && <Text style={styles.error}>{error}</Text>}
          {offline && <Text style={styles.error}>You're offline — saving needs a connection.</Text>}
          <AppButton title={busy ? "Saving…" : "Save type"} variant="primary" disabled={busy || offline} onPress={save} style={{ marginTop: 20 }} />

          {existing && (
            confirmDelete ? (
              <View style={{ marginTop: 16, gap: 8 }}>
                <Text style={styles.hint}>{itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"} still use this type, so it can't be deleted yet.` : "Delete this type? It disappears here and on desktop."}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <AppButton title="Delete" variant="primary" color={C.danger} disabled={busy} onPress={remove} style={{ backgroundColor: C.danger }} />
                  <AppButton title="Keep it" variant="action" onPress={() => setConfirmDelete(false)} />
                </View>
              </View>
            ) : (
              <AppButton title="Delete this type" variant="ghost" color={C.danger} onPress={() => setConfirmDelete(true)} style={{ marginTop: 16 }} />
            )
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  back: { color: C.muted, fontSize: 15 },
  h2: { color: C.text, fontSize: 15, fontWeight: "700" },
  body: { padding: 16, paddingBottom: 48 },
  label: { fontFamily: F.mono, color: C.muted, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 16, marginBottom: 6 },
  hint: { color: C.muted, fontSize: 12, lineHeight: 17, marginBottom: 6 },
  input: { backgroundColor: C.surface2, color: C.text, borderRadius: 5, padding: 11, fontSize: 14, borderWidth: 1, borderColor: C.border },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  iconCell: { width: 44, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
  on: { borderColor: C.accent, backgroundColor: "#e3aa2622" },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: "transparent" },
  swatchOn: { borderColor: "#fff" },
  fieldCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10, gap: 8, marginTop: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
  pillText: { color: C.muted, fontSize: 12 },
  fieldActions: { flexDirection: "row", gap: 18 },
  small: { color: C.muted, fontSize: 12 },
  error: { color: C.danger, marginTop: 12 },
});
