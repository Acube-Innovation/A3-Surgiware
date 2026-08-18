/* Copyright (c) 2026, Acube Innovations Pvt Ltd and contributors
 *
 * LNST mockup — shared core. Extends the one global, window.LNST, that
 * lnst_session.js seeds.
 *
 * Everything the screens need in common lives here so no screen reimplements
 * it: the store, the workflow machine, the six business rules, the scan
 * engine, and the render helpers.
 *
 * Nothing in this file talks to a server.
 */
(function (window, document) {
	"use strict";

	var STORE_KEY = "lnst.state";

	/* lnst_session.js runs first and owns window.LNST — the session contract,
	   the terminal binding and the header wiring. Extend that object; assigning
	   a fresh one here would silently drop the sign-in half of the API. */
	var LNST = window.LNST || {};
	LNST.mode = "desk";
	LNST.screenKey = null;
	LNST.boot_ctx = {};
	var screens = {};
	var listeners = {};
	var db = null;

	/* ================================================================ util */

	function esc(value) {
		if (value === null || value === undefined) { return ""; }
		return String(value).replace(/[&<>"']/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
		});
	}

	function $(sel, root) { return (root || document).querySelector(sel); }
	function $$(sel, root) {
		return Array.prototype.slice.call((root || document).querySelectorAll(sel));
	}

	function debounce(fn, ms) {
		var t;
		return function () {
			var args = arguments, self = this;
			clearTimeout(t);
			t = setTimeout(function () { fn.apply(self, args); }, ms || 220);
		};
	}

	/* ============================================================== format */

	var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
		"Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

	var fmt = {
		dash: function (v) { return (v === null || v === undefined || v === "") ? "—" : v; },
		day: function (iso) {
			if (!iso) { return "—"; }
			var p = String(iso).slice(0, 10).split("-");
			return p[2] + " " + MONTHS[parseInt(p[1], 10) - 1] + " " + p[0].slice(2);
		},
		dayTime: function (iso) {
			if (!iso) { return "—"; }
			return fmt.day(iso) + " " + String(iso).slice(11, 16);
		},
		qty: function (n) { return (n === null || n === undefined) ? "—" : String(n); },
		money: function (n) {
			if (n === null || n === undefined || n === "") { return "—"; }
			return "₹" + Number(n).toLocaleString("en-IN");
		},
		/* Date arithmetic on ISO day-strings, done in UTC.
		 *
		 * `new Date("2026-08-17T00:00:00")` parses as LOCAL midnight, and
		 * toISOString() then renders it in UTC — so east of Greenwich every
		 * derived date silently slipped back a day. Parse and step in UTC and
		 * the string that goes in is the string that comes out. */
		addDays: function (iso, days) {
			var d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
			d.setUTCDate(d.getUTCDate() + days);
			return d.toISOString().slice(0, 10);
		},
		/* Days between two ISO dates — used by ageing and the expiry rule. */
		daysBetween: function (a, b) {
			return Math.round((new Date(String(b).slice(0, 10) + "T00:00:00Z")
				- new Date(String(a).slice(0, 10) + "T00:00:00Z")) / 86400000);
		},
	};

	/* =============================================================== store */

	var store = {
		load: function () {
			var seed = window.LNST_MOCK;
			var raw = null;
			try { raw = window.localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }
			if (raw) {
				try {
					var saved = JSON.parse(raw);
					// A stale copy in localStorage silently masking edits to
					// mock_data.js is the single most confusing bug on a build
					// like this. Version the seed and throw the old one away.
					if (saved && saved.meta && saved.meta.seed_version === seed.meta.seed_version) {
						db = saved;
						LNST.db = db;
						return db;
					}
				} catch (e) { /* fall through to reseed */ }
			}
			db = JSON.parse(JSON.stringify(seed));
			LNST.db = db;
			store.save();
			return db;
		},
		save: function () {
			try {
				window.localStorage.setItem(STORE_KEY, JSON.stringify(db));
			} catch (e) {
				// Quota. Signatures and photos are the usual cause.
				ui.toast("Demo storage is full — use Reset demo data.", "bad");
			}
		},
		reset: function () {
			try { window.localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
			db = JSON.parse(JSON.stringify(window.LNST_MOCK));
			LNST.db = db;
			store.save();
			emit("changed", { reason: "reset" });
			return db;
		},
		/* The only write path: mutate, persist, tell every listener. */
		tx: function (fn) {
			var out = fn(db);
			store.save();
			emit("changed", { reason: "tx" });
			return out;
		},
	};

	function get(collection, id) {
		var rows = db[collection] || [];
		for (var i = 0; i < rows.length; i++) { if (rows[i].id === id) { return rows[i]; } }
		return null;
	}

	function where(collection, pred) {
		return (db[collection] || []).filter(pred);
	}

	function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
	function emit(evt, payload) {
		(listeners[evt] || []).forEach(function (fn) { fn(payload); });
	}

	/* ====================================================== workflow machine
	 *
	 * One table. Screens never compare status strings — they ask flow.can().
	 * Guards hang off the action, so the same rule fires whether a close comes
	 * from the Open Challans board or the Management Dashboard.
	 */

	var FLOW = {
		"Draft":              { tone: "muted", actions: { submit: "Pending Approval", cancel: "Cancelled" } },
		"Pending Approval":   { tone: "warn",  actions: { approve: "Approved", reject: "Rejected", cancel: "Cancelled" } },
		"Approved":           { tone: "sky",   actions: { start_pick: "Picking", cancel: "Cancelled" } },
		"Picking":            { tone: "warn",  actions: { finish_pick: "Picked" } },
		"Picked":             { tone: "sky",   actions: { dispatch: "Dispatched" } },
		"Dispatched":         { tone: "sky",   actions: { deliver: "Delivered" } },
		"Delivered":          { tone: "good",  actions: { report_usage: "Usage Reported", cancel_surgery: "Return Pending" } },
		"Usage Reported":     { tone: "good",  actions: { raise_return: "Return Pending" } },
		"Return Pending":     { tone: "warn",  actions: { receive_partial: "Partially Returned", receive_full: "Fully Returned" } },
		"Partially Returned": { tone: "warn",  actions: { receive_full: "Fully Returned", reconcile: "Reconciled" } },
		"Fully Returned":     { tone: "good",  actions: { reconcile: "Reconciled" } },
		"Reconciled":         { tone: "good",  actions: { close: "Closed" } },
		"Closed":             { tone: "muted", actions: {} },
		"Rejected":           { tone: "bad",   actions: {} },
		"Cancelled":          { tone: "bad",   actions: {} },
	};

	var GUARDS = {
		close:           ["dc.balance_zero"],
		receive_partial: ["usage.before_return"],
		receive_full:    ["usage.before_return"],
		dispatch:        ["serial.single_open_dc"],
	};

	var flow = {
		states: function () { return Object.keys(FLOW); },
		tone: function (status) { return (FLOW[status] || {}).tone || "muted"; },
		can: function (status, action) {
			return !!((FLOW[status] || {}).actions || {})[action];
		},
		next: function (status, action) {
			return ((FLOW[status] || {}).actions || {})[action] || null;
		},
		actions: function (status) { return Object.keys((FLOW[status] || {}).actions || {}); },
		/* Runs the guards, then transitions. Returns {ok} or {ok:false, reason}. */
		apply: function (doc, action, ctx) {
			var target = flow.next(doc.status, action);
			if (!target) {
				return { ok: false, reason: "That is not something you can do to a "
					+ doc.status.toLowerCase() + " document." };
			}
			var names = GUARDS[action] || [];
			for (var i = 0; i < names.length; i++) {
				var verdict = rules.check(names[i], ctx || { doc: doc });
				if (!verdict.ok) { return verdict; }
			}
			store.tx(function () { doc.status = target; });
			return { ok: true, status: target };
		},
	};

	/* ================================================================ rules
	 *
	 * Each returns {ok:true} or {ok:false, code, reason, override:{...}}.
	 * Messages say what is wrong and what to do — never a field name.
	 */

	function balance(challan) {
		var t = { delivered: 0, used: 0, returned: 0, damaged: 0, written_off: 0, missing: 0 };
		(challan.lines || []).forEach(function (l) {
			t.delivered += l.delivered || 0;
			t.used += l.used || 0;
			t.returned += l.returned || 0;
			t.damaged += l.damaged || 0;
			t.written_off += l.written_off || 0;
			t.missing += l.missing || 0;
		});
		// The one canonical identity. See the note at the top of mock_data.js.
		t.balance = t.delivered - (t.used + t.returned + t.damaged + t.written_off + t.missing);
		t.ok = t.balance === 0;
		return t;
	}

	var CHECKS = {
		"ownership.no_mix": function (ctx) {
			var serial = ctx.serial, rack = ctx.rack;
			if (!serial || !rack) { return { ok: true }; }
			var wanted = serial.ownership === "consignment" ? "CONSIGN" : "PURCH";
			if (rack.kind === "damage" || rack.kind === "quarantine") { return { ok: true }; }
			if (ctx.rackOwnership && ctx.rackOwnership !== serial.ownership) {
				return { ok: false, code: "ownership.no_mix",
					reason: "This is " + serial.ownership + " stock and that rack holds "
						+ ctx.rackOwnership + " stock. Put it on a " + serial.ownership
						+ " rack instead." };
			}
			return { ok: true, wanted: wanted };
		},

		"pick.fefo": function (ctx) {
			var suggested = ctx.suggested, chosen = ctx.chosen;
			if (!suggested || !chosen || suggested.id === chosen.id) { return { ok: true }; }
			return { ok: false, code: "pick.fefo",
				reason: "The lot expiring soonest is " + suggested.lot + " ("
					+ fmt.day(suggested.expiry) + "). Picking a later one needs a reason.",
				override: { allowed: true, role: "any", reason_codes: db.reasons.fefo_override } };
		},

		"expiry.30d": function (ctx) {
			var serial = ctx.serial, surgery = ctx.surgeryDate;
			if (!serial || !surgery) { return { ok: true }; }
			var days = fmt.daysBetween(surgery, serial.expiry);
			if (days >= 30) { return { ok: true }; }
			return { ok: false, code: "expiry.30d",
				reason: "This one expires " + fmt.day(serial.expiry) + ", only " + days
					+ " days after the surgery. It needs a supervisor to release it.",
				override: { allowed: true, role: "supervisor", reason_codes: db.reasons.fefo_override } };
		},

		"serial.single_open_dc": function (ctx) {
			var serial = ctx.serial;
			if (!serial || !serial.dc || (ctx.dc && serial.dc === ctx.dc)) { return { ok: true }; }
			return { ok: false, code: "serial.single_open_dc",
				reason: "That one is already out on " + serial.dc + ". Bring it back before "
					+ "sending it anywhere else." };
		},

		"dc.balance_zero": function (ctx) {
			var dc = ctx.challan || ctx.doc;
			if (!dc || !dc.lines) { return { ok: true }; }
			var t = balance(dc);
			if (t.ok) { return { ok: true }; }
			return { ok: false, code: "dc.balance_zero",
				reason: t.balance + " of " + t.delivered + " still unaccounted for. Every item has "
					+ "to be used, returned, damaged, written off or reported missing before this "
					+ "challan can close." };
		},

		"usage.before_return": function (ctx) {
			var dc = ctx.challan || ctx.doc;
			if (!dc) { return { ok: true }; }
			if (dc.usage_ref || ctx.surgeryCancelled || dc.status === "Cancelled") { return { ok: true }; }
			return { ok: false, code: "usage.before_return",
				reason: "Nothing has been reported as used on this delivery yet. Capture the usage "
					+ "first, or mark the surgery cancelled." };
		},
	};

	var rules = {
		balance: balance,
		check: function (name, ctx) {
			var fn = CHECKS[name];
			if (!fn) { return { ok: true }; }
			return fn(ctx || {});
		},
		/* Runs a check and, on failure, puts the right modal up. onPass only
		   fires once the way is clear. */
		enforce: function (name, ctx, onPass) {
			var verdict = rules.check(name, ctx);
			if (verdict.ok) { return onPass(); }
			if (verdict.override && verdict.override.allowed) {
				return ui.overrideModal(verdict, onPass);
			}
			return ui.modal.open({
				title: "Cannot do that",
				note: verdict.reason,
				actions: [{ label: "OK", primary: true }],
			});
		},
		/* FEFO suggestion: earliest expiry first, available only. */
		fefo: function (itemId, branchId) {
			return where("serials", function (s) {
				return s.item === itemId && s.status === "available"
					&& (!branchId || s.branch === branchId);
			}).sort(function (a, b) { return a.expiry < b.expiry ? -1 : 1; })[0] || null;
		},
	};

	/* ================================================================== ui */

	var ui = {
		esc: esc,

		pill: function (status) {
			return '<span class="pill pill-' + flow.tone(status) + '">' + esc(status) + "</span>";
		},

		empty: function (headline, hint) {
			return '<div class="empty"><b>' + esc(headline) + "</b><span>"
				+ esc(hint || "") + "</span></div>";
		},

		/* cols: [{key, label, cls, render(row), when}]
		   A column with `when: false` is dropped rather than rendered empty —
		   a dead column reads as missing data. */
		table: function (el, opts) {
			var rows = opts.rows || [];
			if (!rows.length) {
				el.innerHTML = ui.empty(opts.emptyHead || "Nothing here yet",
					opts.emptyHint || "");
				return;
			}
			var cols = (opts.cols || []).filter(function (c) { return c.when !== false; });
			var head = cols.map(function (c) {
				return '<th class="' + (c.cls || "") + '">' + esc(c.label) + "</th>";
			}).join("");
			var body = rows.map(function (row, i) {
				var tds = cols.map(function (c) {
					var v = c.render ? c.render(row, i) : fmt.dash(row[c.key]);
					return '<td class="' + (c.cls || "") + '">' + v + "</td>";
				}).join("");
				return "<tr" + (opts.rowAttrs ? " " + opts.rowAttrs(row, i) : "") + ">" + tds + "</tr>";
			}).join("");
			el.innerHTML = '<div class="table-wrap"><table class="bill-table"><thead><tr>'
				+ head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
		},

		/* The narrow-column primitive: main block + a pill. */
		rows: function (el, opts) {
			var items = opts.items || [];
			if (!items.length) {
				el.innerHTML = ui.empty(opts.emptyHead || "Nothing here yet", opts.emptyHint || "");
				return;
			}
			el.innerHTML = '<div class="row-list">' + items.map(opts.line).join("") + "</div>";
		},

		modal: {
			open: function (opts) {
				ui.modal.close();
				var root = document.createElement("div");
				root.className = "modal-back";
				root.innerHTML = '<div class="modal' + (opts.wide ? " is-wide" : "") + '">'
					+ "<h2>" + esc(opts.title) + "</h2>"
					+ (opts.note ? '<p class="modal-note">' + esc(opts.note) + "</p>" : "")
					+ (opts.body || "")
					+ '<div class="modal-actions"></div></div>';
				var bar = $(".modal-actions", root);
				(opts.actions || [{ label: "Close" }]).forEach(function (a) {
					var b = document.createElement("button");
					b.className = "btn" + (a.primary ? " btn-primary" : a.danger ? " btn-danger" : "");
					b.textContent = a.label;
					b.addEventListener("click", function () {
						if (a.onClick && a.onClick(root) === false) { return; }
						ui.modal.close();
					});
					bar.appendChild(b);
				});
				document.body.appendChild(root);
				scan.pause();
				return root;
			},
			close: function () {
				var open = $(".modal-back");
				if (open) { open.remove(); }
				scan.resume();
			},
		},

		/* The supervisor / reason-code path shared by FEFO and the expiry rule. */
		overrideModal: function (verdict, onPass) {
			var codes = (verdict.override.reason_codes || []).map(function (c) {
				return '<option value="' + esc(c) + '">' + esc(c) + "</option>";
			}).join("");
			var root = ui.modal.open({
				title: verdict.override.role === "supervisor" ? "Supervisor override" : "Reason needed",
				note: verdict.reason,
				body: '<div class="field"><label class="field-label">Reason <span class="req">*</span></label>'
					+ '<select class="input" data-override-reason><option value="">Choose a reason</option>'
					+ codes + "</select></div>"
					+ (verdict.override.role === "supervisor"
						? '<div class="field"><label class="field-label">Supervisor code <span class="req">*</span></label>'
						  + '<input class="input" data-override-code placeholder="Any value in this mockup"></div>'
						: ""),
				actions: [
					{ label: "Cancel" },
					{ label: "Override", primary: true, onClick: function (r) {
						var reason = $("[data-override-reason]", r).value;
						var codeEl = $("[data-override-code]", r);
						if (!reason || (codeEl && !codeEl.value.trim())) {
							ui.toast("Pick a reason first.", "warn");
							return false;
						}
						onPass({ overridden: true, reason: reason });
					} },
				],
			});
			return root;
		},

		toast: function (text, kind) {
			var root = $(".toast-root");
			if (!root) {
				root = document.createElement("div");
				root.className = "toast-root";
				document.body.appendChild(root);
			}
			var t = document.createElement("div");
			t.className = "toast" + (kind ? " is-" + kind : "");
			t.textContent = text;
			root.appendChild(t);
			setTimeout(function () { t.remove(); }, 2600);
		},
	};

	/* ========================================================= scan engine
	 *
	 * A wedge reader is a keyboard: it types fast and ends with Enter. The
	 * catcher stays focused so a scan lands wherever the operator last
	 * touched. Every row also carries a Simulate scan button, which is the
	 * primary affordance on mobile — see the inputmode note below.
	 */

	var scan = {
		_cfg: null,
		_paused: false,

		mount: function (cfg) {
			scan._cfg = cfg;
			var input = cfg.input || $("[data-scan-catcher]");
			if (!input) { return; }
			scan._input = input;

			// On a phone an always-focused text input pins the soft keyboard
			// open and eats the screen. Let the Simulate buttons drive there.
			if (LNST.mode === "mobile") { input.setAttribute("inputmode", "none"); }

			input.addEventListener("keydown", function (e) {
				if (e.key !== "Enter") { return; }
				e.preventDefault();
				var code = input.value.trim();
				input.value = "";
				if (code) { scan.submit(code); }
			});

			input.addEventListener("paste", function (e) {
				var text = (e.clipboardData || window.clipboardData).getData("text");
				if (!text) { return; }
				e.preventDefault();
				input.value = "";
				scan.submit(text.trim());
			});

			input.addEventListener("blur", function () {
				if (scan._paused) { return; }
				setTimeout(function () { if (!scan._paused) { input.focus(); } }, 0);
			});

			document.addEventListener("click", function (e) {
				var btn = e.target.closest("[data-simulate]");
				if (btn) { scan.submit(btn.getAttribute("data-simulate")); }
			});

			scan.resume();
		},

		submit: function (code) {
			var cfg = scan._cfg;
			if (!cfg) { return; }
			var hit = cfg.resolve ? cfg.resolve(code) : null;
			if (!hit) {
				// A screen that supplies onMiss says it better than we can —
				// it knows whether the code was a stranger, a duplicate, or
				// simply not on this document. Only speak when nobody else will.
				if (cfg.onMiss) { cfg.onMiss(code); }
				else { ui.toast("Nothing here matches " + code + ".", "bad"); }
				return;
			}
			if (cfg.onHit) { cfg.onHit(hit, code); }
			var row = document.querySelector('[data-scan-code="' + code + '"]');
			if (row) { scan.tick(row); }
			scan.focusNext();
		},

		tick: function (rowEl) {
			rowEl.classList.add("is-hit");
			setTimeout(function () { rowEl.classList.remove("is-hit"); }, 460);
		},

		focusNext: function () {
			var next = $("[data-scan-pending]");
			if (next && next.scrollIntoView) {
				next.scrollIntoView({ block: "center", behavior: "smooth" });
			}
		},

		simulate: function (code) { scan.submit(code); },
		pause: function () { scan._paused = true; },
		resume: function () {
			scan._paused = false;
			if (scan._input) { scan._input.focus(); }
		},
	};

	/* ====================================================== signature pad
	 *
	 * Mouse and touch, sized to the device pixel ratio so a signature taken on
	 * a phone is not a blurry smear. Returns a small handle rather than
	 * exposing the canvas, because callers only ever need these four things.
	 */

	function signature(canvas) {
		var ctx = canvas.getContext("2d");
		var drawing = false;
		var dirty = false;

		function resize() {
			var ratio = window.devicePixelRatio || 1;
			var box = canvas.getBoundingClientRect();
			// A zero-width canvas (parent still hidden) would silently produce
			// a blank signature, so leave it alone until it has a size.
			if (!box.width) { return; }
			canvas.width = box.width * ratio;
			canvas.height = box.height * ratio;
			ctx.scale(ratio, ratio);
			ctx.lineWidth = 1.8;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.strokeStyle = "#1B2733";
		}

		function pos(event) {
			var box = canvas.getBoundingClientRect();
			var point = event.touches ? event.touches[0] : event;
			return { x: point.clientX - box.left, y: point.clientY - box.top };
		}

		function down(event) {
			event.preventDefault();
			drawing = true; dirty = true;
			var p = pos(event);
			ctx.beginPath();
			ctx.moveTo(p.x, p.y);
		}

		function move(event) {
			if (!drawing) { return; }
			event.preventDefault();
			var p = pos(event);
			ctx.lineTo(p.x, p.y);
			ctx.stroke();
		}

		function up() { drawing = false; }

		canvas.addEventListener("mousedown", down);
		canvas.addEventListener("mousemove", move);
		window.addEventListener("mouseup", up);
		canvas.addEventListener("touchstart", down, { passive: false });
		canvas.addEventListener("touchmove", move, { passive: false });
		canvas.addEventListener("touchend", up);

		return {
			resize: resize,
			clear: function () {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				dirty = false;
			},
			isEmpty: function () { return !dirty; },
			/* Small on purpose: these go into localStorage, which is a few MB
			   for the whole demo. */
			toDataURL: function () {
				return dirty ? canvas.toDataURL("image/png") : null;
			},
		};
	}

	/* Shrink a chosen photo before it is ever stored. A phone camera JPEG is
	   several MB and would blow the localStorage quota on the second one. */
	function shrinkImage(file, maxPx, quality) {
		return new Promise(function (resolve, reject) {
			var reader = new FileReader();
			reader.onerror = function () { reject(new Error("Could not read that file.")); };
			reader.onload = function () {
				var img = new Image();
				img.onerror = function () { reject(new Error("That is not an image.")); };
				img.onload = function () {
					var scale = Math.min(1, (maxPx || 640) / Math.max(img.width, img.height));
					var canvas = document.createElement("canvas");
					canvas.width = Math.round(img.width * scale);
					canvas.height = Math.round(img.height * scale);
					canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
					resolve(canvas.toDataURL("image/jpeg", quality || 0.7));
				};
				img.src = reader.result;
			};
			reader.readAsDataURL(file);
		});
	}

	/* True on a phone or tablet, which is what decides whether the photo input
	   opens the camera. A layout mode would be the wrong test: a terminal
	   screen can still be running on a tablet. */
	function isTouchDevice() {
		return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
	}

	/* ============================================================= session
	 *
	 * Read through lnst_session.js — see that file for the contract. Screens
	 * are deliberately NOT gated on it: every screen must render cold from a
	 * bare URL or the mockup cannot be demoed. The fallback below only keeps a
	 * screen alive if it is ever opened without the session script.
	 */

	var session = LNST.session || {
		get: function () { return null; },
		signOut: function () { window.location.href = "/lnst/login"; },
	};

	/* ================================================================ boot */

	LNST.screen = function (key, impl) { screens[key] = impl; };

	LNST.boot = function (ctx) {
		LNST.boot_ctx = ctx || {};
		LNST.mode = LNST.boot_ctx.mode || "desk";
		LNST.screenKey = LNST.boot_ctx.screen || null;
		store.load();
		LNST.db = db;

		if (LNST.mountHeader) {
			LNST.mountHeader(session.get(), "Demo user");
		}
		$$("[data-lnst-reset]").forEach(function (el) {
			el.addEventListener("click", function () {
				store.reset();
				ui.toast("Demo data reset.", "ok");
				setTimeout(function () { window.location.reload(); }, 400);
			});
		});

		var impl = screens[LNST.screenKey];
		if (LNST.screenKey && !impl) {
			// One clear console error beats a silently blank page.
			window.console.error("LNST: no screen registered for '" + LNST.screenKey
				+ "'. Did its JS file load?");
			return;
		}
		if (impl && impl.start) { impl.start(LNST.boot_ctx); }
	};

	/* ============================================================== export */

	LNST.store = store;
	LNST.get = get;
	LNST.where = where;
	LNST.on = on;
	LNST.emit = emit;
	LNST.fmt = fmt;
	LNST.flow = flow;
	LNST.rules = rules;
	LNST.ui = ui;
	LNST.scan = scan;
	LNST.session = session;
	LNST.esc = esc;
	LNST.$ = $;
	LNST.$$ = $$;
	LNST.debounce = debounce;
	LNST.signature = signature;
	LNST.shrinkImage = shrinkImage;
	LNST.isTouchDevice = isTouchDevice;

	window.LNST = LNST;
})(window, document);
