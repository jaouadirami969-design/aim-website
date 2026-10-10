# AIM — Academy of Investment & Management · website

The public website of **AIM** and its **Finance & Investment Summer Program** (ages 13–18, McGill University campus or live online).
Static site, zero dependencies, three brand colours (sky blue `#3FA9F5`, white, yellow `#FFC72C`).

> **Pour Rami — démarrage en 5 minutes**
> 1. Installe [Node.js](https://nodejs.org) (version 18 ou plus) et [Git](https://git-scm.com).
> 2. Dans un terminal : `git clone <adresse du dépôt>` puis `cd aim-website` puis `npm run dev` → ouvre http://localhost:4000.
> 3. Modifie les textes dans `src/pages/` ou les infos (prix, dates, vidéos) dans `src/data/site.json` — la page se reconstruit toute seule.
> 4. `git add -A && git commit -m "feat: …" && git push` → le site se redéploie automatiquement.

---

## 1. How the site is built

```
src/
  data/site.json      ← ONE place for facts: name, prices, sessions, lessons, levels, video IDs, form endpoint
  layouts/base.html   ← the <html> skeleton every page is wrapped in (meta tags, fonts, scripts)
  partials/*.html     ← reusable blocks: header, footer, signup-form, glance, why-course, logo, illustrations
  pages/*.html        ← one file per page; starts with a <!--page { … } --> block (title, description, nav)
  assets/css/main.css ← design tokens + components (only brand colours allowed — the checker enforces it)
  assets/js/main.js   ← menu, video modal, sign-up form, hero counter
  assets/js/quiz.js   ← the mini-quiz on the free lessons
  assets/fonts/       ← Lora + Poppins, self-hosted (SIL Open Font License)
  assets/logo/        ← badge, lockups, favicon, Open Graph image
  static/             ← copied as-is to the site root: CNAME, robots.txt, site.webmanifest
scripts/
  build.mjs           ← src → dist (tiny template engine: {{ site.x }}, {{> partial }}, {{#each}}, {{#if}})
  dev.mjs             ← local preview with auto-rebuild (npm run dev)
  check.mjs           ← quality gate: broken links, missing titles/descriptions, off-brand colours
dist/                 ← the generated site (never edited by hand, ignored by git)
```

Commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | Build, serve on http://localhost:4000, rebuild on every change |
| `npm run build` | Build the site into `dist/` |
| `npm run check` | Verify links, titles, meta descriptions, one `<h1>` per page, brand colours |
| `npm test` | `build` + `check` (this is what CI runs) |

No `npm install` is needed: the build uses Node.js only.

## 2. Pages

| URL | Purpose |
| --- | --- |
| `index.html` | Home: hero + intro video, free lessons, why AIM, program at a glance, instructor, why take the course, sessions & prices, sign-up |
| `learn-finance-basics.html` | Free lesson 1 — video, written guide, key terms, quiz |
| `learn-stock-market-basics.html` | Free lesson 2 |
| `learn-start-investing-in-canada.html` | Free lesson 3 |
| `program.html` | The summer program: glance, class description, 3 levels, typical day, sessions & prices, why take the course, FAQ, sign-up |
| `why-aim.html` | Why AIM: top-ranked university, topics, instructor (band + profile), our story + intro video, testimonials |
| `apply.html` | Sign up — or find out more (the form) |
| `portal.html` | Student portal (login placeholder until the first session) |
| `privacy.html` | Privacy & consent (Quebec Law 25, students 13 and under) |
| `404.html` | Not found |

## 3. Things to fill in (all in `src/data/site.json`)

| Key | What to put |
| --- | --- |
| `url`, `domain` | The real domain once bought (also update `src/static/CNAME` and `robots.txt`) |
| `email` | The address that receives sign-ups (e.g. `hello@aimsummer.com`) |
| `social.*` | Facebook, Instagram and YouTube page links |
| `formEndpoint` | A [Formspree](https://formspree.io) form URL (`https://formspree.io/f/xxxxxx`). Free plan = 50 sign-ups/month, sent to your inbox. Leave empty and the form opens the visitor's email app instead. |
| `videos.intro`, `videos.lesson1…3` | YouTube video IDs (the part after `v=`). Empty = "this video is being filmed" message. |
| `sessions` | Dates and status of each session (`open: true/false`) |
| `facts`, `levels`, `lessons`, `reasons` | Everything shown in "Program at a glance", the 3 levels, the lesson cards and "Why take the course?" |

Photos: replace `src/assets/img/ilyas-zakiat.png` with a square photo (at least 600 × 600 px).
To add campus / student photos, drop them in `src/assets/img/` and reference them from the page.

## 4. Deploying

### Option A — GitHub Pages (free; public repo, or a private repo with GitHub Pro / Student Pack)
1. Repository → **Settings → Pages → Source: GitHub Actions**.
2. Push to `main`: `.github/workflows/deploy.yml` builds, checks and publishes `dist/`.
3. Custom domain: in **Settings → Pages → Custom domain** enter `aimsummer.com` (the `CNAME` file is already in `src/static/`).
   At the registrar (GoDaddy): add four **A** records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`,
   and one **CNAME** record `www` → `<github-username>.github.io`. Tick "Enforce HTTPS" once the certificate is issued (≈ 1 hour).

### Option B — Netlify (free; private repo is fine)
1. app.netlify.com → **Add new site → Import from Git** → pick the repo. `netlify.toml` already sets the build command and the `dist` folder.
2. **Domain management → Add custom domain** → follow the DNS instructions (one `A`/`ALIAS` record + one `CNAME`). HTTPS is automatic.

Both options rebuild the site on every push — that is the "push on every change" workflow.

## 5. Working on the site — conventions

* Branch from `main` for anything bigger than a typo (`feat/lesson-4`, `fix/form-label`), open a pull request, let CI pass, merge.
* Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `feat: …`, `fix: …`, `docs: …`, `chore: …`, `content: …`.
* Keep the three colours. `npm run check` fails if a new colour sneaks into the CSS.
* Every page needs a unique `<title>`, a meta description and exactly one `<h1>` (the checker enforces it).
* Images: SVG for illustrations, JPG/WebP ≤ 300 KB for photos, always with an `alt` text.
* Never commit `dist/` — it is rebuilt by CI.

## 6. Accessibility & performance notes

Keyboard-navigable menu and modal, visible focus rings, `prefers-reduced-motion` respected, semantic landmarks, one self-hosted font family pair (no third-party requests), no tracking cookies, `youtube-nocookie` embeds loaded only on play.
