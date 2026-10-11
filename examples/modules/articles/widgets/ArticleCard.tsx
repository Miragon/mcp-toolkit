import { FileText } from "lucide-react"
import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Skeleton,
  useLocale,
} from "@miragon/mcp-toolkit-ui"
import { useArticlesGetArticle } from "../generated/hooks.js"
import { formatPublished, useArticlesText } from "./messages.js"

export function ArticleCard({ keys }: WidgetProps) {
  const locale = useLocale()
  const text = useArticlesText()
  const raw = keys["articles:articleId"]
  const id = typeof raw === "string" ? raw : ""
  const { data, isLoading, error, refetch } = useArticlesGetArticle({ id }, { enabled: !!id })

  if (!id) {
    return (
      <Card>
        <EmptyState
          icon={<FileText />}
          title={text.noArticleTitle}
          description={text.noArticleHint}
        />
      </Card>
    )
  }
  if (isLoading) {
    return (
      <Card role="status" aria-label={text.loading}>
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
    // What happened and what you can do; the raw reason stays under Details.
    return (
      <ErrorState
        title={text.loadFailed}
        description={text.loadFailedHint}
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
          {text.byline(data.author, formatPublished(data.publishedAt, locale))}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm leading-relaxed">{data.body}</CardContent>
    </Card>
  )
}
