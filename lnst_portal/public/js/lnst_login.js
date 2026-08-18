/* Copyright (c) 2026, Acube Innovations Pvt Ltd and contributors
 *
 * LNST Warehouse Operations Terminal — sign-in screen.
 *
 * Mockup: nothing is sent anywhere. Any non-empty user ID and password gets in,
 * and so does any badge scan. The four states in the brief are real states of
 * this one page, driven from `apply()`, so the dev strip and normal use walk
 * exactly the same code.
 */
(function (window, document) {
	"use strict";

	var LNST = window.LNST;

	var el = {};
	var state = {
		mode: "default",       // default | scanning
		error: false,
		branch: null,          // the branch being signed in to
		warnAnswered: false,   // wrong-branch strip resolved this attempt?
	};

	function $(selector) { return document.querySelector(selector); }

	function cache() {
		el.card = $("[data-card]");
		el.body = $("[data-card-body]");
		el.segments = Array.prototype.slice.call(document.querySelectorAll("[data-branch]"));
		el.warn = $("[data-warn]");
		el.warnText = $("[data-warn-text]");
		el.warnOk = $("[data-warn-continue]");
		el.warnNo = $("[data-warn-cancel]");
		el.termRow = $("[data-terminal-row]");
		el.termId = $("[data-terminal-id]");
		el.termChange = $("[data-terminal-change]");
		el.termEdit = $("[data-terminal-edit]");
		el.termInput = $("[data-terminal-input]");
		el.termSave = $("[data-terminal-save]");
		el.user = $("[data-user]");
		el.pwd = $("[data-pwd]");
		el.error = $("[data-error]");
		el.tile = $("[data-badge-tile]");
		el.submit = $("[data-submit]");
		el.overlay = $("[data-scan-overlay]");
		el.catcher = $("[data-scan-catcher]");
		el.exitScan = $("[data-scan-exit]");
		el.railBranches = Array.prototype.slice.call(
			document.querySelectorAll("[data-rail-branch]"));
		el.devButtons = Array.prototype.slice.call(document.querySelectorAll("[data-dev]"));
	}

	/* ------------------------------------------------------------- render */

	function boundBranch() { return LNST.binding().branch; }

	function branchMismatch() { return state.branch !== boundBranch(); }

	function apply() {
		var binding = LNST.binding();

		// Branch segments.
		el.segments.forEach(function (segment) {
			segment.classList.toggle("is-on", segment.dataset.branch === state.branch);
		});

		// The rail picks out the terminal's own branch, not the selected one.
		el.railBranches.forEach(function (node) {
			node.classList.toggle("is-bound", node.dataset.railBranch === binding.branch);
		});

		el.termId.textContent = binding.terminal_id;

		// Wrong-branch strip.
		var showWarn = branchMismatch() && !state.warnAnswered;
		el.warn.classList.toggle("is-open", showWarn);
		if (showWarn) {
			el.warnText.textContent =
				"This terminal is bound to " + binding.branch +
				". You are signing in to " + state.branch + ". Continue?";
		}

		// Error.
		el.error.classList.toggle("is-open", state.error);
		el.user.classList.toggle("is-bad", state.error);
		el.pwd.classList.toggle("is-bad", state.error);

		// Badge scan.
		var scanning = state.mode === "scanning";
		el.body.classList.toggle("is-dim", scanning);
		el.overlay.classList.toggle("is-open", scanning);
		if (scanning) {
			el.catcher.value = "";
			el.catcher.focus();
		}

		// An unanswered wrong-branch question blocks the primary action.
		el.submit.disabled = showWarn;

		// Dev strip highlight.
		var current = scanning ? "scan" : state.error ? "error" : showWarn ? "warn" : "default";
		el.devButtons.forEach(function (button) {
			button.classList.toggle("is-on", button.dataset.dev === current);
		});
	}

	/* ------------------------------------------------------------ actions */

	function clearError() {
		if (state.error) {
			state.error = false;
			apply();
		}
	}

	function selectBranch(branch) {
		state.branch = branch;
		state.warnAnswered = !branchMismatch();
		apply();
	}

	function startScan() {
		state.mode = "scanning";
		state.error = false;
		apply();
	}

	function stopScan() {
		state.mode = "default";
		apply();
		el.user.focus();
	}

	function complete(user) {
		LNST.signIn({
			user: user,
			role: "warehouse",
			branch: state.branch,
			terminal_id: LNST.binding().terminal_id,
		});
		window.location.href = "/lnst";
	}

	function submit() {
		if (branchMismatch() && !state.warnAnswered) { return; }

		var user = (el.user.value || "").trim();
		var pwd = el.pwd.value || "";

		// Mockup rule: anything non-empty is accepted. Empty is the error state.
		if (!user || !pwd) {
			state.error = true;
			apply();
			el.user.focus();
			return;
		}
		complete(user);
	}

	/* -------------------------------------------------------------- wiring */

	function wire() {
		el.segments.forEach(function (segment) {
			segment.addEventListener("click", function () {
				selectBranch(segment.dataset.branch);
			});
		});

		el.warnOk.addEventListener("click", function () {
			state.warnAnswered = true;
			apply();
		});

		el.warnNo.addEventListener("click", function () {
			selectBranch(boundBranch());
		});

		// Terminal rebinding.
		el.termChange.addEventListener("click", function () {
			el.termEdit.classList.add("is-open");
			el.termRow.style.display = "none";
			el.termInput.value = LNST.binding().terminal_id;
			el.termInput.focus();
			el.termInput.select();
		});

		function saveTerminal() {
			var value = (el.termInput.value || "").trim();
			if (value) {
				// Rebinding sets the terminal's home branch to the one on screen.
				LNST.bind(state.branch, value);
				state.warnAnswered = true;
			}
			el.termEdit.classList.remove("is-open");
			el.termRow.style.display = "";
			apply();
		}

		el.termSave.addEventListener("click", saveTerminal);
		el.termInput.addEventListener("keydown", function (event) {
			if (event.key === "Enter") { event.preventDefault(); saveTerminal(); }
			if (event.key === "Escape") {
				el.termEdit.classList.remove("is-open");
				el.termRow.style.display = "";
			}
		});

		el.user.addEventListener("input", clearError);
		el.pwd.addEventListener("input", clearError);

		el.pwd.addEventListener("keydown", function (event) {
			if (event.key === "Enter") { event.preventDefault(); submit(); }
		});
		el.user.addEventListener("keydown", function (event) {
			if (event.key === "Enter") { event.preventDefault(); el.pwd.focus(); }
		});

		el.tile.addEventListener("click", startScan);
		el.exitScan.addEventListener("click", stopScan);
		el.submit.addEventListener("click", submit);

		// A badge reader is a keyboard. Keep the catcher focused while scanning
		// so a scan lands here wherever the operator last touched the screen.
		el.catcher.addEventListener("blur", function () {
			if (state.mode === "scanning") {
				window.setTimeout(function () { el.catcher.focus(); }, 0);
			}
		});

		el.catcher.addEventListener("keydown", function (event) {
			if (event.key !== "Enter") { return; }
			event.preventDefault();
			var scanned = (el.catcher.value || "").trim();
			complete(scanned || "badge-" + LNST.binding().terminal_id.toLowerCase());
		});

		document.addEventListener("keydown", function (event) {
			if (event.key === "Escape" && state.mode === "scanning") { stopScan(); }
		});

		// Dev strip — mockup only.
		el.devButtons.forEach(function (button) {
			button.addEventListener("click", function () {
				var which = button.dataset.dev;
				if (which === "default") {
					state.mode = "default";
					state.error = false;
					selectBranch(boundBranch());
					return;
				}
				if (which === "scan") { startScan(); return; }
				if (which === "error") {
					state.mode = "default";
					state.error = true;
					apply();
					return;
				}
				if (which === "warn") {
					state.mode = "default";
					state.error = false;
					// Pick any branch that is not the bound one.
					var other = LNST.BRANCHES.filter(function (name) {
						return name !== boundBranch();
					})[0];
					state.branch = other;
					state.warnAnswered = false;
					apply();
				}
			});
		});
	}

	function init() {
		cache();
		state.branch = LNST.binding().branch;
		state.warnAnswered = true;
		wire();
		apply();
		el.user.focus();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})(window, document);
