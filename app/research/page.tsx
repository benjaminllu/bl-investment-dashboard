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
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl p-4">
        <h1 className="mb-4 text-2xl font-bold text-foreground">Research</h1>

        {error && (
          <p className="text-muted-foreground">Failed to load posts.</p>
        )}

        {!error && (!posts || posts.length === 0) && (
          <p className="text-muted-foreground">No posts yet. Add one in the Supabase dashboard.</p>
        )}

        <div className="flex flex-col gap-4">
          {(posts ?? []).map((post: Post) => (
            <div
              key={post.id}
              className="rounded-xl bg-card p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-foreground">{post.title}</h2>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(post.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{post.body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
