# Setting up your own server

The Media Vault keeps your library on your computer. To see it on your phone and
keep the two in step, it syncs through a **Supabase project that belongs to you**.
Nobody else can see it, there is no shared server behind the app, and Supabase's
free plan is plenty for a personal library.

You do this once. Everything is in **Settings → Cloud Sync → Your server** on the
desktop app (it also appears on the Welcome screen the first time you run the app).

## 1. Create the project

Make a free account at <https://supabase.com/dashboard> and create a new project.
Pick any name and region, and set a database password you will not need again.
Wait about a minute for it to finish starting.

## 2. Run the setup SQL

1. In the desktop app press **Copy setup SQL**.
2. In the Supabase dashboard open **SQL Editor → New query**, paste, and press **Run**.

It is safe to run again whenever the app tells you the database is out of date.
The same script lives in this repo as `supabase/schema_current.sql`.

What it creates:

- the tables your library, lists, custom types and Discover dismissals sync through,
  each locked so an account can only ever read and write **its own rows**
  (row-level security);
- the encrypted store for API keys (the cloud only ever holds ciphertext);
- a **`covers` storage bucket** for small cover thumbnails. It is public-read — a
  picture can be viewed by anyone who has its address — but the address is
  `<your user id>/<item id>.jpg`, two random UUIDs, so it cannot be guessed or
  listed, and only you can write into your own folder.

## 3. Copy two values into the app

In the project's **Project Settings → API Keys** copy:

- the **project URL** (like `https://abcdefgh.supabase.co`), and
- the **publishable key** (starts with `sb_publishable_`).

Paste them into the app and press **Test connection**. It tells you exactly which
step is missing: the address, the key, the setup SQL, or the cover storage. Then
press **Save**.

> **Never use the secret key** (`sb_secret_…` or the `service_role` key). It
> bypasses all the security above. The app refuses to accept it.

## 4. Create your login and sign in

Under the server settings in the desktop app, choose **New here? Create an account**, enter an
email and a password (8 or more characters) twice, and press **Create account**. If it says to
check your email, open the confirmation link Supabase sent, then sign in. Then press **Sync Now**.

- **Want it to sign you straight in?** In the Supabase dashboard open **Authentication → Sign In / Providers →
  Email** and turn off **Confirm email**. (Optional; it only saves the email step.)
- **Afterwards, close the door:** once your account exists, turn off **Allow new users to sign up** in the same
  place, so nobody who ever learns your project address can make an account on your server. (They could not see
  your library either way, but they could use up your free storage.)
- You can still create the account by hand instead: **Authentication → Users → Add user**.

## 5. The phone

Install the phone app. On its first screen, the quickest way is on the desktop app: under **Your server**
press **Set up my phone** to show a QR code, then on the phone tap **Scan setup code** and point the camera at
it. The address and key fill themselves in; press **Test connection**, then **Save**. (No camera handy? Press
**Copy the code** on the desktop, send it to yourself, and paste it into either box on the phone.)

Then sign in with the same account on the phone. (Changing the server later: sign out first, then use
**Change** on the sign-in screen.)

The setup code contains your project's address and its public key. Nothing in it is secret, but it points at
your project, so don't post it online.

## Good to know

- **Changing the server** signs the app out of the old one and starts the new one
  from scratch: the whole library is sent on its first sync. Your data on this
  computer is never touched.
- **Free projects pause** after about a week with no activity. If the app says it
  can't reach the server, open the dashboard and press **Restore project**.
- **Backups:** your library lives on your computer (see Settings → Export for a full
  backup). The cloud copy is a convenience, not your only copy.
- **Forgot your password?** The app has no reset screen, because the account lives in your own
  project. In the Supabase dashboard open **Authentication → Users**, find your account, and use
  its menu to send a password recovery email or set a new password.
