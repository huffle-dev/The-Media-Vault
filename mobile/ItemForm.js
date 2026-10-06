// The item editor — used both to edit an existing item and to add one by hand.
// A Title, the type's own fields (desktop's TYPE_FIELDS: Director/Writer/…
// for a Movie, Author/Publisher/… for a Book, and so on) and a Description.
// Only what changed is handed back when editing; everything filled in is
// handed back when adding. Text inputs, so nothing here needs scrolling
// sideways — the page itself scrolls like the profile does.
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Text from "./Text";
import TextInput from "./TextInput";
import AppButton from "./AppButton";
import { fieldsFor, isBoolField, keyboardFor, parseFieldValue, toInputText } from "./itemFields";
import { buildCustomFieldsJson, customInputText, parseCustomFields } from "./customTypes";
import { getTypeConfig } from "@media-vault/core/tokens/mediaTypes.js";
import { STATUS_WHEEL_ORDER } from "@media-vault/core/tokens/constants.js";
import { statusLabel } from "./format";
import { C, F, statusColor } from "./colors";

// `initial` is the item's current row when editing (null when adding).
// onSubmit(values) may throw; the message is shown under the form.
export default function ItemForm({ mediaType, customType = null, initial, isNew, submitLabel, onSubmit, onCancel, title, coverSection = null }) {
  // A type made on desktop brings its own fields (stored together in custom_fields).
  const type = customType || getTypeConfig(mediaType);
  const fields = customType ? [] : fieldsFor(mediaType);
  const customFields = customType ? customType.fields : [];
  const existingCustom = parseCustomFields(initial?.custom_fields);
  const [customText, setCustomText] = useState(() => Object.fromEntries(customFields.map((f) => [f.key, customInputText(f, existingCustom[f.key])])));
  const [itemTitle, setItemTitle] = useState(initial?.title || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [status, setStatus] = useState(initial?.status || "wishlist");
  const [text, setText] = useState(() => Object.fromEntries(fields.map((f) => [f.key, toInputText(f.key, initial?.[f.key])])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit() {
    setError(null);
    if (!itemTitle.trim()) { setError("Title can't be empty."); return; }
    setSaving(true);
    try {
      const values = { title: itemTitle.trim(), notes: notes.trim() || null };
      for (const f of fields) values[f.key] = parseFieldValue(f.key, text[f.key], f.label);
      if (isNew) values.status = status;
      if (customType) values.custom_fields = buildCustomFieldsJson(initial?.custom_fields, customFields, customText);

      // Editing sends only what changed (so an untouched field can't clobber
      // a newer value someone else saved); adding sends everything filled in.
      const out = {};
      for (const [k, v] of Object.entries(values)) {
        if (isNew ? v !== null : v !== (initial?.[k] ?? null)) out[k] = v;
      }
      await onSubmit(out);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onCancel}><Text style={styles.cancel}>‹ Cancel</Text></Pressable>
        <Text style={styles.h2} numberOfLines={1}>{title}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.typeBadge, { color: type.color }]}>{type.icon} {type.label}</Text>

        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} value={itemTitle} onChangeText={setItemTitle} placeholder="Title" placeholderTextColor="#777" />

        {coverSection}

        {isNew && (
          <>
            <Text style={styles.label}>Status</Text>
            <View style={styles.pillRow}>
              {STATUS_WHEEL_ORDER.map((s) => {
                const color = statusColor(s);
                const on = status === s;
                return (
                  <Pressable key={s} onPress={() => setStatus(s)} style={[styles.pill, on && { borderColor: color, backgroundColor: color + "22" }]}>
                    <Text style={[styles.pillText, on && { color, fontWeight: "700" }]}>{statusLabel(s)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {customFields.map((f) => (
          <View key={f.key}>
            <Text style={styles.label}>{f.label}</Text>
            {f.field_type === "checkbox" ? (
              <View style={styles.pillRow}>
                {[["1", "Yes"], ["0", "No"]].map(([v, label]) => (
                  <Pressable key={v} onPress={() => setCustomText((t) => ({ ...t, [f.key]: v }))} style={[styles.pill, customText[f.key] === v && styles.pillOn]}
                    accessibilityRole="radio" accessibilityState={{ selected: customText[f.key] === v }} accessibilityLabel={`${f.label}: ${label}`}>
                    <Text style={[styles.pillText, customText[f.key] === v && { color: C.accent, fontWeight: "700" }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <TextInput
                style={styles.input} value={customText[f.key]}
                keyboardType={f.field_type === "number" ? "decimal-pad" : f.field_type === "url" ? "url" : "default"}
                autoCapitalize={f.field_type === "url" ? "none" : "sentences"}
                onChangeText={(v) => setCustomText((t) => ({ ...t, [f.key]: v }))}
                placeholder={f.field_type === "date" ? `${f.label} (YYYY-MM-DD)` : f.label} placeholderTextColor="#777"
              />
            )}
          </View>
        ))}

        {fields.map((f) => (
          <View key={f.key}>
            <Text style={styles.label}>{f.label}</Text>
            {isBoolField(f.key) ? (
              <View style={styles.pillRow}>
                {[["1", "Yes"], ["0", "No"]].map(([v, label]) => (
                  <Pressable key={v} onPress={() => setText((t) => ({ ...t, [f.key]: v }))} style={[styles.pill, text[f.key] === v && styles.pillOn]}>
                    <Text style={[styles.pillText, text[f.key] === v && { color: C.accent, fontWeight: "700" }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <TextInput
                style={styles.input} value={text[f.key]} keyboardType={keyboardFor(f.key)}
                autoCapitalize={f.key.endsWith("_url") || f.key === "url" ? "none" : "sentences"}
                onChangeText={(v) => setText((t) => ({ ...t, [f.key]: v }))}
                placeholder={f.label} placeholderTextColor="#777"
              />
            )}
          </View>
        ))}

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]} value={notes} onChangeText={setNotes} multiline
          placeholder="Synopsis or description" placeholderTextColor="#777"
        />

        {error && <Text style={styles.error}>{error}</Text>}
        <AppButton variant="primary" title={saving ? "Saving…" : submitLabel} disabled={saving} onPress={handleSubmit} style={{ marginTop: 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  cancel: { color: C.muted, fontSize: 15 },
  h2: { color: C.text, fontSize: 15, fontWeight: "700", flex: 1, textAlign: "center", marginHorizontal: 8 },
  body: { padding: 16, paddingBottom: 40 },
  typeBadge: { fontSize: 12, fontWeight: "600" },
  label: {
    fontFamily: F.mono, color: C.muted, fontSize: 10, letterSpacing: 0.6,
    textTransform: "uppercase", marginTop: 16, marginBottom: 6,
  },
  input: {
    backgroundColor: C.surface2, color: C.text, borderRadius: 5, padding: 11, fontSize: 14,
    borderWidth: 1, borderColor: C.border,
  },
  multiline: { minHeight: 110, textAlignVertical: "top" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
  pillOn: { borderColor: C.accent, backgroundColor: "#e3aa2622" },
  pillText: { color: C.textSoft, fontSize: 13 },
  error: { color: C.danger, marginTop: 14 },
});
