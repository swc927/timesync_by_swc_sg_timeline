# Time Sync by SWC

A lightweight single page tool to find fair meeting windows across time zones, anchored to a chosen baseline zone, defaulting to Asia Singapore.

## Why this helps daily life

Distributed teams struggle to pick humane meeting times. This tool:

- Anchors the visual timeline to a baseline zone so everyone talks about the same minutes
- Converts availability per person using IANA time zones through the Intl API
- Finds overlap windows for a chosen duration and scores them for fairness
- Generates a shareable hash link and supports export or import of a plan

## Quick start

1. Open index.html in a browser.
2. Set baseline zone, workday range, and duration.
3. Add participants, pick their zones and work ranges.
4. Read the Suggested windows list. Copy one into chat or calendar.

## Developer notes

- No frameworks, pure HTML CSS JS, so it runs anywhere.
- Uses Intl.DateTimeFormat for zone conversion, no external library.
- Works in 15 minute resolution for overlap logic.
- CSS uses gentle glow gradients for a vivid, modern feel.

## GitHub Pages

You can host it by pushing to a GitHub repository and enabling Pages, then serve from the root on the main branch.
