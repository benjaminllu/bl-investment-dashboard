import { supabase } from "@/lib/supabase";

interface Post {
  id: number;
  title: string;
  body: string;
  created_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

export default async function ResearchPage() {
  const { data: posts, error } = await supabase
    .from("posts")
    .select("id, title, body, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-screen-2xl p-6">
        <h1 className="mb-6 text-2xl font-bold text-white">Research</h1>

        {error && (
          <p className="text-slate-400">Failed to load posts.</p>
        )}

        {!error && (!posts || posts.length === 0) && (
          <p className="text-slate-400">No posts yet. Add one in the Supabase dashboard.</p>
        )}

        <div className="flex flex-col gap-4">
          {(posts ?? []).map((post: Post) => (
            <div
              key={post.id}
              className="rounded-xl bg-slate-900 p-6"
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-white">{post.title}</h2>
                <span className="shrink-0 text-xs text-slate-500">{formatDate(post.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{post.body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
