"""/lnst/picks — approved requests waiting to be picked.

The same screen as /lnst/requests, narrowed to one state. The screen reads
which route it is on from its own key; the difference lives in one table there,
not in a second copy of the page.
"""

from lnst_portal.www.lnst import screen

no_cache = 1


def get_context(context):
	screen(context, "picks")
	context.subtitle = "Approved and waiting — scan stock against one"
	return context
