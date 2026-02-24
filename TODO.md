# Badass Bakery - Improvement Plan

## Quick Wins (Phase 1)

- [x] **Sticky "View Cart" bottom bar** - shows item count + total on menu page, tap to go to cart
- [x] **Cart feedback animation** - "Add" button flashes green "✓" then reverts
- [x] **Pickup/ordering info banner** above menu + payment instructions
- [x] **Theresa intro line** - replaced generic welcome with personal + pickup/payment info
- [x] **Remove thick purple border** under header - replaced with subtle `border-gray-800`
- [x] **"Sold Out" / "Restock" toggle** in admin - clearer labels
- [x] **Confirm dialog on admin Delete** - already existed
- [x] **Simplify menu cards** - removed qty stepper, single "Add" button, qty handled in cart

## Trust & Content (Theresa can do these)

- [ ] Add quantity/size to item descriptions ("Qty 8" → "8 large cinnamon rolls with cream cheese frosting")
- [ ] Add allergen note ("Made in a kitchen that processes nuts, dairy, wheat")
- [ ] Add Instagram link for social proof
- [ ] Add photos of baked goods to each item (once photo upload is built)

## Bigger Lifts (Phase 2)

- [ ] **Photo support for menu items** - image upload in admin, display on menu cards. Cloudinary or Supabase Storage (1-2 days)
- [ ] **Bottom sheet for item customization** - tap card opens slide-up with options/qty instead of inline dropdowns. DoorDash/Sweetgreen pattern (2-3 days)
- [ ] **Order status lifecycle** - Placed → Confirmed → Ready → Completed with timestamps. Admin toggle buttons, customer sees status (2-3 days)
- [ ] **Reorder button** on past orders - "Order Again" pre-fills cart. High value for repeat customers (1 day)
- [ ] **Admin baking prep view** - aggregates all orders for a pickup date into a single baking list: "Saturday Feb 28: 4x Pretzel Bites, 2x Sourdough Boule, 6x Bagels (3 Everything, 2 Plain, 1 Asiago)..." (1 day)
- [ ] **Order windows / scheduled ordering** - "Ordering open for Saturday, closes Thursday 8pm" with countdown. Matches how small bakeries actually operate (2-3 days)

## Nice to Have (Phase 3)

- [ ] **SMS OTP auth via Twilio** - text message code instead of email. Requires Twilio account (~$0.008/SMS)
- [ ] **Apple sign-in** - requires Apple Developer account ($99/yr)
- [ ] **Payment integration** - Stripe or Square payment link attached to order confirmation (1-2 days)
- [ ] **PWA install prompt** - tasteful banner for first-time visitors to add to home screen (1 day)
- [ ] **Pull-to-refresh** on menu page
- [ ] **Replace native select dropdowns** with tappable chips/pills for item options (better mobile feel)
- [ ] **"About the Baker" section** - Theresa's photo + short bio for trust building
- [ ] **Push notifications** via service worker when order status changes

## Design Notes

- Consider adding a warm accent color alongside purple (cream, warm tan, or soft gold) to soften the dark theme - pure dark + purple can feel "tech startup" vs "artisan bakery"
- Typography hierarchy could be sharper: item name dominant (semi-bold ~18px), price secondary, description clearly tertiary
- If menu grows, add category grouping (Breads, Sweets, etc.) with sticky headers or horizontal chip filter
- Define 3 card variants: featured (large, with image), standard, compact (for add-ons)
