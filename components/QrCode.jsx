import { useMemo } from "react";
import qrcode from "qrcode-generator";

// A QR code for `text`, drawn as SVG on a white card (readers need dark-on-light even in the dark theme).
// The SVG comes from the library's own output for text we give it, never from user markup.
export default function QrCode({ text, size = 200, label = "QR code" }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ scalable: true, margin: 0 });
  }, [text]);
  return (
    <div
      role="img" aria-label={label}
      style={{ width: size, height: size, padding: 12, boxSizing: "content-box", background: "#fff", borderRadius: 8, display: "inline-block" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
