"""/lnst/pick — picked requests waiting for a vehicle and a challan.

Same screen as /lnst/requests, narrowed to Picked, with the scan swapped for
the two dispatch actions. The difference lives in the scope table in
public/js/screens/requests.js.
"""

from lnst_portal.www.lnst import screen

no_cache = 1


def get_context(context):
	screen(context, "pick")
	context.subtitle = "Assign a vehicle, raise the delivery challan"
	return context
