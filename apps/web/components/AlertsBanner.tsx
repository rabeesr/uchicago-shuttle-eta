import { getSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function AlertsBanner() {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("alerts")
    .select("id, title, body, route_id, starts_at, ends_at")
    .limit(5);

  const now = Date.now();
  const active = (data ?? []).filter((a) => {
    const startsOk = !a.starts_at || new Date(a.starts_at).getTime() <= now;
    const endsOk = !a.ends_at || new Date(a.ends_at).getTime() >= now;
    return startsOk && endsOk;
  });

  if (active.length === 0) return null;

  return (
    <aside className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto max-w-6xl px-4 py-2 text-sm">
        {active.slice(0, 2).map((a) => (
          <div key={a.id} className="flex items-start gap-2">
            <span aria-hidden>⚠️</span>
            <div>
              {a.title && <span className="font-semibold">{a.title}</span>}
              {a.title && a.body ? " — " : ""}
              {a.body && (
                <span
                  className="[&>a]:underline"
                  // Passio sends trusted admin-authored HTML; we render it but
                  // strip any script/style defensively by rendering as text if
                  // we detect those tokens.
                  dangerouslySetInnerHTML={{
                    __html: /<\s*(script|style)/i.test(a.body) ? "" : a.body,
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
