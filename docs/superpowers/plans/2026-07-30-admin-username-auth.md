# Admin Username Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép đăng nhập production bằng `admin`/`1`, gắn đúng vai trò quản trị và tự phục hồi khi trình duyệt giữ JWT của một tài khoản đã bị xóa.

**Architecture:** Trình duyệt gửi định danh và mật khẩu đến route cùng nguồn `/api/auth/login`. Route phía máy chủ ánh xạ riêng `admin` sang `admin@ktct.example`, đăng nhập qua Supabase SSR và ghi cookie phiên vào response; email học viên không thay đổi. Nếu Supabase trả lỗi JWT mồ côi, route xóa phiên cục bộ rồi thử đăng nhập lại một lần.

**Tech Stack:** Next.js/Vinext route handlers, React 19, TypeScript, `@supabase/ssr`, Supabase Auth Admin API, Vitest, Cloudflare Workers.

## Global Constraints

- Chỉ tạo một tài khoản vai trò `admin`; không tạo tài khoản Giảng viên.
- Tên đăng nhập công khai là `admin`; định danh kỹ thuật `admin@ktct.example` chỉ tồn tại phía máy chủ.
- Mật khẩu yêu cầu là `1`.
- Service-role không được đưa vào source, log, HTML hoặc bundle trình duyệt.
- Nếu Supabase hosted không cho phép mật khẩu một ký tự, dừng bước tạo tài khoản và báo giới hạn thật; không báo thành công giả.
- Mọi thay đổi mã nguồn phải đi theo Red-Green-Refactor.

---

### Task 1: Route đăng nhập cùng nguồn và ánh xạ `admin`

**Files:**
- Create: `src/features/auth/login-identifier.ts`
- Create: `app/api/auth/login/route.ts`
- Modify: `src/lib/supabase/browser.ts`
- Modify: `app/(auth)/login/page.tsx`
- Create: `tests/auth-login-route.test.ts`
- Modify: `tests/browser-auth.test.ts`
- Modify: `tests/public-entry.test.tsx`

**Interfaces:**
- Produces: `normalizeLoginIdentifier(identifier: string): string`.
- Produces: `isOrphanJwtError(error: { message?: string } | null): boolean`.
- Produces: `POST /api/auth/login` accepting `{ identifier: string; password: string }` and returning `{ error: string | null }`.
- Changes: `signIn(identifier: string, password: string)` calls the same-origin API in production.

- [ ] **Step 1: Write failing identifier and orphan-JWT tests**

```ts
expect(normalizeLoginIdentifier(" admin ")).toBe("admin@ktct.example");
expect(normalizeLoginIdentifier("Student@Example.com")).toBe(
  "student@example.com",
);
expect(
  isOrphanJwtError({
    message: "User from sub claim in JWT does not exist",
  }),
).toBe(true);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/auth-login-route.test.ts`

Expected: FAIL because `login-identifier.ts` and its exports do not exist.

- [ ] **Step 3: Implement the server-only normalization helpers**

```ts
export const INTERNAL_ADMIN_EMAIL = "admin@ktct.example";

export function normalizeLoginIdentifier(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  return normalized === "admin" ? INTERNAL_ADMIN_EMAIL : normalized;
}

export function isOrphanJwtError(
  error: { message?: string } | null | undefined,
) {
  return error?.message
    ?.toLowerCase()
    .includes("user from sub claim in jwt does not exist") ?? false;
}
```

- [ ] **Step 4: Verify helper tests are GREEN**

Run: `npm test -- tests/auth-login-route.test.ts`

Expected: PASS for normalization and error classification.

- [ ] **Step 5: Add a failing route test**

Mock `createServerSupabaseClient()` with `signInWithPassword` and `signOut`. Assert:

```ts
expect(signInWithPassword).toHaveBeenCalledWith({
  email: "admin@ktct.example",
  password: "1",
});
```

Add a second case where the first sign-in returns the orphan-JWT error and the second succeeds:

