import postgres from "postgres";

// Connects to the throwaway database started by scripts/db-test/run.sh.
export const url = process.env.DATABASE_TEST_URL;
if (!url) throw new Error("DATABASE_TEST_URL missing — run: bash scripts/db-test/run.sh");
export const sql = postgres(url, { max: 1, onnotice: () => {} });

export type Ids = Record<string, string>;
let seq = 0;

/** Creates an auth user + profile as the superuser (setup only). */
export async function makeUser(label: string, confirmed = true): Promise<string> {
  seq++;
  const email = `${label}-${seq}-${Date.now()}@example.test`;
  const [u] =
    await sql`insert into auth.users(email, email_confirmed_at) values (${email}, ${confirmed ? new Date() : null}) returning id`;
  await sql`insert into public.profiles(id, email, full_name) values (${u.id}, ${email}, ${label}) on conflict (id) do nothing`;
  return u.id as string;
}

/** Creates a workspace with an admin, as setup (bypasses RLS). */
export async function makeWorkspace(name: string, adminId: string, plan = "free"): Promise<string> {
  const [{ has }] =
    await sql`select exists (select 1 from information_schema.columns where table_name = 'workspaces' and column_name = 'owner_id') has`;
  const [w] = has
    ? await sql`insert into public.workspaces(name, plan, owner_id) values (${name}, ${plan}, ${adminId}) returning id`
    : await sql`insert into public.workspaces(name, plan) values (${name}, ${plan}) returning id`;
  await sql`insert into public.workspace_members(workspace_id, user_id, role) values (${w.id}, ${adminId}, 'admin')`;
  return w.id as string;
}
export async function addMember(ws: string, userId: string, role: "admin" | "manager" | "agent") {
  await sql`insert into public.workspace_members(workspace_id, user_id, role) values (${ws}, ${userId}, ${role})`;
}

/**
 * Runs `fn` exactly as the browser would: role `authenticated` with the user's JWT subject,
 * inside a transaction that is always rolled back.
 */
export async function asUser<T>(
  userId: string | null,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  let out!: T;
  let err: unknown;
  await sql
    .begin(async (tx) => {
      await tx.unsafe(`set local role ${userId ? "authenticated" : "anon"}`);
      await tx`select set_config('request.jwt.claim.sub', ${userId ?? ""}, true)`;
      try {
        out = await fn(tx);
      } catch (e) {
        err = e;
      }
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
  if (err) throw err;
  return out;
}
class Rollback extends Error {}

/** Same as asUser but with the service role (server code). */
export async function asService<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let out!: T;
  let err: unknown;
  await sql
    .begin(async (tx) => {
      await tx.unsafe("set local role service_role");
      try {
        out = await fn(tx);
      } catch (e) {
        err = e;
      }
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
  if (err) throw err;
  return out;
}
