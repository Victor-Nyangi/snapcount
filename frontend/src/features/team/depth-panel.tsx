import type { DepthGroup } from "@/client"

/**
 * Position groups — structural slots only, no names.
 *
 * THIS PANEL IS INTENTIONALLY EMPTY and is not a loading, error or
 * coming-soon state. Personnel and formation data needs charted plays this
 * project does not ingest, and the design's answer is to ship the shape
 * with em-dashes and say so in one sentence rather than fake names or hide
 * the panel. The caption is the state; nothing here should acquire a
 * spinner, a badge, or a retry.
 */
export function DepthPanel({ groups }: { groups: DepthGroup[] }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--gray-200)",
        borderRadius: "var(--radius-lg)",
        padding: 20,
        boxShadow: "var(--shadow-light-sm)",
      }}
    >
      <p
        style={{
          margin: "0 0 16px",
          fontSize: 13,
          lineHeight: 1.55,
          color: "var(--gray-600)",
          textWrap: "pretty",
        }}
      >
        Depth by position group. Personnel and formation data needs charted
        plays — that view is deliberately deferred rather than faked.
      </p>
      <div style={{ display: "grid", gap: 16 }}>
        {groups.map((group) => (
          <div key={group.group}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--orchid)",
                marginBottom: 4,
              }}
            >
              {group.group}
            </div>
            {group.slots.map((slot) => (
              <div
                key={slot}
                className="flex justify-between"
                style={{
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: "1px dashed var(--gray-200)",
                  fontSize: 13,
                  color: "var(--gray-600)",
                }}
              >
                <span>{slot}</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--gray-400)",
                  }}
                >
                  —
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
