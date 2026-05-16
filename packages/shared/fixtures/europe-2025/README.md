# Europe 2025 Fixture

This directory holds the user's real Up Bank data from 2025-09-01 to 2025-11-06 for retroactive testing. The user must populate `transactions.json` themselves with the output of `GET /transactions?filter[since]=2025-09-01&filter[until]=2025-11-07` from the Up API (anonymising descriptions if desired). Until then, the `europe-2025` scenario test is skipped.

After populating:
1. Edit `itinerary.txt` with the actual trip cities/dates.
2. Run the scenario test once to capture actual totals.
3. Update `expected.json` with those totals.
4. Re-run to confirm reproducibility.
