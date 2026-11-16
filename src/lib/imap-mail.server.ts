// Server-only: extra Gmail inboxes via IMAP (read) + SMTP (send) using a Gmail App Password.
// The app password is stored encrypted in workspace_secrets and never leaves the server.
import tls from "node:tls";
import PostalMime from "postal-mime";
import { ingestInbound } from "./channels.server";
import { parseEmailBody } from "./email-format";
import { shouldImportEmail } from "./email-filter";

export const passKind = (connectionId: string) => `gmail_pass:${connectionId}`;

class Conn {
  private buf = Buffer.alloc(0);
  private waiters: (() => void)[] = [];
  private err: Error | null = null;
  constructor(private s: tls.TLSSocket) {
    s.on("data", (d: Buffer) => {
      this.buf = Buffer.concat([this.buf, d]);
      this.wake();
    });
    s.on("error", (e) => {
      this.err = e;
      this.wake();
    });
    s.on("close", () => {
      this.err ??= new Error("Connection closed");
      this.wake();
    });
  }
  private wake() {
    const w = this.waiters;
    this.waiters = [];
    w.forEach((f) => f());
  }
  static open(host: string, port: number) {
    return new Promise<Conn>((res, rej) => {
      const s = tls.connect({ host, port, servername: host }, () => res(new Conn(s)));
      s.once("error", rej);
      setTimeout(() => rej(new Error("Mail server timeout")), 15000);
    });
  }
  /** Waits until `done(text)` returns an index (end of response); returns and consumes it. */
  async until(done: (t: string) => number) {
    const deadline = Date.now() + 20000;
    for (;;) {
      const t = this.buf.toString("latin1");
      const i = done(t);
      if (i >= 0) {
        this.buf = this.buf.subarray(i);
        return t.slice(0, i);
      }
      if (this.err) throw this.err;
      if (Date.now() > deadline) throw new Error("Mail server timeout");
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 1000);
      });
    }
  }
  write(s: string) {
    this.s.write(s);
  }
  close() {
    try {
      this.s.end();
    } catch {
      /* ignore */
    }
  }
}

const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

async function imapSession<T>(
  user: string,
  pass: string,
  fn: (cmd: (c: string) => Promise<string>) => Promise<T>,
) {
  const c = await Conn.open("imap.gmail.com", 993);
  try {
    await c.until((t) => (t.indexOf("\r\n") >= 0 ? t.indexOf("\r\n") + 2 : -1));
    let n = 0;
    const cmd = async (line: string) => {
      const tag = `A${++n}`;
      c.write(`${tag} ${line}\r\n`);
      const out = await c.until((t) => {
        const m = new RegExp(`(^|\\r\\n)${tag} (OK|NO|BAD)[^\\r]*\\r\\n`).exec(t);
        return m ? m.index + m[0].length : -1;
      });
      const status = new RegExp(`${tag} (OK|NO|BAD)([^\\r]*)`).exec(out);
      if (status?.[1] !== "OK")
        throw new Error(
          /AUTHENTICATIONFAILED|Invalid credentials/i.test(out)
            ? "Gmail rejected the email or app password."
            : `Mail server: ${(status?.[2] ?? "").trim().slice(0, 150)}`,
        );
      return out;
    };
    await cmd(`LOGIN ${q(user)} ${q(pass)}`);
    const r = await fn(cmd);
    c.write(`Z LOGOUT\r\n`);
    return r;
  } finally {
    c.close();
  }
}

export async function testImap(user: string, pass: string) {
  await imapSession(user, pass, async (cmd) => {
    await cmd("SELECT INBOX");
  });
}

/** Extracts literal message bodies from a UID FETCH response. */
export function parseFetch(out: string) {
  const res: { uid: string; raw: string }[] = [];
  const re = /\* \d+ FETCH \(([^{]*)\{(\d+)\}\r\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(out))) {
    const uid = /UID (\d+)/.exec(m[1] ?? "")?.[1];
    const len = Number(m[2]);
    const raw = out.slice(re.lastIndex, re.lastIndex + len);
    re.lastIndex += len;
    if (uid) res.push({ uid, raw });
  }
  return res;
}

const toBytes = (latin1: string) => Uint8Array.from(latin1, (ch) => ch.charCodeAt(0));

