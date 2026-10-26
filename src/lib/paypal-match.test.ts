import { describe, expect, it } from "vitest";
import { matchTxn, paymentStatusFrom } from "./paypal-match";

const bk = (id: string, reference: string, amount: number, email: string | null) => ({ id, reference, amount, currency: "EUR", email, status: "confirmed" });
const tx = (o: Partial<Parameters<typeof matchTxn>[0]>) => ({ txn_id: "T", amount: 60, currency: "EUR", status: "S", payer_email: null, reference_text: null, ...o });

describe("PayPal matching", () => {
  it("matches by booking reference in the note", () => {
    expect(matchTxn(tx({ reference_text: "Tour TT-1042 thanks" }), [bk("a", "TT-1042", 60, null), bk("b", "TT-104", 60, null)])).toEqual({ booking_id: "a", kind: "reference" });
  });
  it("matches by payer email and exact amount when only one booking fits", () => {
    expect(matchTxn(tx({ payer_email: "Ann@x.com" }), [bk("a", "R1", 60, "ann@x.com"), bk("b", "R2", 90, "ann@x.com")])).toEqual({ booking_id: "a", kind: "email_amount" });
  });
  it("leaves ambiguous payments unmatched", () => {
    expect(matchTxn(tx({ payer_email: "ann@x.com" }), [bk("a", "R1", 60, "ann@x.com"), bk("b", "R2", 60, "ann@x.com")])).toBeNull();
  });
  it("never matches on amount alone", () => {
    expect(matchTxn(tx({}), [bk("a", "R1", 60, "ann@x.com")])).toBeNull();
  });
});

describe("payment status from PayPal", () => {
  it("full amount completed is paid", () => expect(paymentStatusFrom(110, [{ amount: 110, status: "S" }])).toBe("paid"));
  it("deposit is partly paid", () => expect(paymentStatusFrom(110, [{ amount: 30, status: "S" }])).toBe("partially_paid"));
  it("pending money is not counted", () => expect(paymentStatusFrom(110, [{ amount: 110, status: "P" }])).toBeNull());
  it("fully refunded is refunded", () => expect(paymentStatusFrom(110, [{ amount: 110, status: "S" }, { amount: -110, status: "S" }])).toBe("refunded"));
});