```ts
expect(signOut).toHaveBeenCalledWith({ scope: "local" });
expect(signInWithPassword).toHaveBeenCalledTimes(2);
```

- [ ] **Step 6: Run route tests and verify RED**

Run: `npm test -- tests/auth-login-route.test.ts`

Expected: FAIL because `POST /api/auth/login` is missing.

- [ ] **Step 7: Implement the route**

The route must:

1. Parse `identifier` and `password`.
2. Create `NextResponse.json({ error: null })` before creating the SSR client so cookie writes target that response.
3. Normalize the identifier on the server.
4. Attempt `signInWithPassword`.
5. On `isOrphanJwtError`, call `signOut({ scope: "local" })` and retry once.
6. Return status `401` with the Supabase message on authentication failure.
7. Return the cookie-bearing response on success.

- [ ] **Step 8: Verify route tests are GREEN**

Run: `npm test -- tests/auth-login-route.test.ts`

Expected: PASS.

- [ ] **Step 9: Add a failing browser adapter test**

In `tests/browser-auth.test.ts`, mock `fetch` and assert:

```ts
expect(fetch).toHaveBeenCalledWith("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ identifier: "admin", password: "1" }),
});
```

- [ ] **Step 10: Run browser-auth tests and verify RED**

Run: `npm test -- tests/browser-auth.test.ts`

Expected: FAIL because production `signIn` still calls Supabase directly.

- [ ] **Step 11: Route production sign-in through `/api/auth/login`**

Keep the existing `NEXT_PUBLIC_E2E_MODE` branch. Replace the production branch with same-origin `fetch`, parse `{ error }`, and return the existing `{ data: null, error }` shape used by `LoginPage`.

- [ ] **Step 12: Update login copy and input semantics**

Change the label to `Tên đăng nhập hoặc email`, change `name="email"` to `name="identifier"`, use `type="text"` and `autoComplete="username"`, and pass `identifier` to `signIn`.

- [ ] **Step 13: Verify Task 1**

Run:

```powershell
npm test -- tests/auth-login-route.test.ts tests/browser-auth.test.ts tests/public-entry.test.tsx
npm run typecheck
npm run lint
```

Expected: all commands exit `0`.

- [ ] **Step 14: Commit Task 1**

```powershell
git add -- 'src/features/auth/login-identifier.ts' 'app/api/auth/login/route.ts' 'src/lib/supabase/browser.ts' 'app/(auth)/login/page.tsx' 'tests/auth-login-route.test.ts' 'tests/browser-auth.test.ts' 'tests/public-entry.test.tsx'
git commit -m "feat: support admin username login"
```

---

### Task 2: Đồng bộ giới hạn mật khẩu ở giao diện

**Files:**
- Modify: `app/(auth)/register/page.tsx`
- Modify: `app/(auth)/reset-password/page.tsx`
- Modify: `tests/public-entry.test.tsx`

**Interfaces:**
- Consumes: chính sách mật khẩu production thấp nhất mà Supabase hosted chấp nhận.
- Produces: form không tự chặn mật khẩu ngắn hơn chính sách máy chủ.

- [ ] **Step 1: Add a failing form-policy test**

Render `RegisterPage` and `ResetPasswordPage`, then assert every password textbox has no `minlength` attribute:

```ts
for (const input of screen.getAllByLabelText(/mật khẩu/i)) {
  expect(input).not.toHaveAttribute("minlength");
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/public-entry.test.tsx`

Expected: FAIL because the registration and reset inputs currently have `minLength={8}`.

- [ ] **Step 3: Remove only the client-side minimum length**

Delete `minLength={8}` from both password fields on both pages. Preserve required fields, password confirmation and all existing error messages.

- [ ] **Step 4: Verify Task 2**

Run:

```powershell
npm test -- tests/public-entry.test.tsx
npm run typecheck
npm run lint
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- 'app/(auth)/register/page.tsx' 'app/(auth)/reset-password/page.tsx' 'tests/public-entry.test.tsx'
git commit -m "fix: align password forms with auth policy"
```

