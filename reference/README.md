# Android app (reference only)

`flutter/` is the original Android Flutter app that this web version replaces. It
is kept in the repository so the ported scoring math and the visual design can be
compared against a known-good implementation. Nothing here is built or imported by
the web app.

The published Android source lives at:

https://github.com/lyniezelricardel/Mobile-Storage-Cleaner

## What was ported

| Flutter source | Web equivalent |
| --- | --- |
| `lib/services/blur_detector.dart` | `web/src/lib/imaging.ts` (`blurScore`) |
| `lib/services/duplicate_detector.dart` | `web/src/lib/imaging.ts` (`dhash`), `api/src/grouping.ts` |
| `lib/services/enhance_service.dart` (Smart) | `web/src/lib/imaging.ts` (`applySmart`) |
| `lib/services/enhance_service.dart` (Manual) | `web/src/lib/imaging.ts` (`applyManual`) |
| `lib/app_theme.dart` | `web/src/index.css` + `web/tailwind.config.js` |
| `lib/models/data_models.dart` | `api/src/grouping.ts` (BEST rule) |

The Android version still has an optional Stability AI upscale. The web version
deliberately ships without it: Smart and Manual enhancement only, no uploads, no
API keys.
