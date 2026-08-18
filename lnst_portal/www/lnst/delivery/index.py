"""/lnst/delivery — confirm a challan was handed over at the hospital.

Fed by the challans raised on Pick Execution: anything with a delivery number
that has not been confirmed yet. No queries; the browser reads mock_data.js.
"""

from lnst_portal.www.lnst import screen

no_cache = 1


def get_context(context):
	screen(context, "delivery")
	context.subtitle = "Confirm handover, capture proof"
	return context
