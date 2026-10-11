# Landing page copy — translation review

| Lang | Code | Status | Notes |
|------|------|--------|-------|
| English | `en` | **Source** | Authoritative wording; updated for truthful Shopify/planned-store messaging. |
| Urdu | `ur` | Machine-translated | **RTL.** Native review recommended (FAQ, legal titles, step 2 / Shopify planned copy). |
| Chinese | `zh` | Machine-translated | Native review recommended. |
| German | `de` | Machine-translated | Native review recommended. |
| Arabic | `ar` | Machine-translated | **RTL.** Native review recommended. |
| Spanish | `es` | Machine-translated | Native review recommended. |
| French | `fr` | Machine-translated | Native review recommended. |
| Hindi | `hi` | Machine-translated | Native review recommended. |
| Portuguese | `pt` | Machine-translated | Native review recommended. |

All landing strings live in `translations/landing.ts` (`landingCopy`, `LANDING_KEYS`). The app merges them in `lib/i18n.ts`.

**Brand:** “StockPulse” stays untranslated in every locale.

**Review focus:** FAQ accuracy (especially staff permissions, store connections planned, pricing TBD), nav labels, legal page titles (`landingPrivacyTitle`, `landingTermsTitle`, `landingLegalUpdated`), and tone for shop owners.
