import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { getPublicTicket } from "@/lib/tickets.functions";
import { payLabel, TICKET_BASE_URL } from "@/lib/tickets";
import { BrandMark } from "@/components/brand";

export const Route = createFileRoute("/ticket/$token")({
  loader: ({ params }) => (/^[0-9a-f-]{36}$/.test(params.token) ? getPublicTicket({ data: { token: params.token } }) : null),
  head: () => ({ meta: [
    { title: "Your tour ticket — Tuk Tuk 24 Lisbon" }, { name: "description", content: "Your Tuk Tuk 24 Lisbon tour ticket." },
    { property: "og:title", content: "Your tour ticket — Tuk Tuk 24 Lisbon" }, { property: "og:description", content: "Show this ticket to your driver." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: TicketPage,
});

function TicketPage() {
  const t = Route.useLoaderData();
  const { token } = Route.useParams();
  const [qr, setQr] = useState("");
  useEffect(() => { QRCode.toDataURL(`${TICKET_BASE_URL}/ticket/${token}`, { margin: 1, width: 480 }).then(setQr).catch(() => {}); }, [token]);
  if (!t) return <main className="grid min-h-dvh place-items-center bg-sidebar p-6 text-center text-sidebar-foreground"><p>This ticket isn't available. Please contact Tuk Tuk 24 Lisbon.</p></main>;
  const pay = payLabel(t.payment_status);
  const date = t.tour_date ? new Date(t.tour_date + "T00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "Date to be confirmed";
  return (
    <main className="min-h-dvh bg-sidebar px-4 py-6 text-sidebar-foreground">
      <h1 className="mx-auto mb-4 max-w-sm font-display text-xl font-bold">Your ticket</h1>
      <div className="relative mx-auto max-w-sm rounded-3xl bg-primary p-3">
        <div className="rounded-2xl bg-sidebar p-5">
          {t.completed && <div className="mx-auto mb-2 w-fit rounded-md bg-muted px-4 py-1.5 text-center text-sm font-extrabold tracking-wide text-muted-foreground">TOUR COMPLETED</div>}
          <div className={`mx-auto mb-4 w-fit rounded-md px-4 py-1.5 text-center text-sm font-extrabold tracking-wide ${pay.paid ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}`}>{pay.label}</div>
          <div className="mx-auto aspect-square w-52 rounded-2xl bg-card p-3">{qr && <img src={qr} alt="Ticket QR code" className="h-full w-full" />}</div>
          <div className="mt-5 flex justify-between border-b border-dashed border-sidebar-border pb-3 font-semibold"><span>{date}</span><span>{t.start_time ? t.start_time.slice(0, 5) : "Time TBC"}</span></div>
          <div className="border-b border-dashed border-sidebar-border py-3 font-semibold">{t.tour_name}</div>
          <div className="mt-4 rounded-xl bg-sidebar-accent p-3 text-center">
            <div className="font-semibold">{t.guest ?? "Guest"}{t.guests ? ` · ${t.guests} guest${t.guests > 1 ? "s" : ""}` : ""}</div>
            <div className="font-mono text-sm opacity-80">{t.reference}</div>
          </div>
          <p className="mt-4 text-center text-sm opacity-90">{pay.detail}{!pay.paid && t.amount ? ` Amount: ${t.amount} ${t.currency}.` : ""}</p>
          {t.pickup_location && <p className="mt-2 text-center text-sm opacity-80">Pickup: {t.pickup_location}</p>}
          <CheckIn token={token} />
        </div>
        <div className="flex items-center justify-center gap-2 py-4 font-display text-lg font-extrabold text-primary-foreground"><BrandMark className="h-7 w-7" /> TUK TUK 24 LISBON</div>
      </div>
    </main>
  );
}