export async function syncImap(ws: string, connectionId: string, address: string, pass: string) {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 7 * 86400000);
  const d = `${since.getUTCDate()}-${"Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[since.getUTCMonth()]}-${since.getUTCFullYear()}`;
  let n = 0;
  await imapSession(address, pass, async (cmd) => {
    await cmd("EXAMINE INBOX");
    const s = await cmd(`UID SEARCH SINCE ${d}`);
    const uids = (/\* SEARCH([\d ]*)/.exec(s)?.[1] ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(-25);
    if (!uids.length) return;
    const ext = (u: string) => `im:${connectionId}:${u}`;
    const { data: have } = await sb
      .from("messages")
      .select("external_id")
      .eq("workspace_id", ws)
      .in("external_id", uids.map(ext));
    const seen = new Set((have ?? []).map((r) => r.external_id));
    const todo = uids.filter((u) => !seen.has(ext(u)));
    if (!todo.length) return;
    const out = await cmd(`UID FETCH ${todo.join(",")} (UID BODY.PEEK[])`);
    for (const { uid, raw } of parseFetch(out)) {
      const mail = await PostalMime.parse(toBytes(raw));
      const from = (mail.from?.address ?? "").toLowerCase();
      if (!from || from === address.toLowerCase()) continue;
      const headers: Record<string, string> = {};
      for (const h of mail.headers ?? []) headers[h.key.toLowerCase()] = h.value;
      let text = mail.text ?? "";
      if (!text && mail.html)
        text = mail.html
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ");
      const body = parseEmailBody(text).main;
      const { data: known } = await sb
        .from("contacts")
        .select("id")
        .eq("workspace_id", ws)
        .ilike("email", from)
        .limit(1)
        .maybeSingle();
      if (
        !shouldImportEmail(
          { from, subject: mail.subject ?? "", body, headers, labels: [] },
          !!known,
        )
      )
        continue;
      await ingestInbound(ws, "email", {
        from,
        name: mail.from?.name || from,
        externalMessageId: ext(uid),
        connectionId,
        text: (mail.subject ? `Subject: ${mail.subject}\n\n` : "") + body,
        at: mail.date ? new Date(mail.date) : undefined,
      });
      n++;
    }
  });
  await sb
    .from("channel_connections")
    .update({ last_checked_at: new Date().toISOString(), last_error: null })
    .eq("id", connectionId);
  return n;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
// eslint-disable-next-line no-control-regex -- intentional: "is this header plain ASCII?"
const mimeHdr = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

export async function sendSmtp(
  address: string,
  pass: string,
  to: string,
  subject: string,
  body: string,
  label: string,
) {
  if (/[\r\n<>]/.test(to) || /[\r\n<>]/.test(address)) throw new Error("Invalid address.");
  const c = await Conn.open("smtp.gmail.com", 465);
  const reply = () =>
    c.until((t) => {
      const m = /(^|\r\n)\d{3} [^\r]*\r\n/.exec(t);
      return m ? m.index + m[0].length : -1;
    });
  const step = async (line: string | null, ok: string) => {
    if (line !== null) c.write(line + "\r\n");
    const r = await reply();
    const last = r.trim().split("\r\n").pop() ?? "";
    if (!last.startsWith(ok))
      throw new Error(
        /535/.test(last)
          ? "Gmail rejected the app password."
          : `Mail server: ${last.slice(0, 150)}`,
      );
  };
  try {
    await step(null, "220");
    await step("EHLO tuktuk24.app", "250");
    await step(`AUTH PLAIN ${Buffer.from(`\0${address}\0${pass}`).toString("base64")}`, "235");
    await step(`MAIL FROM:<${address}>`, "250");
    await step(`RCPT TO:<${to}>`, "250");
    await step("DATA", "354");
    const msgId = `<${crypto.randomUUID()}@tuktuk24>`;
    const msg = [
      `From: ${mimeHdr(label)} <${address}>`,
      `To: <${to}>`,
      `Subject: ${mimeHdr(subject.replace(/[\r\n]/g, " "))}`,
      `Message-ID: ${msgId}`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      (b64(body).match(/.{1,76}/g) ?? []).join("\r\n"),
    ].join("\r\n");
    await step(`${msg}\r\n.`, "250");
    c.write("QUIT\r\n");
    return msgId;
  } finally {
    c.close();
  }
}
