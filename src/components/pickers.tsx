import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { NativeSelect } from "@/components/kit";

/** Simple selects for linking records. Lists are capped; type-ahead search lives on each page. */
export function ContactSelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  const { workspaceId } = useWorkspace();
  const q = useQuery({
    queryKey: ["contacts", "picker", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, full_name, email")
        .eq("workspace_id", workspaceId)
        .is("merged_into", null)
        .order("full_name")
        .limit(500);
      return data ?? [];
    },
  });
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No contact</option>
      {q.data?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.full_name}
          {c.email ? ` (${c.email})` : ""}
        </option>
      ))}
    </NativeSelect>
  );
}

export function LeadSelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  const { workspaceId } = useWorkspace();
  const q = useQuery({
    queryKey: ["leads", "picker", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, title")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(300);
      return data ?? [];
    },
  });
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No lead</option>
      {q.data?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </NativeSelect>
  );
}

export function BookingSelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  const { workspaceId } = useWorkspace();
  const q = useQuery({
    queryKey: ["bookings", "picker", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, reference, tour_name")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(300);
      return data ?? [];
    },
  });
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No booking</option>
      {q.data?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.reference} · {c.tour_name}
        </option>
      ))}
    </NativeSelect>
  );
}

export function MemberSelect({
  value,
  onChange,
  id,
  emptyLabel = "Unassigned",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const { members } = useWorkspace();
  return (
    <NativeSelect
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      <option value="">{emptyLabel}</option>
      {members
        .filter((m) => m.active)
        .map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.full_name || m.email}
          </option>
        ))}
    </NativeSelect>
  );
}
