// TextInput in the desktop's typeface — see Text.js.
import { TextInput as RNTextInput } from "react-native";
import { fontFor } from "./Text";

export default function TextInput({ style, ...props }) {
  return <RNTextInput {...props} style={[style, { fontFamily: fontFor(style), fontWeight: "normal" }]} />;
}
