# Pick&Bloom

**Think of a sticker chart on the fridge that remembers everything.** Each day your child picks a few things to do from a menu of activity "families" (move, create, play, calm down, and more). When they finish one, they tap **"I did it!"** and a flower grows in their garden. Behind a grown-up lock, the same chart quietly shows you the patterns: what they love, what they avoid, and what they start but don't finish. It also offers a few gentle ideas.

It's one web page that works on an iPad, a phone and a laptop. No app store, no account needed to start, and no ads or tracking.

**Open it:** <https://iamsavitha.github.io/Pick-Bloom/>

---

## The two sides of the app

### For the child (Today and My Garden)

- **Today** shows a card for each activity family, such as *Move My Body*, *Create*, *Calm My Body* and *Clean & Healthy*. The goal is to pick **at least one from each family**, and more is fine.
- Tap a card, then tap the activities to pick them. Tap a picked one again to take it back, as long as it isn't finished yet.
- After doing an activity, tap **"I did it!"** and choose a face: 😄 *Loved it*, 🙂 *It was okay* or 😴 *Tired*. Sprout the dinosaur cheers and a flower blooms.
- ✨ marks an activity the child has never tried.
- **My Garden** shows today's flowers and the last 7 days.
- Buttons are read aloud and a soft chime plays. Grown-ups can turn this off in Settings.

### For grown-ups (the Grown-ups tab)

The grown-up corner is behind a lock that a toddler won't open by accident: **press and hold the button for 3 seconds**. It locks again when you leave the tab, when you press **Lock**, when the app has been in the background for more than a minute, or after 10 minutes with no taps.

| Section | What it's for |
|---|---|
| 📊 **Patterns** | Rewards and picks over the last 7 or 30 days, family by family, favorites, time of day, the most-loved activities, and buttons never tried. |
| 💡 **Ideas** | A few suggestions based on simple rules (see "How the Ideas work" below). |
| 🧹 **Fix picks** | Remove picks that were made by mistake, even finished ones, for the last 7 days. |
| ⚙️ **Settings** | Add or edit children, the child's name, sounds and voice, the **reward symbol** (🌸 flower, ⭐ star, ☀️ sun, 🍬 candy or 🎈 balloon), which families are shown, and the **button editor** (rename, change the emoji, remove, bring back or add your own buttons). |
| 💾 **Backup** | Download everything to a file, or add a backup file's contents to this device. |
| 🔄 **Sync** | Sign in to keep the same garden on all your devices (optional). |

### More than one child

In **Settings → Children** you can add brothers and sisters. Each child has their own picks, garden, reward symbol and button choices. When there are two or more children, the app asks **"Who's playing?"** when it opens, and the child's picture by the greeting lets you switch. In the grown-up corner, the chips at the top choose which child you're looking at. Removing a child hides them but keeps their history, and there's always at least one child.

---

## Put it on the home screen

Once it's on the home screen it opens full screen, like a regular app.

- **iPad and iPhone:** open the link in **Safari**, tap the **Share** button (the square with an arrow), then **Add to Home Screen**. You need **iOS / iPadOS 15.4 or newer**.
- **Android:** open the link in **Chrome**, tap the **⋮** menu, then **Add to Home screen** (or **Install app**).
- **Laptop (Chrome or Edge):** click the install icon in the address bar, or **⋮ → Cast, save and share → Install page as app**.

You can also download this folder and double-click `index.html`. It works straight from your computer.

---

## Privacy

- **Nothing is tracked.** There are no ads, no analytics, no AI and no cookies. The fonts and the sync library are stored inside this app, so it doesn't load anything from other websites.
- **Your data lives on your device.** Picks and settings are saved in the browser on that device.
- **Sync only happens when you sign in.** Someone who opens the link without signing in never sends anything anywhere: the app only talks to the sync server (Supabase) after a grown-up signs in on that device.
- **Each login sees only its own data.** The database only lets a signed-in account read and write its own family. Nobody can create an account from the app: logins are made by the app's owner.
- **Signing out** stops syncing on that device. Everything already saved on the device stays there.

---

## Sharing with friends

There are two safe ways to share:

