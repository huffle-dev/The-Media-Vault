// Library filter/sort/search state — activeTab (media-type tab), quick
// filter, genre, sort, search, owned/rated toggles, and the "Extended
// filters" row (age rating, platform, OS/console, personal/critic rating,
// watch-provider filter, hidden-items filter).
//
// Read directly by App.jsx's filteredItems useMemo and the module-level
// buildBaseFilter/applyQuickFilter/applyOwnedRatedFilter/applyWatchFilter
// helpers, plus passed down as props to TopBar/FilterBar.
//
// handleWatchFilterChange stays in App.jsx: it needs itemsWithLists and
// allTypeTabs to run its own live provider-availability scan, so it's a
// genuine cross-cluster action rather than pure filter state.
//
// Takes setListFilter as a parameter since resetting filters also clears
// the list filter, owned by the lists hook.
import { useState } from "react";

export function useLibraryFilters(setListFilter) {
  const [activeTab, setActiveTab]         = useState("All");
  const [quickFilter, setQuickFilter]     = useState("All");
  const [genre, setGenre]                 = useState("All Genres");
  const [sort, setSort]                   = useState("Recently Added");
  const [search, setSearch]               = useState("");
  const [ownedFilter, setOwnedFilter]     = useState("all"); // all | owned | not-owned
  const [ratedFilter, setRatedFilter]     = useState("all"); // all | rated | not-rated

  const [ageRating, setAgeRating]         = useState("All Age Ratings");
  const [platformFilter, setPlatformFilter] = useState("All Platforms");
  const [osConsole, setOsConsole]         = useState("All OS & Consoles");
  const [personalRating, setPersonalRating] = useState("Any Rating");
  const [criticRating, setCriticRating]     = useState("Any Critic Rating");
  const [watchFilter, setWatchFilter]     = useState(""); // "" = no filter
  // Unlike ownedFilter/ratedFilter's "all" default, "visible" here actively
  // excludes hidden items — the point of hiding one is that it stays out of
  // the way until deliberately brought back, same as Steam's Hidden category.
  const [hiddenFilter, setHiddenFilter]   = useState("visible"); // visible | hidden | all
  // Web Video tab only: all | channel | video | playlist
  const [webKindFilter, setWebKindFilter]   = useState("all");

  // Resets everything that narrows which items are visible — not sort or
  // view/tile/list display prefs, since those don't hide anything.
  const handleResetFilters = () => {
    setActiveTab("All");
    setQuickFilter("All");
    setGenre("All Genres");
    setAgeRating("All Age Ratings");
    setPlatformFilter("All Platforms");
    setOsConsole("All OS & Consoles");
    setListFilter("");
    setHiddenFilter("visible");
    setWebKindFilter("all");
    setPersonalRating("Any Rating");
    setCriticRating("Any Critic Rating");
    setWatchFilter("");
    setOwnedFilter("all");
    setRatedFilter("all");
    setSearch("");
  };

  return {
    activeTab, setActiveTab,
    quickFilter, setQuickFilter,
    genre, setGenre,
    sort, setSort,
    search, setSearch,
    ownedFilter, setOwnedFilter,
    ratedFilter, setRatedFilter,
    ageRating, setAgeRating,
    platformFilter, setPlatformFilter,
    osConsole, setOsConsole,
    personalRating, setPersonalRating,
    criticRating, setCriticRating,
    watchFilter, setWatchFilter,
    hiddenFilter, setHiddenFilter,
    webKindFilter, setWebKindFilter,
    handleResetFilters,
  };
}
