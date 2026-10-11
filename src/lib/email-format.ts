// Splits an email body into a clean reply, an optional subject and the quoted history.
const QUOTE_START = [
  /^\s*On\b[\s\S]{0,300}?\b(wrote|escreveu|a écrit|schrieb|escribió|ha scritto)\s*:/im,
  /^\s*(Em|Le|Am|El|Il)\s[\s\S]{0,300}?\b(escreveu|a écrit|schrieb|escribió|ha scritto)\s*:/im,
  /^\s*-{2,}\s*(Original Message|Forwarded message|Mensagem original)/im,
  /^\s*From:\s.+\n\s*(Sent|Date):/im,
  /^\s*_{5,}\s*$/m,
];

export type ParsedEmail = { subject: string | null; main: string; quoted: string | null };

export function parseEmailBody(raw: string): ParsedEmail {
  let text = (raw ?? "").replace(/\r\n/g, "\n");
  let subject: string | null = null;
  const sm = text.match(/^Subject:\s*(.*)\n+/);
  if (sm) { subject = sm[1]!.trim() || null; text = text.slice(sm[0].length); }
  let cut = -1;
  for (const re of QUOTE_START) {
    const m = re.exec(text);
    if (m && (cut < 0 || m.index < cut)) cut = m.index;
  }
  if (cut < 0) { const m = /^>.*$/m.exec(text); if (m) cut = m.index; }
  const main = (cut >= 0 ? text.slice(0, cut) : text).replace(/\n{3,}/g, "\n\n").trim();
  const quoted = cut >= 0 ? text.slice(cut).replace(/\n{3,}/g, "\n\n").trim() : null;
  if (!main && quoted) return { subject, main: quoted, quoted: null };
  return { subject, main, quoted: quoted || null };
}

/** Strips a leading "Re:/Fwd:" chain for display. */
export const cleanSubject = (s: string) => s.replace(/^((re|fw|fwd|enc|res)\s*:\s*)+/i, "").trim();
