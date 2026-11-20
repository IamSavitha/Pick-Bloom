# Manual test checklist

Go through this on a real **iPad**, **phone** and **laptop** before a release. Start each device fresh: use a private window, or clear the site's data. Tick each box as you go.

## Child: Today

- [ ] The first visit shows "Hi there!" and one card per family, each saying "Tap to pick".
- [ ] Tap a card: the picker opens. Tapping an activity reads it aloud and shows ✓. Tap **Done ✓** and the pick appears on the card.
- [ ] Pick a second activity in the same family with **+ More**. Both show on the card.
- [ ] Changing a pick: open the picker and tap a picked activity again. It is taken back, and the card updates.
- [ ] Clearing a pick: take back every pick in a family. The card goes back to "Tap to pick".
- [ ] A fast double tap on an activity doesn't pick it and then take it back.
- [ ] **"I did it!"** with 😄 *Loved it*: Sprout cheers, petals burst, a chime plays and the row shows the reward symbol and the face.
- [ ] Repeat with 🙂 *It was okay* and 😴 *Tired*.
- [ ] **Not yet** closes the face dialog without changing anything.
- [ ] A finished activity can't be taken back in the picker (its tile shows the reward and is disabled).
- [ ] ✨ shows on activities never tried, and disappears once one has been picked.
- [ ] The progress line counts rewards today and "N of M families".
- [ ] When every pick in a family is finished, the card shows ✓.

## Child: My Garden

- [ ] Today's finished activities show as flowers, in the order they were finished.
- [ ] "This week" lists the last 7 days, with 🌱 for empty days.
- [ ] The total at the bottom counts every finished activity.

## Sounds and voice

- [ ] Settings → **Sounds & voice** off: no reading aloud and no chime.
- [ ] Turn it back on: reading aloud and the chime work again. On iPad, check after locking and unlocking the screen too.

## Midnight rollover

- [ ] Leave the app open on Today, then change the device date to tomorrow (or wait until midnight). Coming back to the app shows a fresh day, and any open dialog closes.
- [ ] Yesterday's flowers move to "This week" in My Garden.

## Grown-up gate and relock

- [ ] A short tap on **Hold for 3 seconds** doesn't unlock, and the note says to keep holding.
- [ ] Holding for 3 seconds unlocks it. Keyboard: holding Enter or Space works too.
- [ ] Long-pressing on iPad or Android doesn't open a copy or selection menu.
- [ ] **Lock 🔒** goes back to Today, and the corner is locked next time.
- [ ] Leaving the Grown-ups tab locks it.
- [ ] Relock: switch to another app for more than a minute and come back. The corner is locked. Less than a minute: still open, and any typing is kept.
- [ ] Relock: leave the corner open with no taps for 10 minutes. It locks.

## Patterns

- [ ] The three tiles (rewards, picks, buttons tried) match what was done.
- [ ] **Last 7 days** / **Last 30 days** changes the counts.
- [ ] "Family by family" shows picks, finished, favorite, last picked and time of day for each family.
- [ ] **Most loved** lists 😄-rated activities. **Not tried yet** opens to list never-picked buttons.

## Ideas

