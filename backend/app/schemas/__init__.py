"""Response DTOs for the API layer — one module per route family.

These are pure output shapes (no `table=True`): every field here is either
read straight off a model column or formed by trivial, request-time
arithmetic/formatting (a label string, a signed difference, a rank position).
No route or schema in this package re-derives an analytic that ingest
already computed — see `app/analytics/` for what actually owns that work.
"""
