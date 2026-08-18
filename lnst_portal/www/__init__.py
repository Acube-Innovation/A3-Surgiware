"""Asset versioning for every LNST page — the operations screens and the login.

The pages link their CSS and JS by path rather than through the desk bundler,
so without a changing token a browser holds yesterday's copy. Stamped from the
newest mtime anywhere under public/ — a fixed file list would miss an edit to
mock_data.js, which is exactly the file that changes most during a build.
"""

import os

import frappe


def asset_version() -> str:
	if frappe.local.dev_server:
		return _stamp()
	if not hasattr(frappe.local, "lnst_asset_version"):
		frappe.local.lnst_asset_version = _stamp()
	return frappe.local.lnst_asset_version


def _stamp() -> str:
	root = frappe.get_app_path("lnst_portal", "public")
	newest = 0.0
	for folder, _dirs, names in os.walk(root):
		for name in names:
			if name.endswith((".css", ".js")):
				newest = max(newest, os.path.getmtime(os.path.join(folder, name)))
	return str(int(newest))
