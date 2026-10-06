// Custom media type customization — the user's own custom types, which
// built-in tabs are hidden from the tab bar, and the tab bar's drag-to-
// reorder state. Passed down as props to TopBar/StatsView/HistoryView/
// SettingsModal/CustomTypeBuilder.
//
// Takes activeTab/setActiveTab as parameters rather than owning them: when
// the active tab gets hidden or its custom type deleted, this resets the
// tab bar back to "All" instead of pointing at a tab that's no longer there.
import { useState, useEffect, useMemo } from "react";
import { withCustomTypeTabs, typeTabKey } from "../tokens.js";

export function useCustomTypeSettings(activeTab, setActiveTab) {
  const [customTypes, setCustomTypes] = useState([]);

  // TYPE_TABS extended with one tab per custom type, so custom types flow
  // through the same tab-matching mechanism as built-in ones.
  const allTypeTabs = useMemo(() => withCustomTypeTabs(customTypes), [customTypes]);

  const loadCustomTypes = () => {
    window.vault.customTypes.getAll().then(setCustomTypes);
  };

  // Media types hidden from the tab bar (both the main row and "...More"),
  // by typeTabKey(tab) — persisted so the choice survives a restart.
  const [hiddenTypeKeys, setHiddenTypeKeys] = useState([]);

  const loadHiddenTypes = () => {
    window.vault.settings.get("hidden_media_types").then(v => {
      if (v) setHiddenTypeKeys(JSON.parse(v));
    });
  };

  const handleToggleTypeHidden = (key) => {
    const isHiding = !hiddenTypeKeys.includes(key);
    const next = isHiding ? [...hiddenTypeKeys, key] : hiddenTypeKeys.filter(k => k !== key);
    setHiddenTypeKeys(next);
    window.vault.settings.set("hidden_media_types", JSON.stringify(next));
    if (isHiding) {
      const tab = allTypeTabs.find(t => typeTabKey(t) === key);
      if (tab && activeTab === tab.label) setActiveTab("All");
    }
  };

  const handleDeleteCustomType = async (id) => {
    const res = await window.vault.customTypes.delete(id);
    if (res.success) {
      loadCustomTypes();
      const tab = allTypeTabs.find(t => t.customTypeId === id);
      if (tab && activeTab === tab.label) setActiveTab("All");
    }
    return res;
  };

  // User-draggable tab order (by typeTabKey) — the first 7 visible types
  // show inline in the main bar, the rest fall under "...More". Types not
  // yet in this list sort to the end rather than jumping to the front.
  const [typeOrder, setTypeOrder] = useState([]);

  const loadTypeOrder = () => {
    window.vault.settings.get("media_type_order").then(v => {
      if (v) setTypeOrder(JSON.parse(v));
    });
  };

  const handleReorderTypes = (next) => {
    setTypeOrder(next);
    window.vault.settings.set("media_type_order", JSON.stringify(next));
  };

  useEffect(() => {
    loadCustomTypes();
    loadHiddenTypes();
    loadTypeOrder();
  }, []);

  return {
    customTypes, allTypeTabs, loadCustomTypes,
    hiddenTypeKeys, handleToggleTypeHidden,
    handleDeleteCustomType,
    typeOrder, handleReorderTypes,
  };
}
