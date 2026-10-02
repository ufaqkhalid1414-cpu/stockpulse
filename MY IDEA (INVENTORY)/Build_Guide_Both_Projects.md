# Build Guide: From Idea to Working App in Cursor
### Project 1: Real-Time Inventory Sync | Project 2: Food Waste Tracker

---

# HOW TO START (Applies to Both Projects)

## Step 0: Accounts you need before opening Cursor

1. **Cursor Pro** — already set up
2. **Supabase account** — free, go to supabase.com, sign up with your Gmail. This will be your database and the "real-time sync" engine for both apps.
3. **GitHub account** — already connected to Cursor from your portfolio setup
4. *(For Food Waste Tracker only)* No extra account needed yet — Claude's AI vision can be used through Cursor directly for image recognition in the MVP stage.

## Step 1: Create a Supabase project (do this for whichever app you start first)

1. Go to supabase.com → log in → click **"New Project"**
2. Give it a name (e.g. `inventory-sync` or `food-tracker`)
3. Set a database password (save it somewhere safe — you'll need it once)
4. Choose the region closest to you (Asia/Singapore is usually closest to Pakistan)
5. Wait 1-2 minutes for it to finish setting up
6. Once ready, go to **Project Settings → API** — copy the **Project URL** and the **anon public key**. You'll paste these into Cursor later.

## Step 2: Create the project folder

1. On your Desktop (or wherever you keep projects), create a new folder — e.g. `inventory-sync-app` or `food-waste-tracker`
2. Open Cursor → **Open Project** → select that folder
3. Open the terminal (Ctrl + `)

---

# PROJECT 1: Real-Time Inventory Sync

## Step 1: Scaffold the project

In Cursor's terminal, type:
```
npm create vite@latest . -- --template react-ts
```
Press Enter, confirm any prompts (choose "yes" if asked to overwrite files). Then run:
```
npm install
```

## Step 2: Install Supabase and Tailwind

```
npm install @supabase/supabase-js
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

## Step 3: Connect Supabase (give this to the Cursor Agent)

Open a new Agent chat in Cursor and paste:

```
Set up a Supabase client in this React + TypeScript + Vite project.
Create a file src/lib/supabaseClient.ts that initializes Supabase using
environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).
Also create a .env file with placeholders for these two variables, and
add .env to .gitignore so it's never uploaded to GitHub.
```

Then open the `.env` file it creates and paste in your real Project URL and anon key from Supabase (from Step 1 above).

## Step 4: Create the database table (do this in Supabase, not Cursor)

1. Go to your Supabase project → **Table Editor** → **New Table**
2. Name it `products`
3. Add these columns:
   - `id` (auto, already there)
   - `name` (text)
   - `quantity` (int4/number)
   - `price` (numeric)
   - `low_stock_threshold` (int4, default 5)
4. Go to **Database → Replication** and make sure the `products` table has **Realtime enabled** (toggle it on) — this is what makes the "instant sync" actually work.

## Step 5: Build the core app (main Cursor Agent prompt)

Paste this into the Agent chat:

```
Build a simple inventory management app with these features:

1. A product list view showing all products from the Supabase "products" table
   (name, quantity, price), updating in real time using Supabase's realtime
   subscription — so if the data changes in Supabase, the screen updates
   instantly without refreshing.

2. A "Sell" button next to each product that decreases its quantity by 1
   with a single tap (this simulates a counter sale).

3. An "Add Stock" button to increase quantity (for restocking).

4. A simple form to add a new product (name, starting quantity, price).

5. A low-stock warning badge (red) shown next to any product where quantity
   is below its low_stock_threshold.

Use Tailwind CSS for styling — dark theme, clean, minimal, similar to the
glassmorphism style used in my portfolio: dark charcoal background, soft
glass-effect cards, one accent color (teal or emerald).

Build it section by section: first the product list with realtime updates,
then the sell/restock buttons, then the add-product form, then the
low-stock badges. Explain each file before creating it.
```

## Step 6: Test it

```
npm run dev
```
Open the localhost link. Try: add a product, click "Sell," and open Supabase's Table Editor in another tab — you should see the quantity update live in both places.

## Step 7 (Optional v2 — do this later): Simulate the "online store" view

Ask the Agent:
```
Create a second page called "Storefront" that shows the same products in a
read-only customer-facing view (no sell/restock buttons), so I can
demonstrate how an online store would show the same live stock count.
```

## Step 8: Deploy

1. Push the project to GitHub (Cursor can do this — ask the Agent: "help me push this project to a new GitHub repository")
2. Go to vercel.com → log in with GitHub → import the repo → add your two environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) in Vercel's settings → deploy

---

# PROJECT 2: Food Waste / Smart Fridge Tracker

## Step 1: Scaffold the project

Same as before, in a **separate** new folder:
```
npm create vite@latest . -- --template react-ts
npm install
npm install @supabase/supabase-js
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

## Step 2: Connect Supabase

Same prompt as Project 1, Step 3 — paste it into the Agent, then create a new Supabase project (separate from the inventory one) and paste its URL/key into `.env`.

## Step 3: Create the database table

In Supabase Table Editor, create a table called `fridge_items`:
- `id` (auto)
- `name` (text)
- `added_date` (date)
- `estimated_expiry` (date)
- `status` (text — values like "fresh", "expiring", "used", "thrown_out")

## Step 4: The photo-recognition feature (the core AI part)

This is the trickiest part — here's exactly how to approach it with Cursor:

```
I want to build a feature where a user uploads a photo of their groceries,
and an AI identifies what food items are in the photo, then adds them to
my Supabase "fridge_items" table with an estimated expiry date.

Use the Anthropic Claude API (vision-capable) to analyze the uploaded image
and return a list of identified food items in JSON format, like:
[{"name": "tomato", "estimated_shelf_life_days": 7}, {"name": "milk",
"estimated_shelf_life_days": 5}]

Build:
1. A photo upload button/input
2. A function that sends the image to Claude's API and gets back the
   identified items
3. Automatically calculate estimated_expiry as today's date plus the
   shelf_life_days, and insert each item into the fridge_items table
4. Show a confirmation list so the user can edit/remove any wrongly
   identified item before saving

Explain the API setup needed before writing the code, since this requires
an Anthropic API key.
```

**Important note:** using the Claude API from a website requires an API key from console.anthropic.com (separate from your Claude.ai/Cursor subscription — it's pay-as-you-go, usually very cheap for a student project, a few cents per image). Cursor's Agent can walk you through getting one if you ask it directly: *"how do I get an Anthropic API key and add it to this project safely?"*

## Step 5: Build the rest of the app

```
Now build:
1. A dashboard showing all fridge_items, sorted by which expires soonest,
   with color coding: green (fresh, 3+ days left), yellow (expiring soon,
   1-2 days), red (expired/overdue)
2. A "Mark as Used" and "Mark as Thrown Out" button on each item, which
   updates its status in Supabase
3. A simple "What can I cook?" section: when an item is expiring soon,
   show a basic suggested recipe using that ingredient (this can start as
   a simple hardcoded suggestion list per common ingredient, not a full AI
   recipe generator, to keep the MVP realistic)

Use the same dark glassmorphism theme as my portfolio and the inventory
sync app for visual consistency across my projects.
```

## Step 6: Test it

```
npm run dev
```
Upload a real photo of some groceries or fridge items and see if it correctly identifies and adds them.

## Step 7: Deploy

Same as Project 1 — push to GitHub, import to Vercel, add your environment variables (including the Anthropic API key as a server-side/protected variable, never exposed in frontend code — ask the Agent to confirm it's handled securely before deploying).

---

# General Tips for Both Projects

- **Build one feature at a time.** Don't paste all the prompts at once — wait for each Agent response, test it, then move to the next step. This avoids confusing, half-broken results.
- **If Cursor's Agent hits a usage limit again,** you can still manually edit files yourself using the code Cursor already wrote, or ask me here and I'll write the exact code for you to paste in.
- **Keep your `.env` file out of GitHub** — always double check `.gitignore` includes it, so your Supabase/API keys don't get exposed publicly.
- **Test with real data first** (a real product list, a real grocery photo) before considering either app "done" — this is exactly the validation step from your research documents.