- [ ] With fewer than 5 picks, it shows the "Ideas show up after a few days" message.
- [ ] With more history, it shows skipped families, repeats, unfinished activities and loved activities as they apply (see the README's "How the Ideas work").
- [ ] The text uses the child's name.

## Fix picks

- [ ] The day buttons cover today and the 6 days before.
- [ ] **Remove** asks first, then removes the pick (finished ones too), along with its reward.
- [ ] Focus moves to the next Remove button after removing.
- [ ] A removed pick doesn't come back after a sync from another device.

## Settings

- [ ] The child's name: type it and tap elsewhere. It appears on Today ("Hi Sam!") and in Ideas.
- [ ] **Reward symbol:** choose ⭐ star. Today, the garden (now "My Rewards"), the tab and the celebration all use ⭐, including past rewards. Switch back to 🌸.
- [ ] **Families shown:** untick a family. It disappears from Today but its history stays in Patterns.
- [ ] **Button editor:**
  - [ ] **Edit** a built-in button's name and emoji. It shows "edited" and the new name on Today. **Reset** brings back the original.
  - [ ] **Remove** a button. It moves to "Removed buttons" and is hidden on Today. **Bring back** restores it.
  - [ ] **Add a button** with a label like `<b>Kite</b>`. It shows literally as `<b>Kite</b>` (not bold) everywhere.
  - [ ] Escape or **Cancel** closes the edit without saving.
- [ ] Tapping a different control right after typing (for example, the name field then a reward tile) saves both and doesn't swallow the tap. Check on iPad.

## More than one child

- [ ] Settings → **Children → Add a child** (name and picture). The "Showing" chips appear at the top of the grown-up corner.
- [ ] Reload: **"Who's playing?"** appears. Choosing a child opens Today with their picture and name by the greeting.
- [ ] The chip by the greeting opens "Who's playing?" again. Choosing from My Garden goes to Today.
- [ ] Each child has their own picks, garden, reward symbol, families shown and buttons. Change one child's reward and check the other's is unchanged.
- [ ] In the grown-up corner, the chips switch Patterns, Ideas, Fix picks and Settings to that child.
- [ ] Edit a child's name and picture. Remove a child (asks first). The last child can't be removed.
- [ ] Back to one child: no "Who's playing?" and no chip.
- [ ] In Settings, type a new name for one child, then tap another child's chip straight away. The first child gets the new name; the other child's name is unchanged.
- [ ] Open the app in two tabs. Pick something in each. Both picks are kept (reload either tab to check).

## Backup

- [ ] **Download backup** saves a `.json` file with every child.
- [ ] **Restore** that file on another device (or a fresh browser). It asks first, then adds the picks and children. Nothing that was already there is lost.
- [ ] Restoring the same file twice doesn't create duplicates.
- [ ] Restoring a junk file (for example, any non-backup `.json` or a photo) shows an error and changes nothing.
- [ ] On a device whose first child is named Sam, restore a backup from a device whose first child is Maya. It asks "Is Maya the same child as Sam?". **Cancel** keeps two children; on a fresh copy, **OK** combines them into one.

## Private browsing

- [ ] In Safari private browsing (or with site data blocked), a banner says progress can't be saved. The app still works for that visit.

## Sync

- [ ] **Not set up** (blank `config.js`): the Sync tab says Pick&Bloom saves on this device only and points to the README and Backup.
- [ ] **Signed out:** the Sync tab says "Use Pick&Bloom on this device only, or ask the person who shared this app to create a login for you." and shows the sign-in form. There's no sign-up form.
- [ ] **Signed out, privacy:** open the browser's developer tools → Network, reload and use the app (pick, finish, open each grown-up tab). There are no requests to `supabase.co`.
- [ ] A wrong password shows "Couldn't sign in: Invalid login credentials".
- [ ] Sign in on two devices with the same account. Pick on one, and within a minute it appears on the other (or tap **Sync now**).
- [ ] Add a child on one device. It appears on the other after a sync.
- [ ] Set up a second device separately with a different first child name, then sign in there. It asks once whether they are the same child. **Cancel** keeps both children on both devices, and the child who was playing on that device is still the one playing.
- [ ] Go offline on one device, pick and finish something, then come back online. It syncs, and nothing is lost on either device.
- [ ] Make different picks on both devices while one is offline. After syncing, both devices show all the picks.
- [ ] **Sign out:** syncing stops on that device, its data stays, and the other device is still signed in.
- [ ] Without signing in again, reloading the signed-out device makes no requests to `supabase.co`.

## Layout

- [ ] **Phone** (portrait, about 390 px wide, and a small 320 px phone): no sideways scrolling. Cards, dialogs, the tab bar and the grown-up tabs fit (6 grown-up tabs show as two rows of three on the smallest phones).
- [ ] **iPad** (portrait and landscape): cards in a grid, and dialogs centered.
- [ ] **Laptop:** content centered, nothing stretched too wide.
- [ ] Added to the home screen, it opens full screen with the Pick&Bloom icon and name.
- [ ] Keyboard only (laptop): every control can be reached with Tab and shows a focus ring. The grown-up sub-tabs move with the arrow keys.
