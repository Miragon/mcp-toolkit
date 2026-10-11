import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Skeleton,
  useToolkitMessages,
} from "@miragon/mcp-toolkit-ui"
import { useArticlesGetArticle } from "../generated/hooks.js"

export function ArticleCard({ keys }: WidgetProps) {
  const raw = keys["articles:articleId"]
  const id = typeof raw === "string" ? raw : ""
  const { data, isLoading, error, refetch } = useArticlesGetArticle({ id }, { enabled: !!id })
  const { common } = useToolkitMessages()

  if (!id) {
    return (
      <Card>
        <CardContent className="text-muted-foreground text-sm">(no article id)</CardContent>
      </Card>
    )
  }
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    )
  }
  if (error) {
    // What happened and what you can do, from the toolkit's en/de catalog; the
    // raw reason stays under "Details" instead of leading the card.
    return (
      <ErrorState
        title={common.loadFailed}
        description={common.loadFailedHint}
        details={error.message}
        onRetry={() => void refetch()}
      />
    )
  }
  if (!data) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{data.title}</CardTitle>
        <CardDescription>
          by {data.author} · {data.publishedAt}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm leading-relaxed">{data.body}</CardContent>
    </Card>
  )
}
