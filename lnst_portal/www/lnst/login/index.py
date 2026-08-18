"""/lnst/login — the terminal sign-in screen.

Mockup. There is no authentication here and nothing is posted anywhere: the
screen decides everything in the browser and keeps its session in localStorage.
This module exists only to keep the page uncached and to hand the template the
branch list, so the markup carries no hard-coded list of branches.

Unlike the operations screens the login does not extend lnst_base.html — it is
the way in, and has no header to sign out of — so it carries its own <head> and
its own stylesheet (lnst_login.css). It shares the app's asset stamp.
"""

from lnst_portal.www import asset_version

no_cache = 1

BRANCHES = ["Kochi", "Trivandrum", "Thrissur", "Calicut"]


def get_context(context):
	context.no_cache = 1
	context.asset_v = asset_version()
	context.branches = BRANCHES
	return context
