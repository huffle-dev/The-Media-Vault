// The library the online demo opens with: real works that are free to show — public-domain films and
// books, Creative Commons films and albums, and free open-source games — with their real cover pictures,
// fetched from Wikimedia Commons by scripts/fetch-demo-art.js. Who made each picture and under what
// licence is in credits.json and on the demo's Credits page. The statuses, ratings and notes are invented
// (they are what a person's own library would add); none of this is anyone's real library.
import credits from "./credits.json";

const FREE_GAME = "Free and open-source software.";

// [slug (picture), title, media_type, status, rating (1-21 or null), creator, genre, year, extra fields]
const ROWS = [
  // Movies
  ["metropolis", "Metropolis", "Movie", "consumed", 19, "Fritz Lang", "Sci-Fi", 1927, { runtime: 153, cast_list: "Brigitte Helm, Alfred Abel, Gustav Fröhlich", notes: "Still astonishing. The robot transformation scene holds up a century later." }],
  ["night-of-the-living-dead", "Night of the Living Dead", "Movie", "consumed", 16, "George A. Romero", "Horror", 1968, { runtime: 96, cast_list: "Duane Jones, Judith O'Dea" }],
  ["big-buck-bunny", "Big Buck Bunny", "Movie", "consumed", 14, "Sacha Goedegebure", "Animation", 2008, { runtime: 10, notes: "Blender Foundation open movie (CC BY)." }],
  ["sintel", "Sintel", "Movie", "consumed", 17, "Colin Levy", "Fantasy", 2010, { runtime: 15, notes: "Blender Foundation open movie (CC BY)." }],
  ["tears-of-steel", "Tears of Steel", "Movie", "in-progress", null, "Ian Hubert", "Sci-Fi", 2012, { runtime: 12 }],
  ["charade", "Charade", "Movie", "wishlist", null, "Stanley Donen", "Romance", 1963, { runtime: 113, cast_list: "Cary Grant, Audrey Hepburn, Walter Matthau" }],
  ["the-general", "The General", "Movie", "not-started", null, "Buster Keaton", "Comedy", 1926, { runtime: 78, cast_list: "Buster Keaton, Marion Mack" }],
  ["caligari", "The Cabinet of Dr. Caligari", "Movie", "consumed", 15, "Robert Wiene", "Horror", 1920, { runtime: 76, cast_list: "Werner Krauss, Conrad Veidt, Lil Dagover" }],
  ["elephants-dream", "Elephants Dream", "Movie", "consumed", 12, "Bassam Kurdali", "Animation", 2006, { runtime: 11, notes: "The first Blender open movie (CC BY)." }],
  ["spring", "Spring", "Movie", "consumed", 16, "Andy Goralczyk", "Animation", 2019, { runtime: 8, notes: "Blender Studio short (CC BY)." }],
  ["cosmos-laundromat", "Cosmos Laundromat: First Cycle", "Movie", "wishlist", null, "Mathieu Auvray", "Animation", 2015, { runtime: 12, notes: "Blender Foundation open movie (CC BY)." }],
  ["sherlock-jr", "Sherlock Jr.", "Movie", "consumed", 18, "Buster Keaton", "Comedy", 1924, { runtime: 45, cast_list: "Buster Keaton, Kathryn McGuire" }],
  ["safety-last", "Safety Last!", "Movie", "consumed", 17, "Fred C. Newmeyer", "Comedy", 1923, { runtime: 70, cast_list: "Harold Lloyd, Mildred Davis" }],
  ["the-kid", "The Kid", "Movie", "not-started", null, "Charlie Chaplin", "Comedy", 1921, { runtime: 68, cast_list: "Charlie Chaplin, Jackie Coogan" }],
  ["his-girl-friday", "His Girl Friday", "Movie", "wishlist", null, "Howard Hawks", "Comedy", 1940, { runtime: 92, cast_list: "Cary Grant, Rosalind Russell" }],
  ["gold-rush", "The Gold Rush", "Movie", "in-progress", null, "Charlie Chaplin", "Comedy", 1925, { runtime: 95, cast_list: "Charlie Chaplin, Georgia Hale" }],
  // Books
  ["frankenstein", "Frankenstein", "Book", "consumed", 18, "Mary Shelley", "Gothic", 1818, { notes: "Nothing like the films. Far sadder." }],
  ["dracula", "Dracula", "Book", "in-progress", null, "Bram Stoker", "Horror", 1897, {}],
  ["alice", "Alice's Adventures in Wonderland", "Book", "consumed", 14, "Lewis Carroll", "Fantasy", 1865, {}],
  ["time-machine", "The Time Machine", "Book", "consumed", 16, "H. G. Wells", "Sci-Fi", 1895, {}],
  ["war-of-the-worlds", "The War of the Worlds", "Book", "wishlist", null, "H. G. Wells", "Sci-Fi", 1898, {}],
  ["study-in-scarlet", "A Study in Scarlet", "Book", "not-started", null, "Arthur Conan Doyle", "Mystery", 1887, {}],
  ["pride-and-prejudice", "Pride and Prejudice", "Book", "dropped", 8, "Jane Austen", "Romance", 1813, { notes: "Tried twice. Maybe a third time." }],
  ["wizard-of-oz", "The Wonderful Wizard of Oz", "Book", "consumed", 15, "L. Frank Baum", "Fantasy", 1900, {}],
  ["peter-pan", "Peter Pan", "Book", "consumed", 14, "J. M. Barrie", "Fantasy", 1911, {}],
  ["jungle-book", "The Jungle Book", "Book", "consumed", 15, "Rudyard Kipling", "Adventure", 1894, {}],
  ["sherlock-adventures", "The Adventures of Sherlock Holmes", "Book", "in-progress", null, "Arthur Conan Doyle", "Mystery", 1892, {}],
  ["wind-in-the-willows", "The Wind in the Willows", "Book", "wishlist", null, "Kenneth Grahame", "Children's", 1908, {}],
  ["around-the-world", "Around the World in Eighty Days", "Book", "not-started", null, "Jules Verne", "Adventure", 1872, {}],
  ["great-gatsby", "The Great Gatsby", "Book", "consumed", 17, "F. Scott Fitzgerald", "Literary", 1925, {}],
  ["hound-baskervilles", "The Hound of the Baskervilles", "Book", "consumed", 16, "Arthur Conan Doyle", "Mystery", 1902, {}],
  ["secret-garden", "The Secret Garden", "Book", "not-started", null, "Frances Hodgson Burnett", "Children's", 1911, {}],
  ["treasure-island", "Treasure Island", "Book", "wishlist", null, "Robert Louis Stevenson", "Adventure", 1883, {}],
  // Audiobooks (LibriVox recordings)
  ["mine-and-thine", "Mine and Thine", "Audiobook", "in-progress", null, "Florence Earle Coates", "Poetry", null, { narrator: "LibriVox volunteers" }],
  ["pierre-and-luce", "Pierre and Luce", "Audiobook", "consumed", 13, "Romain Rolland", "Fiction", 1920, { narrator: "LibriVox volunteers" }],
  // Games (free and open source)
  ["wesnoth", "The Battle for Wesnoth", "Game", "consumed", 17, "The Battle for Wesnoth developers", "Strategy", 2005, { platform: "PC", notes: FREE_GAME }],
  ["0ad", "0 A.D.", "Game", "in-progress", 15, "Wildfire Games", "Real-time strategy", 2009, { platform: "PC", notes: FREE_GAME }],
  ["supertuxkart", "SuperTuxKart", "Game", "consumed", 14, "SuperTuxKart team", "Racing", 2006, { platform: "PC", notes: FREE_GAME }],
  ["openttd", "OpenTTD", "Game", "in-progress", 18, "OpenTTD team", "Simulation", 2004, { platform: "PC", notes: FREE_GAME }],
  ["freeciv", "Freeciv", "Game", "wishlist", null, "Freeciv team", "Turn-based strategy", 1996, { platform: "PC", notes: FREE_GAME }],
  ["widelands", "Widelands", "Game", "not-started", null, "Widelands development team", "Strategy", 2002, { platform: "PC", notes: FREE_GAME }],
  ["freecol", "FreeCol", "Game", "wishlist", null, "FreeCol team", "Turn-based strategy", 2003, { platform: "PC", notes: FREE_GAME }],
  ["mindustry", "Mindustry", "Game", "in-progress", 14, "Anuken", "Tower defence", 2017, { platform: "PC", notes: FREE_GAME }],
  // Music (Creative Commons)
  ["josh-woodward-ashes", "Ashes", "Music", "consumed", 15, "Josh Woodward", "Indie", 2010, {}],
  ["tunguska-chillout", "Tunguska Chillout Grooves vol. 1", "Music", "consumed", 13, "Tunguska Electronic Music Society", "Chillout", 2008, {}],
  ["zero-celtic-dream", "Celtic Dream", "Music", "in-progress", null, "zero-project", "Ambient", 2010, { label: "Jamendo" }],
  ["zero-fairytale", "Fairytale", "Music", "wishlist", null, "zero-project", "Ambient", 2010, { label: "Jamendo" }],
  ["zero-infinity", "Infinity", "Music", "consumed", 16, "zero-project", "Ambient", 2010, { label: "Jamendo" }],
  ["zero-fairytale-2", "Fairytale 2", "Music", "wishlist", null, "zero-project", "Ambient", 2010, { label: "Jamendo" }],
  ["jw-simple-life", "The Simple Life", "Music", "consumed", 14, "Josh Woodward", "Indie", 2008, {}],
  ["jw-crawford-street", "Crawford Street", "Music", "consumed", 13, "Josh Woodward", "Indie", 2005, {}],
  ["jw-here-today", "Here Today", "Music", "in-progress", null, "Josh Woodward", "Indie", 2004, {}],
  ["jw-sunny-side", "Sunny Side of the Street", "Music", "wishlist", null, "Josh Woodward", "Indie", 2005, {}],
  // Board games (traditional)
  ["chess", "Chess", "Board Game", "consumed", 19, "Traditional", "Abstract strategy", null, { player_count: "2", play_time: 60, is_local: 1 }],
  ["go", "Go", "Board Game", "in-progress", 20, "Traditional", "Abstract strategy", null, { player_count: "2", play_time: 60, is_local: 1 }],
  ["backgammon", "Backgammon", "Board Game", "consumed", 12, "Traditional", "Race", null, { player_count: "2", play_time: 30, is_local: 1 }],
  ["mahjong", "Mahjong", "Board Game", "not-started", null, "Traditional", "Tile game", null, { player_count: "4", play_time: 90 }],
  ["mancala", "Mancala", "Board Game", "wishlist", null, "Traditional", "Abstract strategy", null, { player_count: "2", play_time: 20 }],
  ["nine-mens-morris", "Nine Men's Morris", "Board Game", "wishlist", null, "Traditional", "Abstract strategy", null, { player_count: "2", play_time: 20 }],
  ["senet", "Senet", "Board Game", "wishlist", null, "Traditional", "Race", null, { player_count: "2", play_time: 30 }],
  ["royal-game-of-ur", "The Royal Game of Ur", "Board Game", "not-started", null, "Traditional", "Race", null, { player_count: "2", play_time: 30 }],
  ["cribbage", "Cribbage", "Board Game", "consumed", 15, "Sir John Suckling", "Card game", null, { player_count: "2-4", play_time: 30, is_local: 1 }],
  ["hnefatafl", "Hnefatafl", "Board Game", "in-progress", null, "Traditional", "Abstract strategy", null, { player_count: "2", play_time: 45 }],
  ["dominoes", "Dominoes", "Board Game", "consumed", 11, "Traditional", "Tile game", null, { player_count: "2-4", play_time: 30, is_local: 1 }],
  ["checkers", "Checkers", "Board Game", "consumed", 12, "Traditional", "Abstract strategy", null, { player_count: "2", play_time: 30, is_local: 1 }],
  // Websites
  ["gutenberg", "Project Gutenberg", "Website", "consumed", 18, "Project Gutenberg", "Library", null, { site_name: "Project Gutenberg", url: "https://www.gutenberg.org", notes: "Free ebooks. Where half of this demo's books come from." }],
  ["wikimedia-commons", "Wikimedia Commons", "Website", "consumed", 19, "Wikimedia Foundation", "Library", null, { site_name: "Wikimedia Commons", url: "https://commons.wikimedia.org", notes: "Every cover in this demo comes from here." }],
  ["wikisource", "Wikisource", "Website", "wishlist", null, "Wikimedia Foundation", "Library", null, { site_name: "Wikisource", url: "https://wikisource.org" }],
  ["creative-commons", "Creative Commons", "Website", "consumed", 18, "Creative Commons", "Reference", null, { site_name: "Creative Commons", url: "https://creativecommons.org", notes: "The licences behind most of this demo's content." }],
  ["wikibooks", "Wikibooks", "Website", "not-started", null, "Wikimedia Foundation", "Education", null, { site_name: "Wikibooks", url: "https://www.wikibooks.org" }],
  ["librivox", "LibriVox", "Website", "consumed", 17, "LibriVox", "Audiobooks", null, { site_name: "LibriVox", url: "https://librivox.org", notes: "Free public-domain audiobooks read by volunteers." }],
  ["openstreetmap", "OpenStreetMap", "Website", "in-progress", null, "OpenStreetMap contributors", "Maps", null, { site_name: "OpenStreetMap", url: "https://www.openstreetmap.org" }],
];

const DAY = 86400000;

export function buildSampleItems(now = Date.now()) {
  return ROWS.map(([slug, title, media_type, status, rating, creator, genre, year, extra], i) => {
    const added = new Date(now - (i * 3 + 2) * DAY).toISOString().slice(0, 10);
    const consumed = status === "consumed" ? new Date(now - (i * 3 + 20) * DAY).toISOString().slice(0, 10) : null;
    return {
      id: i + 1, title, media_type, status, rating, creator, genre, year,
      is_local: 0, date_added: added, date_consumed: consumed, notes: null,
      cover_art_path: credits[slug].image, // a picture file next to the demo page
      metadata_fetched: 1, list_ids: [], custom_fields: {},
      ...extra,
    };
  });
}

// For the Credits page: who made each picture, and under what licence.
export function coverCredits() {
  return ROWS.map(([slug, title, media_type]) => ({ title, media_type, ...credits[slug] }));
}
