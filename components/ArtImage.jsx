// A cover image that fills its frame. `wide` (16:9 art such as a YouTube
// thumbnail in a square/portrait frame) is shown whole over a blurred, dimmed
// copy of itself rather than cropped to the middle — same look as the square
// art letterbox in the mixed "All" view.
export default function ArtImage({ src, alt = "", wide = false, onError, style }) {
  if (!wide) {
    return <img src={src} alt={alt} decoding="async" onError={onError} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }} />;
  }
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <img src={src} alt="" aria-hidden="true" decoding="async"
        style={{ position: "absolute", inset: -10, width: "calc(100% + 20px)", height: "calc(100% + 20px)", objectFit: "cover", filter: "blur(16px) brightness(0.5)" }} />
      <img src={src} alt={alt} decoding="async" onError={onError}
        style={{ position: "relative", width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block", boxShadow: "0 6px 18px rgba(0,0,0,0.55)" }} />
    </div>
  );
}
