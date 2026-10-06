// Replaces ../supabase.js in the browser demo (see metro.config.js). Same exports, no network: the app
// thinks it is signed in to a server that holds the made-up demo library.
import "./installDemo";
import { mockSupabase } from "./mockServer";

const config = { url: "https://demo.invalid", key: "demo", source: "saved" };
export const getServerConfig = () => config;
export const serverHost = () => "demo (not a real server)";
export const useServerConfig = () => config;
export async function saveServerConfig() { return { changed: false }; }
export const supabase = mockSupabase;
