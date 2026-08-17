"""Pure derived-analytics functions: power score, standings, leaders, trends.

No database access and no network I/O anywhere in this package — every
function here is a deterministic transform of its inputs, which is what
makes it the most directly testable code in the project.
"""
