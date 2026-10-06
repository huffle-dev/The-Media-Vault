import { useLocalSearchParams, useRouter } from "expo-router";
import AddItemScreen from "../../../AddItemScreen";
import Screen from "../../../Screen";
import { useLibrary } from "../../../LibraryContext";

export default function AddSearchRoute() {
  const { type, q } = useLocalSearchParams();
  const router = useRouter();
  const { reload, offline } = useLibrary();
  return (
    <Screen>
      <AddItemScreen
        tabKey={decodeURIComponent(String(type))}
        initialQuery={q ? String(q) : undefined}
        readOnly={offline}
        onClose={() => router.back()}
        onManual={() => router.push(`/add/manual/${encodeURIComponent(decodeURIComponent(String(type)))}`)}
        // A saved item pops the whole add flow (picker + search) back to
        // the library, then refreshes it.
        onAdded={() => { router.dismissTo("/"); reload(); }}
      />
    </Screen>
  );
}
