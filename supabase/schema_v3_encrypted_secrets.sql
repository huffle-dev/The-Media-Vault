-- Encrypted key sync (V3 suggested-order step 5). Design mirrors the
-- decisions table: a random master key wraps each secret; the master key
-- itself is wrapped twice — once by a passphrase-derived key (PBKDF2-
-- HMAC-SHA256, since neither platform has a usable Argon2id without
-- WASM/native modules Expo Go can't load), once by a random recovery key
-- shown once at setup. The cloud only ever holds ciphertext plus the
-- (non-secret) salt and IVs needed to decrypt it elsewhere with the right
-- passphrase or recovery key.
--
-- Run once in the Supabase SQL editor, after schema_v2_cloud_sync.sql.

-- ── secret_vault ─────────────────────────────────────────────────────────
-- One row per account: the wrapped master key, both ways to unwrap it.
create table if not exists secret_vault (
  user_id                       uuid primary key references auth.users(id) on delete cascade,
  salt                          text not null, -- base64, PBKDF2 salt (not secret)
  wrapped_master_key_passphrase text not null, -- base64: iv(12) + ciphertext + tag(16)
  wrapped_master_key_recovery   text not null, -- base64: iv(12) + ciphertext + tag(16)
  updated_at                    timestamptz not null default now()
);

alter table secret_vault enable row level security;

create policy "secret_vault_select_own" on secret_vault
  for select using (user_id = (select auth.uid()));
create policy "secret_vault_insert_own" on secret_vault
  for insert with check (user_id = (select auth.uid()));
create policy "secret_vault_update_own" on secret_vault
  for update using (user_id = (select auth.uid()));
create policy "secret_vault_delete_own" on secret_vault
  for delete using (user_id = (select auth.uid()));

-- ── encrypted_secrets ────────────────────────────────────────────────────
-- One row per (account, key name) — e.g. tmdb_api_key.
-- ciphertext is encrypted with the master key from secret_vault, never the
-- passphrase or recovery key directly.
create table if not exists encrypted_secrets (
  user_id     uuid not null references auth.users(id) on delete cascade,
  key_name    text not null,
  ciphertext  text not null, -- base64: iv(12) + ciphertext + tag(16)
  updated_at  timestamptz not null default now(),
  primary key (user_id, key_name)
);

alter table encrypted_secrets enable row level security;

create policy "encrypted_secrets_select_own" on encrypted_secrets
  for select using (user_id = (select auth.uid()));
create policy "encrypted_secrets_insert_own" on encrypted_secrets
  for insert with check (user_id = (select auth.uid()));
create policy "encrypted_secrets_update_own" on encrypted_secrets
  for update using (user_id = (select auth.uid()));
create policy "encrypted_secrets_delete_own" on encrypted_secrets
  for delete using (user_id = (select auth.uid()));
