"""/lnst/my-requests — the same requests screen, scoped to one executive.

One implementation, two routes: this one opens pre-filtered to the signed-in
executive, /lnst/requests opens on everything. The screen reads which it is
from its own key, so there is no second copy of the logic to keep in step.
"""

from lnst_portal.www.lnst import screen

no_cache = 1


def get_context(context):
	screen(context, "my_requests")
	context.subtitle = "Requests assigned to me"
	return context
