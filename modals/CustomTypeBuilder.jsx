import { useState } from "react";
import { T, cleanIpcError } from "../tokens.js";
import { ColorSwatchPicker, IconInput } from "../components/PickerComponents.jsx";
import { uniqueKey } from "@media-vault/core/customTypeKeys.js";

const ICON_CHOICES = ["💿", "🍷", "🧸", "⛏️", "💎", "🕹️", "🖼️", "🧩", "🪙", "🧵", "📻", "🔭"];
const COLOR_CHOICES = ["#d4a017", "#60a5fa", "#f87171", "#4ade80", "#c084fc", "#fb923c", "#4be8c8", "#f472b6"];
const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "url", label: "URL" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
];

const Label = ({ children, style }) => (
  <div style={{
    fontSize: 9, color: T.muted, marginBottom: 8,
    fontFamily: T.fontMono, letterSpacing: "0.08em",
    textTransform: "uppercase", ...style,
  }}>{children}</div>
);

const emptyForm = () => ({ id: null, label: "", icon: ICON_CHOICES[0], color: COLOR_CHOICES[0], fields: [] });

export default function CustomTypeBuilder({ customTypes, items, onClose, onChanged }) {
  const [form, setForm] = useState(emptyForm());
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isEditing = form.id != null;

  const itemCount = (typeId) => (items || []).filter(i => i.custom_type_id === typeId).length;

  const startEdit = (type) => {
    setForm({
      id: type.id, label: type.label, icon: type.icon, color: type.color,
      fields: type.fields.map(f => ({ ...f })),
    });
    setError("");
  };

  const resetForm = () => { setForm(emptyForm()); setError(""); };

  const updateField = (index, patch) => {
    setForm(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => i === index ? { ...f, ...patch } : f),
    }));
  };

  const addField = () => {
    setForm(prev => ({
      ...prev,
      fields: [...prev.fields, { key: uniqueKey("Field", prev.fields.map(f => f.key)), label: "", field_type: "text" }],
    }));
  };

  const removeField = (index) => {
    setForm(prev => ({ ...prev, fields: prev.fields.filter((_, i) => i !== index) }));
  };

  const moveField = (index, delta) => {
    setForm(prev => {
      const next = [...prev.fields];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, fields: next };
    });
  };

  const handleFieldLabelChange = (index, label) => {
    setForm(prev => {
      const otherKeys = prev.fields.filter((_, i) => i !== index).map(f => f.key);
      return {
        ...prev,
        fields: prev.fields.map((f, i) => i === index ? { ...f, label, key: uniqueKey(label, otherKeys) } : f),
      };
    });
  };

  const handleSave = async () => {
    setError("");
    const label = form.label.trim();
    if (!label) { setError("Type name is required."); return; }
    const fields = form.fields
      .map(f => ({ key: f.key, label: f.label.trim(), field_type: f.field_type }))
      .filter(f => f.label);

    setSaving(true);
    try {
      if (isEditing) {
        await window.vault.customTypes.update(form.id, { label, icon: form.icon, color: form.color, fields });
      } else {
        await window.vault.customTypes.add({ label, icon: form.icon, color: form.color, fields });
      }
      resetForm();
      onChanged();
    } catch (e) {
      setError(cleanIpcError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const res = await window.vault.customTypes.delete(id);
    if (res.success) {
      setDeleteConfirmId(null);
      if (form.id === id) resetForm();
      onChanged();
    } else {
      setError(res.error);
      setDeleteConfirmId(null);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(5,5,10,0.88)",
      backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, width: 480, maxHeight: "88vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px", borderBottom: `1px solid ${T.border}`,
          flexShrink: 0,
        }}>
          <div style={{ fontFamily: T.fontSerif, fontSize: 17, color: T.text }}>
            Custom Media Types
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 18, lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "18px 20px", flex: 1 }}>

          {/* Existing types */}
          {customTypes.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <Label>Your Custom Types</Label>
              {customTypes.map(type => (
                <div key={type.id}>
                  {deleteConfirmId === type.id ? (
                    <div style={{ padding: "10px 0 4px" }}>
                      <div style={{ fontSize: 11.5, color: T.text, marginBottom: 9, lineHeight: 1.5 }}>
                        Delete "{type.label}"? {itemCount(type.id) > 0
                          ? `${itemCount(type.id)} item${itemCount(type.id) === 1 ? "" : "s"} still use this type — delete or re-type ${itemCount(type.id) === 1 ? "it" : "them"} first.`
                          : "This can't be undone."}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span
                          onClick={() => handleDelete(type.id)}
                          style={{ flex: 1, textAlign: "center", padding: "6px 0", border: "1px solid #e84b6e", color: "#e84b6e", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: T.fontSans }}
                        >Delete</span>
                        <span
                          onClick={() => setDeleteConfirmId(null)}
                          style={{ flex: 1, textAlign: "center", padding: "6px 0", border: `1px solid ${T.border}`, color: T.text, borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: T.fontSans }}
                        >Cancel</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                        background: type.color + "22", border: `1px solid ${type.color}44`,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                      }}>{type.icon}</span>
                      <span
                        onClick={() => startEdit(type)}
                        style={{ flex: 1, color: T.text, fontSize: 13, cursor: "pointer" }}
                      >{type.label}</span>
                      <span style={{ color: T.muted, fontFamily: T.fontMono, fontSize: 10.5 }}>
                        {itemCount(type.id)} item{itemCount(type.id) === 1 ? "" : "s"}
                      </span>
                      <span
                        onClick={() => setDeleteConfirmId(type.id)}
                        title={`Delete this custom type`}
                        role="button"
                        aria-label={`Delete ${type.label} custom type`}
                        style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, cursor: "pointer", borderRadius: 5 }}
                      >🗑</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Create / edit form */}
          <Label style={{ borderTop: customTypes.length > 0 ? `1px solid ${T.border}` : "none", paddingTop: customTypes.length > 0 ? 16 : 0 }}>
            {isEditing ? `Editing "${form.label || ""}"` : "New Custom Type"}
          </Label>

          <div style={{ marginBottom: 16 }}>
            <Label>Type Name</Label>
            <input
              type="text"
              value={form.label}
              onChange={e => setForm(prev => ({ ...prev, label: e.target.value }))}
              placeholder="e.g. Perfume, Miniatures, Wine"
              style={{
                width: "100%", boxSizing: "border-box", background: T.surface2,
                border: `1px solid ${T.border}`, borderRadius: 6, padding: "9px 12px",
                color: T.text, fontFamily: T.fontSans, fontSize: 13, outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <Label>Icon</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ICON_CHOICES.map(icon => (
                <span
                  key={icon}
                  onClick={() => setForm(prev => ({ ...prev, icon }))}
                  style={{
                    width: 34, height: 34, borderRadius: 6, background: T.surface2,
                    border: `1px solid ${form.icon === icon ? T.accent : T.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 17, cursor: "pointer",
                  }}
                >{icon}</span>
              ))}
              <IconInput
                value={form.icon}
                onChange={icon => setForm(prev => ({ ...prev, icon }))}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <Label>Colour</Label>
            <ColorSwatchPicker
              current={form.color}
              swatches={COLOR_CHOICES}
              onPick={color => setForm(prev => ({ ...prev, color }))}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <Label>Fields</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {form.fields.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <span
                      onClick={() => moveField(i, -1)}
                      style={{ fontSize: 9, color: i === 0 ? T.border : T.muted, cursor: i === 0 ? "default" : "pointer", lineHeight: 1 }}
                    >▲</span>
                    <span
                      onClick={() => moveField(i, 1)}
                      style={{ fontSize: 9, color: i === form.fields.length - 1 ? T.border : T.muted, cursor: i === form.fields.length - 1 ? "default" : "pointer", lineHeight: 1 }}
                    >▼</span>
                  </div>
                  <input
                    type="text"
                    value={f.label}
                    onChange={e => handleFieldLabelChange(i, e.target.value)}
                    placeholder="Field name"
                    style={{
                      flex: 1, boxSizing: "border-box", background: T.surface2,
                      border: `1px solid ${T.border}`, borderRadius: 6, padding: "7px 10px",
                      color: T.text, fontFamily: T.fontSans, fontSize: 12.5, outline: "none",
                    }}
                  />
                  <select
                    value={f.field_type}
                    onChange={e => updateField(i, { field_type: e.target.value })}
                    style={{
                      width: 110, background: T.surface2, border: `1px solid ${T.border}`,
                      borderRadius: 6, padding: "7px 8px", color: T.text,
                      fontFamily: T.fontSans, fontSize: 12.5, outline: "none",
                    }}
                  >
                    {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                  </select>
                  <span
                    onClick={() => removeField(i)}
                    style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, cursor: "pointer" }}
                  >✕</span>
                </div>
              ))}
            </div>
            <span
              onClick={addField}
              style={{
                cursor: "pointer", display: "inline-flex", marginTop: 10, fontSize: 11,
                color: T.accent, fontFamily: T.fontSans,
              }}
            >+ Add Field</span>
          </div>

          <div style={{ fontSize: 10.5, color: T.muted, fontFamily: T.fontMono, margin: "14px 0 8px", lineHeight: 1.5 }}>
            Custom types are manual entry only — there's no metadata source to auto-fill from, since the type doesn't exist yet.
          </div>

          {error && (
            <div style={{ fontSize: 11, color: "#e84b6e", marginBottom: 8, fontFamily: T.fontMono, lineHeight: 1.4 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: 8, padding: "14px 20px",
          borderTop: `1px solid ${T.border}`, flexShrink: 0,
        }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, padding: "9px", background: T.accent, color: T.bg,
              border: "none", borderRadius: 5, fontSize: 13, fontWeight: 700,
              cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
              fontFamily: T.fontSans,
            }}
          >{isEditing ? "Save Changes" : "Create Type"}</button>
          {isEditing && (
            <button
              onClick={resetForm}
              style={{
                padding: "9px 18px", background: "transparent",
                border: `1px solid ${T.border}`, borderRadius: 5,
                color: T.muted, fontSize: 13, cursor: "pointer",
                fontFamily: T.fontSans,
              }}
            >New Instead</button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: "9px 18px", background: "transparent",
              border: `1px solid ${T.border}`, borderRadius: 5,
              color: T.muted, fontSize: 13, cursor: "pointer",
              fontFamily: T.fontSans,
            }}
          >Close</button>
        </div>
      </div>
    </div>
  );
}
