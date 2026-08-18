/* Copyright (c) 2026, Acube Innovations Pvt Ltd and contributors
 *
 * LNST mockup session.
 *
 * There is no server in this mockup — no DocType, no API. The signed-in state
 * lives in localStorage and nothing else. The shape written here is the one the
 * field-executive and back-office terminals will reuse, so `role` is carried
 * explicitly rather than inferred from the screen the user happens to be on.
 *
 * This file is the sole owner of the session contract. It loads before
 * lnst_core.js and seeds window.LNST; core extends that same object rather
 * than replacing it, so a screen sees one API.
 */
(function (window) {
	"use strict";

	var SESSION_KEY = "lnst.session";
	var BINDING_KEY = "lnst.terminal_binding";
	var LOGIN_URL = "/lnst/login";

	// The terminal this appliance is bolted to. Kochi unless somebody rebinds it.
	var DEFAULT_BINDING = { branch: "Kochi", terminal_id: "KCH-TERM-02" };

	var BRANCHES = ["Kochi", "Trivandrum", "Thrissur", "Calicut"];

	function read(key) {
		try {
			var raw = window.localStorage.getItem(key);
			return raw ? JSON.parse(raw) : null;
		} catch (err) {
			// Private mode, or somebody put a non-JSON value there by hand.
			return null;
		}
	}

	function write(key, value) {
		try {
			window.localStorage.setItem(key, JSON.stringify(value));
			return true;
		} catch (err) {
			return false;
		}
	}

	function clear(key) {
		try {
			window.localStorage.removeItem(key);
		} catch (err) {
			/* nothing to do */
		}
	}

	var LNST = {
		SESSION_KEY: SESSION_KEY,
		BINDING_KEY: BINDING_KEY,
		LOGIN_URL: LOGIN_URL,
		BRANCHES: BRANCHES,

		/* ------------------------------------------------ terminal binding */

		binding: function () {
			var saved = read(BINDING_KEY);
			if (saved && saved.branch && saved.terminal_id) {
				return saved;
			}
			return { branch: DEFAULT_BINDING.branch, terminal_id: DEFAULT_BINDING.terminal_id };
		},

		bind: function (branch, terminalId) {
			var next = {
				branch: branch || DEFAULT_BINDING.branch,
				terminal_id: (terminalId || DEFAULT_BINDING.terminal_id).trim(),
			};
			write(BINDING_KEY, next);
			return next;
		},

		/* -------------------------------------------------------- session */

		session: {
			get: function () {
				return read(SESSION_KEY);
			},
			signOut: function () {
				clear(SESSION_KEY);
				window.location.href = LOGIN_URL;
			},
		},

		signIn: function (details) {
			var binding = LNST.binding();
			var session = {
				user: details.user,
				role: details.role || "warehouse",
				branch: details.branch || binding.branch,
				terminal_id: details.terminal_id || binding.terminal_id,
				signed_in_at: new Date().toISOString(),
			};
			write(SESSION_KEY, session);
			return session;
		},

		/* Kept as a shorthand — the implementation lives in session.signOut. */
		signOut: function () {
			LNST.session.signOut();
		},

		/* Opt-in hard gate. The mockup screens deliberately do not call this:
		   every screen must render cold from a bare URL to be demoable. */
		requireSession: function () {
			var session = LNST.session.get();
			if (!session || !session.user) {
				window.location.replace(LOGIN_URL);
				return null;
			}
			return session;
		},

		/* The one place header chrome is wired, for every shell. Called by
		   LNST.boot, so a screen never does this itself.

		   `fallback` is what the user slot shows when nobody is signed in —
		   screens render cold, so an empty header there would look broken. */
		mountHeader: function (session, fallback) {
			var all = function (sel) {
				return Array.prototype.slice.call(document.querySelectorAll(sel));
			};
			all("[data-lnst-signout]").forEach(function (button) {
				button.addEventListener("click", function () {
					LNST.session.signOut();
				});
			});
			all("[data-lnst-user]").forEach(function (who) {
				who.textContent = session ? session.user : (fallback || "");
			});
			all("[data-lnst-branch]").forEach(function (where) {
				where.textContent = session
					? session.branch + " · " + session.terminal_id
					: LNST.binding().branch;
			});
		},
	};

	window.LNST = LNST;
})(window);
