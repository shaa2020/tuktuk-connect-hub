# Fix: AI Operator hands chats over instead of replying

## What is happening

The activity log shows repeated handovers with the note "The AI could not understand this conversation" — including on the latest WhatsApp chat where the guest clearly wrote "Lisbon old town / 13-10-2026 / 1 / Hotel Marriott". The AI request itself succeeds every time (checked the AI request log: all 200 OK). The problem is the AI's answer sometimes comes back in a shape the app's reader cannot parse, and the app's safety rule is: unreadable answer → hand the chat to the team and send nothing. So the guest gets no reply and you get a handover alert.

## Fix

1. **Guaranteed-readable answers** — when the AI Operator asks the AI for a decision, request the answer in a strict, enforced JSON format (structured output on the AI gateway) instead of relying on the AI to follow written instructions. This removes the main cause of unreadable answers.

2. **Fallback so the guest is never left silent** — if an answer still cannot be parsed but contains readable text, send that text to the guest as the reply instead of handing over silently. Only hand over when there is truly nothing usable.

3. **Better diagnostics** — when parsing fails, log a short excerpt of what the AI actually said (no guest data beyond what is already logged) so future issues are identifiable from the activity log.

4. **Tests** — add checks that a plain-text AI answer becomes a guest reply (not a handover), and that the structured-output request is shaped correctly.

## Technical details

- `src/lib/ai-gateway.server.ts`: add optional `text.format` json_schema parameter to `generateText` (Responses API structured output).
- `src/lib/ai-provider.server.ts`: pass the schema option through `generate` for the Lovable provider path.
- `src/lib/ai-operator.server.ts`: pass the operator decision schema (action/reply/tags/urgent/alert/booking); on parse failure with non-empty raw text, treat the raw text as the reply and log the excerpt.
- `src/lib/ai-operator.ts` / `ai-operator.test.ts`: add a `looksLikeDecision` helper + tests for the fallback path.
- Verify with the existing test suite and a live "Run now" from the AI Operator panel.

## Out of scope

No changes to handover rules themselves (upset guests, refunds, human requests still hand over — but always with a reply sent first, as today).
