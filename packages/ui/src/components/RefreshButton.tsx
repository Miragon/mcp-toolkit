interface RefreshButtonProps {
  onClick: () => void
  isLoading: boolean
  loadingLabel?: string
  label?: string
}

export function RefreshButton({
  onClick,
  isLoading,
  loadingLabel = "Loading...",
  label = "Refresh",
}: RefreshButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className="text-muted-foreground hover:text-foreground text-xs transition-colors"
    >
      {isLoading ? loadingLabel : label}
    </button>
  )
}
