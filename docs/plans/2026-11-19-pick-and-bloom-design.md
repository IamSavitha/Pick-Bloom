# Pick&Bloom — Design

**Date:** 2026-11-19
**Status:** Approved (amended 2026-11-19: pick one *or more* per family)

## What it is

Pick&Bloom is a simple app for a young child. It's based on the "Pick One!" activity bank (`Kids_Pick_One_Activity_Button_Bank.pdf`), which has 12 families of activities. A 13th family, **Clean & Healthy** (hygiene habits such as bath, morning and night brush, washing hands, wiping the nose, tissue in the bin and potty time), was added on 2026-11-19 at the user's request. Each day the child picks at least one activity from each family, and may pick more. After doing it, he taps **"I did it!"** and a flower grows in his garden.

Every pick, every finished activity and every "how was it?" face gets saved. That history shows the grown-ups his **patterns**: what he loves, what he avoids, and what he starts but doesn't finish. Gentle suggestions turn those patterns into ideas for helping him grow.

Think of it like a sticker chart that remembers everything and quietly tells the parent what it noticed.

## Requirements

- **Works on laptop, phone and iPad.** It's one web address, it can be added to the home screen, and the screen layout adapts to each size.
- **Simple.** Plain HTML, CSS and JavaScript, with no framework and no build step. Opening `index.html` directly still works.
- **Same data on every device.** The child uses the iPad, and the parent checks patterns on a phone or laptop.
- **Works offline.** Data is saved on the device first, and syncing catches up later.
- **Private.** Each family's data is visible only to their own signed-in account. There's no AI and there are no analytics.

## Approach

**Local-first static web app, with optional Supabase sync.**

- **Hosting:** the app is a few static files hosted anywhere (Vercel recommended). There's nothing to build.
- **Saving:** every change is saved to the browser's `localStorage` straight away.
- **Syncing:** when Supabase is configured and a grown-up has signed in, the app reads the family's one saved row, combines it with what the device has, and writes the combined result back. Because the combining step never loses information, devices end up agreeing even if both made changes while offline.
- **Without Supabase:** with `config.js` left blank, the app runs as a single-device app.

Alternatives considered:

- **Only on the device, with export/import between devices.** Too clumsy for the iPad-plus-parent-phone setup.
- **Next.js plus a database, like Manasu.** Too heavy for "keep it simple."

## The child's side

- **Today**
  - **Family cards:** one card per visible family, in the PDF's colors.
  - **Choosing:** tap a card to see that family's buttons (emoji plus a big word) and pick **one or more**. There's no upper limit. Tapping a picked button again unpicks it, until it's done.
  - **Finishing:** each pick has its own "I did it!", which asks for a face (😄 Loved it / 🙂 It was okay / 😴 Tired), and then that pick's flower blooms.
- **Try something new:** buttons he has never tried show a ✨.
- **Read aloud:** tapping a button reads its word out loud using the browser's built-in voice. Grown-ups can turn this off.
- **My Garden**
  - **Today's garden:** one flower per finished activity, in the family's color.
  - **This week:** the last 7 days, row by row.
  - **Grows only:** there are no streaks to break and no "you missed it" messages.

## Look and feel (toddler, amended 2026-11-19)

The user is a toddler boy who can't read yet, so pictures, sounds and celebration carry the meaning, and the words are for the grown-up reading along.

- **Rounded and friendly:**
  - The "Fredoka" font (Google Fonts), falling back to the system rounded font.
  - Chunky rounded tiles in the family colors, with soft shadows.
  - Large emoji: about 56px on buttons and in picks.
- **Sprout, the buddy:** a small, round, original baby dinosaur drawn as inline SVG, green, with a leaf sprout on his head. He waves on Today and cheers during celebrations.
- **Celebration on "I did it!":**
  - A short burst of petals over the screen.
  - Sprout cheering.
  - A soft chime made by the browser (Web Audio). No sound files.
  - The chime follows the same grown-up setting as read-aloud ("Sounds & voice").
- **Garden scene:** a sky gradient, sun and grass strip, with flowers that pop up.
- **Tap feedback:** tiles squish slightly when pressed.
- **Reduced motion:** every animation is turned off under `prefers-reduced-motion`.

