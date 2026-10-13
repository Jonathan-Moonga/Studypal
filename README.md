This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## StudyPal setup

The project uses Next.js 16, TypeScript, Tailwind CSS, and Supabase.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Add the Supabase URL and publishable key to `.env.local`. The initial database schema is in `supabase/migrations/20261010000000_initial_schema.sql`.

## Learning platform

The authenticated app includes onboarding, real Supabase-backed subjects, AI-assisted material import, curriculum sections, tagged questions, topic refreshers, timed section practice, original-order full-paper practice, answer tracking, score summaries, and a simple timetable.

To enable AI parsing, add `GEMINI_API_KEY` to `.env.local`. Without it, the import screen shows a clear configuration error and does not create partial AI data.

## ECZ corpus pipeline

The trusted bulk importer collects public ECZ Grade 7 and Grade 12 past papers (2016-2025) and official syllabi, and imports them into a named student's account.

1. **discover** reads eczsolutions.com, eczstudytool.com, zambianecz.org (per-subject JSON lists), zambiapastpapers.com (WordPress REST), g7quiz.maneja.net and Gidemy for papers; the CDC 2013 syllabus archive, Gidemy and zambianecz.org for syllabi; and zedpastpapers.com for marking schemes. There is one manifest row per distinct remote file, and the same Drive file listed on several sites is merged.
2. **download** fetches every file, rejects anything that is not an openable PDF, and marks byte-identical copies as `duplicate`.
3. **verify** reads each paper's cover with Gemini (`GEMINI_VERIFY_MODEL`, default `gemini-3.5-flash-lite`) and files it by what is printed there: subject, subject code, year, paper number, sitting and specimen status, rather than by the website's label. Mock or school-set papers, other grades and unreadable covers are `rejected`. Different scans of the same paper keep the most complete one and mark the rest `superseded`.
4. **register** uploads verified files to the student's account (syllabi first), and **process** extracts questions with page numbers, figure flags and AI-worked answer keys for multiple choice.

Identity is `grade / subject / year / sitting / paper / variant`. Grade 12 sittings are kept separate: *School Certificate* (also called Internal, including the joint November sitting) and *GCE* (External). Specimen and alternative papers are kept as their own variants. Grade 12 uses the 2013 Grade 10-12 syllabi that are still examined; the 2023 Form 1-4 syllabi are catalogued but only imported with `--include-new-curriculum`.

Keep `SUPABASE_SERVICE_ROLE_KEY` server-side in `.env.corpus.local`. Never add it to a `NEXT_PUBLIC_` variable or commit it. Apply `supabase/migrations/20261010160000_corpus_integrity.sql` before registering.

```bash
npm run ecz:discover
npm run ecz:download                 # add --retry-failed to retry transient failures
npm run ecz:verify                   # stops cleanly (exit 2) when the daily Gemini quota is reached
npm run ecz:audit                    # coverage grid, corrections, rejections -> .ecz-corpus/audit-report.json
npm run ecz:register -- --latest --grade12-subjects=account   --grade7-subjects="Mathematics,English,Integrated Science,Social Studies,Creative and Technology Studies,Special Paper 1,Special Paper 2,Zambian Language,Home Economics"   --grade7-language=Icibemba         # add --dry-run to print the plan without uploading
npm run ecz:process -- --limit=0 --approve --skip-passages
npm run ecz:approve                  # approve stored drafts that now pass the review rule, without calling Gemini
```

- `--latest` verifies, registers and processes only the newest verified paper for each grade, subject and paper number (School Certificate preferred on a tie), plus the syllabi.
- `--grade12-subjects=account` imports only subjects already in the Grade 12 student's account, mapped onto their names (e.g. English -> English Language, RE 2044/2046 -> Religious Education). `--grade7-subjects` lists the Grade 7 subjects to import, and `--grade7-language` picks the Zambian language paper.
- Extraction uses `GEMINI_EXTRACT_MODEL` (default `gemini-3.5-flash-lite`, free tier). A paper that comes back nearly empty is retried once on `GEMINI_FALLBACK_MODEL`. `--skip-passages` keeps reading passages on the original page instead of transcribing them, which avoids Gemini's recitation block on published excerpts.
- Questions are tagged only to syllabus units. A paper's printed "Section A/B" is stored as `paper_part`. A paper is held for review only for errors, or when more than 10% of its questions are uncertain; uncertain questions keep their own `needs_review` flag.

Processing defaults to five files per run so quotas and review quality can be checked. Any low-confidence or structurally invalid extraction stays in review. Marking schemes are catalogued separately and are excluded from question generation. Commercial textbooks are not scraped; only official or openly licensed books may be added to the manifest.
