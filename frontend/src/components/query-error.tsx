/**
 * What a screen renders when its query failed.
 *
 * The rule this exists for (Task 6.1 Step 3): a failed request must never
 * be indistinguishable from an empty result. Before this, a dropped
 * connection on the week screen rendered "All 0" and "No games match this
 * filter" — a confident, wrong statement that the week was empty. An empty
 * state says "there is nothing here"; an error state has to say "we could
 * not find out", and offer a way to ask again.
 */
export function QueryError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      style={{
        padding: "28px 24px",
        textAlign: "center",
        background: "var(--card)",
        border: "1px solid var(--warning-tint-border)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <p style={{ margin: 0, fontSize: 15, color: "var(--gray-700)" }}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: 14,
          fontFamily: "var(--font-body)",
          fontSize: 13,
          fontWeight: 700,
          padding: "8px 16px",
          borderRadius: 999,
          cursor: "pointer",
          border: "1px solid var(--gray-300)",
          background: "var(--card)",
          color: "var(--gray-700)",
        }}
      >
        Try again
      </button>
    </div>
  )
}
