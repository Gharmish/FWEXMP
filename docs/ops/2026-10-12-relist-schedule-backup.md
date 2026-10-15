# Relist backup — 2026-10-12

On 2026-10-12 ~08:00 UTC the owner asked for the 8 paused experiences to be
relisted as `live` **without any bookable date**. This was done by setting
`availability_weekdays = '{}'` (every date then fails `isDateBookable`'s
`closed_weekday` check; the detail page shows its "No open dates" state).
Blackout and stop-sell dates were left untouched.

To restore bookability, put each listing's weekdays back (0 = Sunday … 6 =
Saturday), from the host dashboard schedule editor or by SQL:

| slug                                               | availability_weekdays before |
| -------------------------------------------------- | ---------------------------- |
| al-qatt-painting-rijal-almaa                       | {5,6}                        |
| an-evening-with-the-flower-men                     | {2,3,4,5,6}                  |
| asiri-coffee-ritual-and-saleeg-lunch               | {0,2,4}                      |
| juniper-forest-dawn-walk-jabal-sawda               | {0,1,2,3,4,5,6}              |
| plant-play-and-enjoy-a-barbecue-with-a-chef-dnrp9e | {5}                          |
| soudah-cliff-via-ferrata                           | {4,5,6}                      |
| sound-and-breath-wadi-mahala                       | {1,6}                        |
| women-only-hike-yoga-and-sketching                 | {0,1,2,3,4,5,6}              |

The draft `asiri-coffee-ritual-and-saleeg-lunch-copy-uwb2cp` was not touched.
