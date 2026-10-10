<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Business data is scoped by `workspace_id`; access is enforced by RLS helpers (`is_member`, `has_ws_role`, `can_view_conversation`) — UI checks in `src/lib/domain.ts` only mirror them.
- CRUD runs from the browser client under RLS; multi-row or privileged operations are SECURITY DEFINER RPCs that check the caller's role first — keeps logic atomic and server-enforced.
- The app may only insert messages with status `logged`; channel delivery statuses come solely from server-side webhook handlers — prevents fake delivery states.
- Protected pages live under `src/routes/_authenticated/` (client-only gate, redirect to `/auth`).
- Sample data is flagged `is_demo` and labelled "[SAMPLE]" — never mixed with real records.
- tsconfig relaxes exactOptionalPropertyTypes / noPropertyAccessFromIndexSignature / noImplicitReturns — generated DB types are incompatible with them.
