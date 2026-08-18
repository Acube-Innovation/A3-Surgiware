"""/lnst — the operations overview, and the way into every other screen.

No queries here — the numbers are computed in the browser from mock_data.js.
"""

from lnst_portal.www.lnst import GROUPS, SCREENS, screen

no_cache = 1


def get_context(context):
	screen(context, "home")

	keys = ("key", "slug", "label", "short", "group", "mode", "icon", "js", "in_nav")
	rows = [dict(zip(keys, row)) for row in SCREENS if row[0] != "home"]
	context.role_cards = [
		{
			"id": gid,
			"title": GROUPS[gid][0],
			"blurb": GROUPS[gid][1],
			"screens": [r for r in rows if r["group"] == gid],
		}
		for gid in ("exec", "wh", "desk")
	]
	context.subtitle = "All Kerala · four branches · mockup data"
	return context
