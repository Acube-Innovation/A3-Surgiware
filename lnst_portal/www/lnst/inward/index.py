"""/lnst/inward — putting returned stock back on the shelf.

Rack first, then the items that live on it. The screen keeps asking for the
next rack until every item on the challan has a home again.
"""

from lnst_portal.www.lnst import screen

no_cache = 1


def get_context(context):
	screen(context, "inward")
	context.subtitle = "Scan the rack, then the items that belong on it"
	return context
