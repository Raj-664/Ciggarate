# Cig Diary — Loose Purchase Setup

This version adds **Loose Cigarette Purchases** separately from cigarette consumption and whole-pack purchases.

## 1. Create the Supabase table

Open your Supabase project and go to **SQL Editor**.

Open `loose_purchases.sql` from this ZIP, paste its contents into the SQL Editor, and click **Run**.

## 2. What the new feature stores

- Brand
- Quantity
- Price per cigarette
- Total purchase price
- Purchase date
- Purchase time
- Notes

Example: Gold Flake × 3 at ₹6 each = ₹18.

## 3. How it appears in the app

- FAB `+` → **Buy Loose Cigarettes**
- Brand page → **+ Loose Cigarettes**
- Brand page → **Loose** tab
- Search → **Loose Purchases** filter
- Analytics/spending includes loose purchases
- JSON and CSV backups include loose purchases

## 4. Important distinction

A loose purchase is **not** automatically counted as a consumed cigarette. Consumption remains recorded through **Add Cigarette / Quick Add Cigarette**.

## 5. Security note

The current app uses a frontend Supabase publishable key and does not use Supabase Auth. The SQL therefore uses the same simple public-storage model. If you later add user accounts, enable Row Level Security and scope records by user ID.
