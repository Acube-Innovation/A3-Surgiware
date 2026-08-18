"""/lnst/requests — requests that have reached this warehouse, and the scan
that allocates stock against one.

Four lines, like every screen: the registry knows the mode, the title, the nav
and which JS to pull. No queries — the browser reads mock_data.js.
"""

from lnst_portal.www.lnst import screen

no_cache = 1


def get_context(context):
	screen(context, "requests")
	context.subtitle = "Pick against a request, scan stock out"
	return context
