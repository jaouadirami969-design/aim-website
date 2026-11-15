# AIM website — instructions for coding agents

This repository is the public website of **AIM — Academy of Investment & Management** (https://aimsummer.com): a finance and investment summer program for students aged 13 to 18. It is a static site with zero dependencies, deployed by GitHub Actions on every push to `main`.

Read `README.md` for the structure and `supabase/README.md` for the server side.

## This repository is public

Everything committed here can be read and copied by anyone.

- No plans, notes, strategy, pricing discussions or to-do lists. They live in a separate private workspace.
- No personal data: no names, emails or answers of families and students, not even as test fixtures. Use `example.com` addresses and invented names.
- No secrets: API keys, passwords and tokens are set by hand in the Supabase dashboard, never in a file, a commit message or an issue.

## One source of truth

Dates, prices, sessions, levels and form options live in **`src/data/site.json`**. Pages, emails and PDFs are generated from it. To change a fact, change that file — never a page.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Local preview on http://localhost:4000, rebuilt on every change |
| `npm test` | Build `dist/`, then check links, titles, one `<h1>` per page and brand colours |
| `npm run functions:sync` | Copy the shared files from `supabase/functions/request-code/` into the other functions |
| `npm run test:functions` | Server-side checks, no network (needs `typescript`) |
| `npm run test:e2e` | The application flow in a real browser, desktop and phone (needs Playwright) |

Run `npm test` and `npm run test:functions` before every push. A test that could not run is not a passing test: say so.

## Rules

- **Brand**: three colours only — sky blue `#3FA9F5`, white `#FFFFFF`, yellow `#FFC72C` — and the approved shades listed at the top of `src/assets/css/main.css`. `npm run check` fails on any other colour. The round badge logo never changes. Headings in Lora, text in Poppins.
- **Language**: site and email copy is written in English first, in plain words a 15-year-old and a busy parent both understand. A French version of every public page and email is required.
- **Truth**: never invent a student, a testimonial, a number or a promise. Nothing is announced that is not in `site.json`.
- **Payment**: no page, email or button asks for money before the first day of class. No deposits.
- **Names**: never name another program or a competitor. "McGill" never appears in the name, the logo or the certificate, and the site states that AIM is independent and not affiliated with McGill University.
- **Investing content**: education with simulated money only. No buy or sell signals, no promised returns. Any page that talks about investments ends with "Education only — not personal advice."
- **Minors**: testimonials are anonymous. No photo, voice or name of a minor without a parent's written permission.
- **Accessibility**: keyboard navigation, visible focus, `alt` text on every image, `prefers-reduced-motion` respected, no tracking cookies.

## Shipping

- One branch per task. Conventional Commits in English: `feat:`, `fix:`, `content:`, `docs:`, `chore:`.
- CI builds and checks every branch. Merging into `main` publishes the site in about two minutes.
- Never push to `main` without the owner's explicit yes. After a deployment, open the live page and verify the change.
- Edge Functions: edit shared files in `request-code/`, run `npm run functions:sync`, run the tests, then deploy with `verify_jwt: false`. Database changes go through a migration that is both committed here and applied to the project.
- Never commit `dist/`.
