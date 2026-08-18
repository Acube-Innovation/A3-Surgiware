"""/lnst/status-board — the whole operation on one screen.

A wall board. It is read from across a room, not worked in, so it carries no
filters worth speaking of and nothing that needs a second click to make sense.
It repaints itself when any other tab writes to the demo store.
"""

from lnst_portal.www.lnst import screen

no_cache = 1


def get_context(context):
	screen(context, "status_board")
	context.subtitle = "Every case, every branch, right now"
	return context