## The grown-up side (behind "hold for 3 seconds")

- **Patterns** (last 7 or 30 days)
  - Flowers grown.
  - Variety: buttons tried out of the total.
  - Per family:
    - Picks and finished.
    - His favorite.
    - Days since last picked.
    - Time of day (morning / afternoon / evening).
  - His most-loved activities, and a "not tried yet" list.
- **Ideas:** suggestions from simple, transparent rules.
  - **Skipped:** a family not picked for 5 or more days, plus an offer from it.
  - **Repeat:** one activity is 70% or more of a family's picks over 14 days, plus two alternatives.
  - **Dropped:** picked 3 or more times but finished less than half the time.
  - **Loved:** rated 😄 three or more times.
- **Fix picks** (amended 2026-11-19): pick a day (from the last 7), see that day's picks, and remove any added by mistake. This works even on finished ones, and also removes the flower. The child can only untap picks that aren't finished yet.
- **Settings:**
  - Child's name.
  - Sounds & voice on or off (read-aloud plus the chime).
  - **Reward symbol** (amended 2026-11-19): 🌸 Flower (default), ⭐ Star, ☀️ Sun, 🍬 Candy or 🎈 Balloon. It changes everywhere: the celebration burst, progress text ("⭐ 3 stars today"), the garden scene (symbols instead of drawn flowers), and past rewards too. The tab reads "My Garden" for flowers and "My Rewards" otherwise.
  - Show or hide families.
  - Buttons, grown-up only (amended 2026-11-19):
    - **Add** a new button.
    - **Edit** any button's name or emoji, built-in ones included, with **Reset** to undo.
    - **Remove** a button. It is hidden from the child, but history keeps it, and **Bring back** restores it.
  - Learn & Think also has Language, Speaking and Listening.
- **Backup:** download a JSON file, and restore one. Restoring *adds* what's in the backup and never deletes anything.
- **Sync:** sign in with email and password, see when it last synced, sync now, sign out.

## Data

```
state = {
  version: 2,
  settings: { childName, readAloud, hiddenFamilies[], hiddenActivities["fam/act"],
              customActivities[{familyId,id,label,emoji}], updatedAt },
  entries: [{ date:"YYYY-MM-DD", familyId, activityId, pickedAt, doneAt|null,
              feeling:"loved"|"okay"|"tired"|null, removed, updatedAt }]
}
```

- **One entry per activity picked, per family, per day.** The child can pick several in one family. An unpicked activity is kept with `removed: true` so that syncing doesn't bring it back. Version 1 saves (one pick per family) are upgraded automatically.
- **Combining two devices' data:**
  - Entries are matched by date, family and activity. A finished entry wins over an unfinished one; otherwise the newer `updatedAt` wins.
  - For settings, the newer `updatedAt` wins.
- **Supabase:** one table, `pickbloom_state (user_id pk, state jsonb, updated_at)`, with row-level security set to "own row only."

## Error handling

- **Storage unavailable (private mode):** the app still works, and a banner says progress won't be saved.
- **Saved data that can't be read:** it's set aside under `pickbloom.v1.corrupt`, and the app starts fresh with a banner.
- **Bad backup file:** it's rejected with a friendly message, and the existing data isn't touched.
- **Sync errors:** shown only in the grown-up Sync panel. The child never sees them, and data on the device is never lost.
- **Offline:** if the Supabase script can't load, the app quietly runs on the device only.

## Testing

- **Automated (`node --test`, no dependencies):**
  - The activity data.
  - The data model: picks, settings, backup, combining device data.
  - The pattern and suggestion rules.
  - Syncing, against a fake Supabase client.
- **Screens:**
  - Headless Chrome screenshots at phone, iPad and laptop sizes.
  - A manual checklist in `docs/MANUAL_TEST.md`.

## Files

`index.html`, `styles.css`, `activities.js`, `store.js`, `insights.js`, `sync.js`, `config.js`, `app.js`, `manifest.webmanifest`, icons, `supabase/schema.sql`, `tests/*.test.js`, `README.md`, `docs/`.
