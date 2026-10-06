import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import ItemProfileScreen from "../../../ItemProfileScreen";
import Screen from "../../../Screen";
import { useLibrary } from "../../../LibraryContext";

export default function ItemRoute() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { patchItem, offline, reload } = useLibrary();
  // Bumped each time this screen regains focus (e.g. back from the editor),
  // so the profile re-reads the item instead of showing a stale copy.
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(useCallback(() => { setFocusTick((t) => t + 1); }, []));
  return (
    <Screen>
      <ItemProfileScreen
        syncId={id} onClose={() => router.back()} onSaved={patchItem} readOnly={offline}
        onOpenItem={(syncId) => router.push(`/item/${syncId}`)} onAdded={reload}
        onEdit={() => router.push(`/item/edit/${id}`)}
        onDeleted={() => { reload(); router.back(); }}
        reloadKey={focusTick}
      />
    </Screen>
  );
}