1. **Just send the link** (<https://iamsavitha.github.io/Pick-Bloom/>). Your friend's family uses it on their own device. Everything stays on their device, and they can use **Backup** to move it to another device.
2. **Make them their own login** if they want sync too. In your Supabase project, go to **Authentication → Users → Add user** and create a separate email and password for them. Their login only ever sees their own family.

**Never share your own login.** Anyone signed in with it would see your children's history and could change it, and their children would be mixed in with yours.

---

## Sync across devices

Sync is like a shared notebook: each device keeps its own copy, and when they sync they **combine** their copies rather than one overwriting the other. A pick made on the iPad and a pick made on the phone both survive. A finished activity is never undone by an older copy, and something removed on purpose stays removed.

To use it, open **Grown-ups → 🔄 Sync** on each device and sign in with the same grown-up email and password. After that, the device syncs by itself about once a minute, soon after every change, and whenever the app comes back to the screen or back online. The child never needs to sign in.

If you're offline, everything keeps working and is saved on the device. It catches up when you're back online.

**"Is Maya the same child as Sam?"** Each device starts with one child. If you set up the iPad for one child and the laptop separately for another, the app can't tell on its own whether they are the same child. So the first time a device joins your account (or when you restore a backup), if the names differ, it asks. **OK** combines them into one child. **Cancel** keeps them as two children. It asks only once per device.

---

## Set up your own copy

You only need this if you want your own copy of the app, with your own sync server. It takes about 10 minutes and is free.

1. **Fork** this repository on GitHub (the **Fork** button at the top right).
2. **Create a free Supabase project** at <https://supabase.com>.
3. In Supabase, open the **SQL Editor**, paste in everything from [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates one private table and its rules. Keep the `grant ... to authenticated` line: newer projects need it so signed-in users can reach the table.
4. Go to **Authentication → Users → Add user → Create new user**. Enter a grown-up email and password, and tick **Auto Confirm User**.
5. Go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up". From now on, only you can create logins.
6. Click **Connect** at the top of the project (or go to **Project Settings → API Keys**). Copy the **Project URL** and the **publishable key** (it starts with `sb_publishable_`; the older "anon public" key also works). Put them in [`config.js`](config.js):

   ```js
   window.PB_CONFIG = {
     supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
     supabaseAnonKey: 'sb_publishable_...',
   };
   ```

   These two values are meant to be public. The database rules and the "no sign-ups" setting are what keep the data private. If you leave them blank, the app saves on each device only and the Sync tab explains that.
7. **Publish it with GitHub Pages:** in your fork, go to **Settings → Pages**, choose **Deploy from a branch**, pick the **`main`** branch and the **`/ (root)`** folder, and click **Save**. The `.nojekyll` file is already there, so GitHub serves the files exactly as they are. After a minute your copy is live at `https://YOUR-NAME.github.io/Pick-Bloom/`.

---

## How the Ideas work

The Ideas are simple, readable rules, not AI. They look at the child shown in the grown-up corner.

1. **Getting started:** until there are at least 5 picks, Ideas just says to check back later.
2. **Skipped family:** a family with no picks for 5 days or more (or never) gets a gentle nudge, with an activity to offer. It shows at most 2 of these, longest gap first.
3. **Same thing again:** if one button gets 70% or more of a family's picks over the last 14 days (with at least 5 picks), it suggests two others to offer.
4. **Started but not finished:** an activity picked at least 3 times in the last 14 days but finished less than half the time might need a grown-up's help or a shorter version. Today doesn't count, since it may still get finished.
5. **Loved:** an activity rated 😄 at least 3 times is one to keep handy for a hard day.

If none of these apply, it says the picks look nicely balanced. At most 5 ideas show at once, with the most useful first.

---

## For developers

- Plain HTML, CSS and JavaScript, with no framework and no build step. The logic files (`store.js`, `family.js`, `insights.js`, `sync.js`) work both in the browser and in Node.
- **Run the tests:** `npm test` (this runs `node --test`; there's nothing to install).
- `vendor/supabase.min.js` is the Supabase client library, version 2.117.3, MIT license. See [`vendor/README.md`](vendor/README.md).
- [`docs/MANUAL_TEST.md`](docs/MANUAL_TEST.md) is the checklist to go through on real devices before a release.
