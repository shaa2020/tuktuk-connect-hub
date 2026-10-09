import { describe, expect, it } from "vitest";
import {
  canAssignTo, canDeleteBookings, canDeleteContacts, canManageTeam, canSeeConversation,
  canSendOnChannel, canViewAudit,
} from "./domain";

describe("role permissions", () => {
  it("only admins manage the team", () => {
    expect(canManageTeam("admin")).toBe(true);
    expect(canManageTeam("manager")).toBe(false);
    expect(canManageTeam("agent")).toBe(false);
  });
  it("audit log is restricted to admins and managers", () => {
    expect(canViewAudit("manager")).toBe(true);
    expect(canViewAudit("agent")).toBe(false);
  });
  it("agents cannot delete contacts or bookings", () => {
    expect(canDeleteContacts("agent")).toBe(false);
    expect(canDeleteBookings("manager")).toBe(false);
    expect(canDeleteBookings("admin")).toBe(true);
  });
  it("agents can only assign conversations to themselves", () => {
    expect(canAssignTo("agent", "me", "someone-else")).toBe(false);
    expect(canAssignTo("agent", "me", "me")).toBe(true);
    expect(canAssignTo("manager", "me", "someone-else")).toBe(true);
  });
  it("agents only see their own or allowed unassigned conversations", () => {
    expect(canSeeConversation("agent", "me", "other", true)).toBe(false);
    expect(canSeeConversation("agent", "me", null, false)).toBe(false);
    expect(canSeeConversation("agent", "me", null, true)).toBe(true);
    expect(canSeeConversation("manager", "me", "other", false)).toBe(true);
  });
  it("no channel sending without a real connection", () => {
    expect(canSendOnChannel("whatsapp", false)).toBe(false);
    expect(canSendOnChannel("manual", true)).toBe(false);
  });
});
