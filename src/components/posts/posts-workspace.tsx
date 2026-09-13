"use client";

import { useState } from "react";

import { PostForm } from "@/components/posts/post-form";
import { PostImportWizard } from "@/components/posts/post-import-wizard";
import { PostList } from "@/components/posts/post-list";
import { ReviewGenerator } from "@/components/reviews/review-generator";
import { apiRequest } from "@/lib/client/api";
import type { PostDto } from "@/lib/posts/schemas";
import type { ReviewUsage } from "@/lib/reviews/schemas";

type ListPayload = { posts: PostDto[]; nextCursor: string | null };

/** 作品数据工作区：录入 / 导入 / 列表 / 勾选生成复盘，共用一份列表状态。 */
export function PostsWorkspace({
  initialPosts,
  initialCursor,
  initialUsage,
}: {
  initialPosts: PostDto[];
  initialCursor: string | null;
  initialUsage: ReviewUsage;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore(): Promise<void> {
    if (!cursor || loading) {
      return;
    }

    setLoading(true);
    setError(null);

    const result = await apiRequest<ListPayload>(
      `/api/posts?${new URLSearchParams({ cursor }).toString()}`,
    );

    setLoading(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setPosts((previous) => [...previous, ...result.data.posts]);
    setCursor(result.data.nextCursor);
  }

  return (
    <div className="space-y-6">
      <PostForm onCreated={(post) => setPosts((previous) => [post, ...previous])} />

      <PostImportWizard onImported={(created) => setPosts((previous) => [...created, ...previous])} />

      <ReviewGenerator posts={posts} initialUsage={initialUsage} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">作品记录</h2>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <PostList
          posts={posts}
          hasMore={cursor !== null}
          loading={loading}
          onLoadMore={() => void loadMore()}
          onChanged={(post) =>
            setPosts((previous) => previous.map((item) => (item.id === post.id ? post : item)))
          }
          onDeleted={(id) => setPosts((previous) => previous.filter((item) => item.id !== id))}
        />
      </section>
    </div>
  );
}