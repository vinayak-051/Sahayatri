# Improvement plan (2026-11-16)

## Test findings
I ran `backend/scripts/smoke-production.mjs` against the live project with the real demo accounts, then browsed the live site as a guide. Every check passes except payments.

**Works between accounts:**
- sign-in for both roles; profile privacy
- search and spot pages; saved places; view counts
- **booking:** request, then the guide is notified, then the guide accepts and the traveller gets a realtime notification, then cancel, then the guide is notified
- **chat:** live delivery, read receipts, privacy, no editing of received messages
- **buddy trips:** request, owner notified, accept, requester notified
- spot reviews with rating re-sync
- admin stats; admin views give non-admins nothing

**Fixed during testing (live and tested):**
- **Sign-in broken:** an old admin rule on profiles. Migration `20261113000100`.
- **Any traveller could review any guide:** an old extra review rule; banned users could also post guide reviews. Migration `20261116000000`.

**Still wrong:**
| # | Finding | Impact |
|---|---|---|
| F1 | Pending requests whose trip date has passed stay under "New Requests" with Accept/Decline (the Jaipur guide shows two from 31 Oct) | Guides can accept trips that already happened; the dashboard looks stale |
| F2 | The booking-accepted notification says **"Booking confirmed"**, but nothing is paid yet ("confirmed" means the advance is paid) | Misleading for travellers |
| F3 | "Pay advance" always shows, but Razorpay isn't configured, so it fails with a generic error | Dead-end button |
| F4 | Guide profile stats are wrong: "Trips" counts every request, "Earnings" adds up unpaid accepted amounts, and Analytics says "No bookings yet" while there are bookings | Wrong numbers for guides |
| F5 | Guides have no way to block dates; travellers can request any date | Avoidable declines |
| F6 | Guide pages show no trust signals beyond rating (completed trips, response rate, member since) | Weaker conversion |
| F7 | The admin Analytics tab downloads six months of bookings to draw charts | Doesn't scale |

## Plan
| Order | Item | Approach | Done when | Owner |
|---|---|---|---|---|
| 1 | F1 expired requests | DB: guides cannot accept a trip whose date has passed. UI: past-date pending requests show as "Expired", outside "New Requests", with no Accept button | Accepting a past trip is rejected (tested); dashboard shows only live requests | lead |
| 2 | F2 notification wording | Recreate `notify_booking_status_change` with "Booking accepted" for accepted (and keep "Advance received" for confirmed) | DB test checks the titles | lead |
| 3 | F3 payments availability | `payments-api` returns a clear 503 when Razorpay keys are missing; Trips explains "online payment isn't available yet; pay your guide directly" | Smoke test and UI show the clear message | lead |
| 4 | F5 availability calendar | `guide_unavailable_dates` table + RLS; `prepare_booking` rejects blocked dates; guide page to manage dates; booking forms show and block those dates | DB tests + UI tests; booking a blocked date fails | agent A |
| 5 | F4 + F6 guide stats and trust signals | SQL `guide_public_stats(guide_id)` (completed trips, response rate, median response time, member since) shown on guide pages; guide profile stats from completed trips and the ledger | DB tests + UI tests | agent B |
| 6 | F7 analytics in SQL | `admin_booking_timeseries(months)` aggregated server-side; Analytics tab uses it | DB test; no row downloads | agent B |
| 7 | Release | Merge, run the full checks, `supabase db push`, deploy functions and frontend, re-run the smoke test | Smoke test passes apart from payments | lead |

**Not in this round (owner action or larger scope):**
- Razorpay keys
- `VAPID_PRIVATE_KEY` for push
- Auth Site URL setting
- dark mode and an accessibility audit
- map clustering
