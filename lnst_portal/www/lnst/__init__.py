"""The screen registry — one row per screen, and the only place nav is defined.

Everything a page needs (its mode, its title, which nav entry lights up, which
JS file to pull) comes from here, so the sidebar, the mobile bottom nav and the
landing page cannot drift apart.

MODE is a property of the screen, not the viewport: /lnst/my-day has to look
like a phone on a 1920px demo laptop, so the field-executive screens are
mode="mobile" whatever they are opened on.

NOTE ON "one folder with index.html + its own JS": Frappe refuses to serve .js
out of www/ (it is in UNSUPPORTED_STATIC_PAGE_TYPES in
frappe/website/page_renderers/static_page.py), so each screen's JS lives at
public/js/screens/<js>.js instead. The 1:1 naming is kept so the pairing is
still obvious.
"""

import frappe

# key, url, label, short (bottom nav), group, mode, icon, js, in_nav
SCREENS = [
	# ---------------------------------------------------------- the landing
	("home",          "",              "Operations Overview",     "Home",     "all",  "desk",     "grid",    "home",          1),
	# ---------------------------------------------------- field executive
	("my_day",        "my-day",        "My Day",                  "Day",      "exec", "mobile",   "sun",     "my_day",        1),
	("new_request",   "new-request",   "New Out-Request",         "New",      "exec", "mobile",   "plus",    "new_request",   0),
	("my_requests",   "my-requests",   "My Requests",             "Requests", "exec", "terminal", "list",    "requests",      1),
	("delivery",      "delivery",      "Delivery Confirmation",   "Deliver",  "exec", "terminal", "truck",   "delivery",      1),
	("usage",         "usage",         "Usage Capture",           "Usage",    "exec", "terminal", "clip",    "usage",         1),
	("return_ready",  "return-ready",  "Return Ready",            "Returns",  "exec", "mobile",   "back",    "return_ready",  0),
	("stock_lookup",  "stock-lookup",  "Stock Lookup",            "Stock",    "exec", "mobile",   "box",     "stock_lookup",  0),
	# --------------------------------------------------------- warehouse
	("requests",      "requests",      "Requests",                "Requests", "wh",   "terminal", "list",    "requests",      1),
	("picks",         "picks",         "Pending Picks",           "Picks",    "wh",   "terminal", "list",    "requests",      1),
	("pick",          "pick",          "Pick Execution",          "Pick",     "wh",   "terminal", "scan",    "requests",      1),
	("inward",        "inward",        "Inward & Put-away",       "Inward",   "wh",   "terminal", "down",    "inward",        1),
	("return_inward", "return-inward", "Return Inward",           "Returns",  "wh",   "terminal", "back",    "delivery",      1),
	("status_board",  "status-board",  "Live Status Board",       "Board",    "wh",   "terminal", "grid",    "status_board",  1),
	("transfer",      "transfer",      "Branch Transfer",         "Transfer", "wh",   "terminal", "swap",    "transfer",      1),
	# -------------------------------------------------------- back office
	("approvals",     "approvals",     "Approval Queue",          "Approve",  "desk", "desk",     "check",   "approvals",     1),
	("challans",      "challans",      "Open Challans",           "Challans", "desk", "desk",     "doc",     "challans",      1),
	("parked_stock",  "parked-stock",  "Hospital Parked Stock",   "Parked",   "desk", "desk",     "hosp",    "parked_stock",  1),
	("expiry",        "expiry",        "Expiry & Short-Expiry",   "Expiry",   "desk", "desk",     "clock",   "expiry",        1),
	("wos",           "wos",           "WOS Reporting Queue",     "WOS",      "desk", "desk",     "send",    "wos",           1),
	("principal",     "principal",     "Principal Invoice",       "Principal","desk", "desk",     "rupee",   "principal",     1),
	("damage",        "damage",        "Damage Register",         "Damage",   "desk", "desk",     "warn",    "damage",        1),
	("dashboard",     "dashboard",     "Management Dashboard",    "Dashboard","desk", "desk",     "chart",   "dashboard",     1),
]

GROUPS = {
	"exec": ("Field Executive", "Deliveries, usage and returns from the hospital floor."),
	"wh": ("Warehouse", "Scan-first picking, put-away and reconciliation."),
	"desk": ("Back Office", "Approvals, challans, reporting and the numbers."),
}

# The bottom nav holds five slots and the executive has seven screens. New
# Out-Request is a verb, not a place — it gets the floating + button instead.
MOBILE_NAV = ["my_day", "my_requests", "delivery", "usage", "stock_lookup"]


def _rows():
	keys = ("key", "slug", "label", "short", "group", "mode", "icon", "js", "in_nav")
	return [dict(zip(keys, row)) for row in SCREENS]


def find(key):
	for row in _rows():
		if row["key"] == key:
			return row
	frappe.throw(f"Unknown LNST screen: {key}")


def nav_for(group, mode):
	"""The nav this screen shows: five bottom-nav slots on mobile, the
	group's full list on desk and terminal."""
	rows = [r for r in _rows() if r["in_nav"] and r["key"] != "home"]
	if mode == "mobile":
		order = {k: i for i, k in enumerate(MOBILE_NAV)}
		rows = [r for r in rows if r["key"] in order]
		rows.sort(key=lambda r: order[r["key"]])
		return [{"items": rows, "label": None}]
	# Desk and terminal see the back-of-house groups headed, so somebody can
	# walk the mockup without returning to the landing. The landing itself
	# lists everything — it is the directory.
	out = [{"label": None, "items": [find("home")]}]
	for gid in ("exec", "wh", "desk"):
		items = [r for r in rows if r["group"] == gid]
		if items:
			out.append({"label": GROUPS[gid][0], "items": items})
	return out


def screen(context, key):
	"""Every screen's index.py is four lines and calls this."""
	from lnst_portal.www import asset_version

	row = find(key)
	context.no_cache = 1
	context.asset_v = asset_version()
	context.screen_key = row["key"]
	context.title = row["label"]
	context.mode = row["mode"]
	context.group = row["group"]
	context.js = row["js"]
	context.nav_groups = nav_for(row["group"], row["mode"])
	context.boot = {"screen": row["key"], "mode": row["mode"], "group": row["group"]}
	return context
