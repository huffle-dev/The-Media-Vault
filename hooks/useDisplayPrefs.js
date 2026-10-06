// Library grid/list display preferences — tile/list view mode, tile size/
// gap/overlay, list row size. Passed down as props to LibraryGrid/TopBar.
// `view` itself is never persisted; it always starts on "tile".
import { useState, useEffect } from "react";

export function useDisplayPrefs() {
  const [view, setView]                   = useState("tile"); // tile | list
  const [tileSize, setTileSize]           = useState("medium"); // small | medium | large
  const [tileGap,  setTileGap]            = useState("small");  // small | medium | large
  const [tileOverlay, setTileOverlay]     = useState("full");   // full | no-icon | none
  const [listRowSize, setListRowSize]     = useState("medium"); // small | medium | large
  const [scrollSpeed, setScrollSpeed]     = useState("medium"); // slow | medium | fast | veryfast

  useEffect(() => {
    window.vault.settings.get("tile_size").then(v => {
      if (v) setTileSize(v);
    });
    window.vault.settings.get("tile_gap").then(v => {
      if (v) setTileGap(v);
    });
    window.vault.settings.get("tile_overlay").then(v => {
      if (v) setTileOverlay(v);
    });
    window.vault.settings.get("list_row_size").then(v => {
      if (v) setListRowSize(v);
    });
    window.vault.settings.get("scroll_speed").then(v => {
      if (v) setScrollSpeed(v);
    });
  }, []);

  const handleTileSizeChange = (size) => {
    setTileSize(size);
    window.vault.settings.set("tile_size", size);
  };

  const handleTileGapChange = (gap) => {
    setTileGap(gap);
    window.vault.settings.set("tile_gap", gap);
  };

  const handleTileOverlayChange = (overlay) => {
    setTileOverlay(overlay);
    window.vault.settings.set("tile_overlay", overlay);
  };

  const handleListRowSizeChange = (size) => {
    setListRowSize(size);
    window.vault.settings.set("list_row_size", size);
  };

  const handleScrollSpeedChange = (speed) => {
    setScrollSpeed(speed);
    window.vault.settings.set("scroll_speed", speed);
  };

  return {
    view, setView,
    tileSize, tileGap, tileOverlay, listRowSize, scrollSpeed,
    handleTileSizeChange, handleTileGapChange, handleTileOverlayChange, handleListRowSizeChange, handleScrollSpeedChange,
  };
}
