"""/lnst/return-inward — the store keeper signs for what came back.

Same screen as /lnst/delivery, the other direction: who returned it, on what
vehicle, when, with a photograph and a signature. Put-away happens first, on
/lnst/inward; this is the receipt for it.
"""

from lnst_portal.www.lnst import screen

no_cache = 1


def get_context(context):
	screen(context, "return_inward")
	context.subtitle = "Sign for stock coming back into the store"
	return context
