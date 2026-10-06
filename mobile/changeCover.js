// Picking a new cover from this phone for an item: choose and crop a picture, shrink it, upload it to your
// own server and point the item at it (see coverUpload.js). Used by the Edit screen. Desktop and other devices
// get the new cover through sync.
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { supabase } from "./supabase";
import { coverAspectFor, replaceCover } from "./coverUpload";
import { isSquareArt, isWideArt } from "@media-vault/core/tokens/itemHelpers.js";

// Resolves to { url, undo }, or null if the person backed out of the picker. Throws if the upload or the update fails.
export async function pickAndUploadCover(item) {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"], allowsEditing: true, quality: 1,
    aspect: coverAspectFor({ squareArt: isSquareArt(item.media_type), wideArt: isWideArt(item) }),
  });
  if (picked.canceled || !picked.assets || !picked.assets[0]) return null;
  const asset = picked.assets[0];
  const edit = ImageManipulator.manipulate(asset.uri);
  edit.resize({ width: Math.min(600, asset.width || 600) });
  const image = await edit.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const bytes = await new File(saved.uri).arrayBuffer();
  const { data } = await supabase.auth.getUser();
  return replaceCover({ client: supabase, userId: data.user.id, item, bytes });
}
