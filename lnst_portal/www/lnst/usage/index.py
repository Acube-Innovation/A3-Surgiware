"""/lnst/usage — what was actually used in theatre.

Fed by confirmed deliveries: a challan appears once somebody has signed for it.
Scanning a packet marks it used; whatever is not scanned is still at the
hospital and has to come back.
"""

from lnst_portal.www.lnst import screen

no_cache = 1


def get_context(context):
	screen(context, "usage")
	context.subtitle = "Scan what was used, account for the rest"
	return context