---

### Task 3: Cấu hình Supabase và tạo tài khoản production

**Files:**
- No source file changes.
- Operational target: Supabase project `yoxgvrsounnotrufakkz`.

**Interfaces:**
- Consumes: Supabase Auth project settings and server-side service-role credential.
- Produces: confirmed Auth user `admin@ktct.example`, public profile role `admin`, password `1`.

- [ ] **Step 1: Test current hosted password policy**

Call the Auth Admin create-user endpoint with:

```json
{
  "email": "admin@ktct.example",
  "password": "1",
  "email_confirm": true,
  "user_metadata": {
    "full_name": "ADMIN",
    "requested_role": "admin"
  }
}
```

Expected before configuration: a weak-password error if the current minimum exceeds one.

- [ ] **Step 2: Lower the Auth password minimum in Supabase Dashboard**

Open Authentication settings, set the minimum password length to `1`, remove required-character rules, save, and read the saved value back.

If the hosted dashboard refuses a value below its platform minimum, stop Task 3 and report the exact accepted minimum; do not create a different password silently.

- [ ] **Step 3: Upsert the Auth user**

List users through the server-side Admin API. If `admin@ktct.example` exists, update it; otherwise create it. Set:

```json
{
  "email": "admin@ktct.example",
  "password": "1",
  "email_confirm": true,
  "user_metadata": {
    "full_name": "ADMIN",
    "requested_role": "admin"
  }
}
```

- [ ] **Step 4: Promote the generated profile**

Using the trusted service-role database client, update the matching `public.profiles` row to:

```json
{
  "email": "admin@ktct.example",
  "full_name": "ADMIN",
  "role": "admin",
  "is_active": true
}
```

Read the row back and assert `role === "admin"` and `is_active === true`.

- [ ] **Step 5: Verify Auth independently**

Call `/auth/v1/token?grant_type=password` with `admin@ktct.example` and password `1`.

Expected: HTTP `200` with an access token whose `sub` matches the created user.

- [ ] **Step 6: Verify stale-JWT recovery**

Use an isolated test account to obtain a session, delete that account, then submit `admin`/`1` through `/api/auth/login` with the stale cookies.

Expected: HTTP `200`; response replaces stale cookies and does not expose `User from sub claim in JWT does not exist`.

Delete only the isolated test account after verification.

---

### Task 4: Build, deploy and production browser verification

**Files:**
- Build output only; no committed generated files.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: a Cloudflare Worker version serving the verified auth flow.

- [ ] **Step 1: Run the full local quality gate**

Run:

```powershell
npm test
npm run typecheck
npm run lint
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 2: Build with the production public environment**

Run `npm run build` with `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the non-secret sentinel string `build-time-runtime-secret` for the runtime-only service-role.

Assert:

```powershell
rg -l 'yoxgvrsounnotrufakkz\.supabase\.co' dist/client --glob '*.js'
rg 'admin@ktct\.example' dist/client --glob '*.js'
```

Expected: Supabase URL appears in a client bundle; internal admin email produces no matches.

- [ ] **Step 3: Deploy and restore the runtime secret**

Deploy `dist/server/wrangler.json` to Worker `ktct-luyen-thi-mac-lenin-2026` with the three public variables. Immediately upload `SUPABASE_SERVICE_ROLE_KEY` again because Wrangler does not retain an undeclared secret binding in the generated config.

- [ ] **Step 4: Verify production in Chrome**

At the public URL:

1. Enter `admin` and `1`.
2. Confirm redirect to `/dashboard`.
3. Open `/admin`.
4. Confirm the administration navigation and user-management page render.
5. Sign out and repeat once to verify session replacement.

- [ ] **Step 5: Commit any final test-only correction**

Only if production verification required a source correction, repeat its Red-Green cycle and commit that focused change. Otherwise leave the worktree clean.
