# Production setup runbook

This runbook prepares a **new, empty Supabase project** for the KTCT quiz
platform. Do not run it against a project that contains unrelated application
data. Stop at the first failed command or unexpected count.

## 1. Keep secrets out of the repository

Copy the variable names from `.env.example` into an ignored local environment
file or the current shell. Supply real values only at execution time.

Hosted runtime variables:

- `NEXT_PUBLIC_SITE_URL`: the final HTTPS origin, with no path.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`: server secret; never expose it to browser code.

One-time local setup variables:

- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`: at least 12 characters.
- `INITIAL_ADMIN_FULL_NAME`

Do not put the initial administrator password in Sites runtime configuration.
Remove it from the shell after setup.

## 2. Run the local preflight

With the four hosted runtime variables present:

```powershell
npm run production:preflight
```

The command must report 12 ordered migrations, the counts `1/6/497/1988`,
and a `1200x630` social preview. It intentionally exits non-zero when any
required variable or artifact is missing.

## 3. Apply every migration in order

Use the Supabase CLI authenticated to the real target project. Link the local
directory interactively so the project reference is not written into this
runbook, then preview and apply the migrations:

```powershell
supabase link
supabase db push --linked --dry-run --include-all
supabase db push --linked --include-all
```

Confirm the dry run lists every file under `supabase/migrations` in lexical
order, ending with `202607290012_production_bootstrap.sql`. Do not continue if
the target project is wrong, a migration is omitted, or the CLI reports an
error. The final migration creates a service-role-only, one-time initial-admin
bootstrap and removes the source-number uniqueness rule that conflicts with
the verified repeated numbering in Chapter 6.

If the Supabase CLI is unavailable, use the SQL editor only for a fresh
project: execute each file in the exact order printed by the preflight, one
file at a time, and stop on the first error. Do not concatenate, reorder, or
mark a failed file as applied.

## 4. Create the first administrator and seed KTCT

Set the three `INITIAL_ADMIN_*` variables in the current shell, then run:

```powershell
npm run production:setup
```

The script:

1. finds the requested Auth user or creates and confirms it once;
2. promotes only that matching profile through the service-role bootstrap;
3. inserts or resumes the deterministic `seed/ktct.json` import;
4. publishes the imported questions only after all four options exist;
5. fails if it encounters unexpected existing content; and
6. verifies the exact final counts.

It never prints keys or passwords. A rerun keeps an existing matching
administrator and a complete seed. It refuses to replace a different initial
administrator or silently delete unexpected data.

Run the independent count check afterward:

```powershell
npm run production:verify
```

Required output:

```text
courses=1
chapters=6
questions=497
published_question_options=1988
```

## 5. Configure Supabase Auth

After the real production origin exists, configure Supabase Auth with:

- the deployed origin as the Site URL;
- the deployed origin plus `/auth/callback`;
- the deployed origin plus `/reset-password`; and
- email confirmation enabled for student sign-up.

Save the settings, then test a real confirmation email and a real password
reset. Local code cannot verify or complete this provider-side configuration.

## 6. Configure and deploy Sites

Set the four hosted runtime variables in Sites runtime environment management.
Do not add secrets or project identifiers to `.openai/hosting.json`.

Create and deploy the Sites project only once, following the Sites deployment
handoff. This repository deliberately leaves `.openai/hosting.json` unchanged
until the deployment owner supplies a real project identifier.

## 7. Live smoke checks

After deployment, run:

```powershell
npm run production:smoke
```

The command checks the home page, authentication pages, callback, protected
student routes, and the protected admin route. It fails on server errors,
missing public pages, or protected routes that do not redirect signed-out
visitors to `/login`.

Then complete the authenticated production checks manually:

1. register a student and confirm the real email;
2. sign in, reload, and confirm session restoration;
3. answer one practice question and see immediate feedback;
4. start a mock exam, answer and flag, reload, review, and submit;
5. verify the result appears in history;
6. sign in as the initial administrator and open the content list.

Record the deployed URL and completion evidence outside the repository. Never
paste credentials, password-reset links, or service-role values into a report.
