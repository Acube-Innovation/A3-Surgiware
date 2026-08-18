/* Copyright (c) 2026, Acube Innovations Pvt Ltd and contributors
 *
 * /lnst/inward — putting unused stock back on the shelf.
 *
 * Rack first. A rack scan opens a rack, and while it is open only items that
 * belong on that rack can be shelved. Scan one that lives elsewhere and the
 * screen says where, and waits for that rack to be scanned instead. That is
 * the whole discipline of a put-away: you are standing in front of one rack at
 * a time, and the app should refuse to pretend otherwise.
 *
 * The ownership rule bites here too: consignment and purchased stock never
 * share a rack.
 */
LNST.screen("inward", {
	start: function () {
		var db = LNST.db, ui = LNST.ui, fmt = LNST.fmt, $ = LNST.$;

		var state = {
			open: null,
			rack: null,        // the rack currently open
			shelved: {},       // serial/line key -> rack it went to
			filters: { search: "", branch: "", state: "open" },
		};

		function hospital(id) { var h = LNST.get("hospitals", id); return h ? h.short : id; }
		function itemName(id) { var i = LNST.get("items", id); return i ? i.name : id; }
		function lineKey(l, i) { return l.serial || "LINE-" + i; }

		/* What a challan still owes: delivered, not used, not yet back. */
		function owed(dc) {
			return dc.lines.filter(function (l) {
				return !l.used && !l.returned && !l.missing && !l.written_off;
			});
		}

		function hasUsage(dc) { return !!dc.usage_ref; }
		function fullyBack(dc) { return hasUsage(dc) && owed(dc).length === 0; }

		/* Where an item goes back to. Always a rack in the branch that issued
		   the challan — goods do not migrate between warehouses by being used —
		   and always one whose ownership lane matches, so the no-mix rule can
		   never be triggered by the destination the screen itself suggested.
		   Damaged stock goes to the damage rack instead of back into stock. */
		function homeRack(line, dc) {
			if (line.damaged) { return dc.branch + "-D-01"; }
			return dc.branch + (line.ownership === "purchased" ? "-B-01" : "-A-01");
		}

		function rackOwnership(rackId) {
			// A rack holds whatever its zone is set aside for. C and Q are
			// return/quarantine lanes and take either kind.
			var rack = LNST.get("racks", rackId);
			if (!rack) { return null; }
			if (rack.kind === "returns" || rack.kind === "quarantine"
				|| rack.kind === "damage") { return null; }
			return rack.zone === "A" ? "consignment" : "purchased";
		}

		/* --------------------------------------------------------- filters */

		function options(el, values, blank) {
			el.innerHTML = '<option value="">' + blank + "</option>"
				+ values.map(function (v) {
					return '<option value="' + ui.esc(v.id) + '">' + ui.esc(v.label) + "</option>";
				}).join("");
		}
		options($("[data-f-branch]"), db.branches.map(function (b) {
			return { id: b.id, label: b.name };
		}), "All branches");
		$("[data-f-state]").innerHTML =
			'<option value="open">Waiting to be shelved</option>'
			+ '<option value="done">Shelved</option>'
			+ '<option value="">All</option>';

		function visible() {
			var f = state.filters, q = f.search.toLowerCase();
			return db.challans.filter(function (c) {
				if (!hasUsage(c)) { return false; }          // usage first, always
				if (f.state === "open" && fullyBack(c)) { return false; }
				if (f.state === "done" && !fullyBack(c)) { return false; }
				if (f.branch && c.branch !== f.branch) { return false; }
				if (q) {
					var hay = (c.id + " " + hospital(c.hospital)).toLowerCase();
					if (hay.indexOf(q) === -1) { return false; }
				}
				return true;
			}).sort(function (a, b) { return a.surgery_date < b.surgery_date ? -1 : 1; });
		}

		/* ------------------------------------------------------------ kpis */

		function paintKpis() {
			var withUsage = db.challans.filter(hasUsage);
			var waiting = withUsage.filter(function (c) { return !fullyBack(c); });
			var items = waiting.reduce(function (n, c) { return n + owed(c).length; }, 0);
			var overdue = waiting.filter(function (c) {
				return c.expected_return && c.expected_return < db.meta.today;
			}).length;

			[
				{ label: "Challans to shelve", value: waiting.length, foot: "usage reported, stock out",
				  tone: waiting.length ? "warn" : "good" },
				{ label: "Items to shelve", value: items, foot: "packets to put back",
				  tone: items ? "warn" : "" },
				{ label: "Past return date", value: overdue, foot: "should already be back",
				  tone: overdue ? "bad" : "" },
				{ label: "Shelved", value: withUsage.length - waiting.length,
				  foot: "everything back on a rack", tone: "good" },
			].forEach(function () {});

			var tiles = [
				{ label: "Challans to shelve", value: waiting.length,
				  foot: "usage reported, stock out", tone: waiting.length ? "warn" : "good" },
				{ label: "Items to shelve", value: items, foot: "packets to put back",
				  tone: items ? "warn" : "" },
				{ label: "Past return date", value: overdue, foot: "should already be back",
				  tone: overdue ? "bad" : "" },
				{ label: "Shelved", value: withUsage.length - waiting.length,
				  foot: "everything back on a rack", tone: "good" },
			];
			$("[data-kpis]").innerHTML = tiles.map(function (k) {
				return '<div class="tile' + (k.tone ? " is-" + k.tone : "") + '">'
					+ '<div class="tile-label">' + ui.esc(k.label) + "</div>"
					+ '<div class="tile-value">' + ui.esc(k.value) + "</div>"
					+ '<div class="tile-foot">' + ui.esc(k.foot) + "</div></div>";
			}).join("");
		}

		/* ------------------------------------------------------------- LHS */

		function paintList() {
			var rows = visible();
			$("[data-list-count]").textContent = rows.length + " shown";
			ui.table($("[data-list]"), {
				rows: rows,
				emptyHead: "Nothing to shelve",
				emptyHint: "A challan lands here once its usage has been captured.",
				rowAttrs: function (c) {
					return 'data-dc="' + ui.esc(c.id) + '" class="is-clickable'
						+ (state.open === c.id ? " is-open" : "") + '"';
				},
				cols: [
					{ label: "Delivery no", render: function (c) {
						return '<span class="doc-no">' + ui.esc(c.id) + "</span><small>"
							+ ui.esc(c.usage_ref || "—") + "</small>"; } },
					{ label: "Hospital", render: function (c) {
						return "<b>" + ui.esc(hospital(c.hospital)) + "</b><small>"
							+ fmt.day(c.surgery_date) + "</small>"; } },
					{ label: "Return by", render: function (c) {
						var late = c.expected_return && c.expected_return < db.meta.today;
						return (late ? '<b style="color:var(--stop)">' : "<span>")
							+ fmt.day(c.expected_return) + (late ? "</b>" : "</span>"); } },
					{ label: "To shelve", cls: "num", render: function (c) {
						return owed(c).length; } },
					{ label: "State", render: function (c) {
						return fullyBack(c)
							? '<span class="pill pill-good">Shelved</span>'
							: '<span class="pill pill-warn">Waiting</span>'; } },
				],
			});
		}

		/* ------------------------------------------------------------- RHS */

		function paintDetail() {
			var dc = state.open ? LNST.get("challans", state.open) : null;
			var btn = $("[data-open-putaway]");
			if (!dc) {
				$("[data-detail-title]").textContent = "Nothing selected";
				$("[data-detail-head]").innerHTML = "";
				$("[data-detail-lines]").innerHTML = ui.empty("Pick a challan on the left",
					"What it owes back, and where each packet lives, shows here.");
				btn.disabled = true;
				return;
			}
			var rest = owed(dc);
			btn.disabled = !rest.length;

			var h = LNST.get("hospitals", dc.hospital);
			$("[data-detail-title]").textContent = dc.id;
			$("[data-detail-head]").innerHTML = '<dl class="kv">'
				+ "<dt>Hospital</dt><dd>" + ui.esc(h ? h.name : dc.hospital) + "</dd>"
				+ "<dt>Usage</dt><dd>" + ui.esc(dc.usage_ref || "—") + "</dd>"
				+ "<dt>Return by</dt><dd>" + fmt.day(dc.expected_return) + "</dd>"
				+ "<dt>Owed back</dt><dd>" + rest.length + " of " + dc.lines.length
				+ " packets</dd></dl>";

			ui.table($("[data-detail-lines]"), {
				rows: dc.lines,
				emptyHead: "No lines",
				cols: [
					{ label: "Item", render: function (l) {
						return "<b>" + ui.esc(itemName(l.item)) + "</b><small>"
							+ ui.esc(l.lot || "—") + "</small>"; } },
					{ label: "Serial", cls: "sn", render: function (l) {
						return ui.esc(l.serial || "—"); } },
					{ label: "Own", render: function (l) { return ui.esc(l.ownership); } },
					{ label: "Rack", render: function (l) {
						return l.used ? "—" : ui.esc(homeRack(l, dc)); } },
					{ label: "State", render: function (l) {
						if (l.used) { return '<span class="pill pill-muted">Used</span>'; }
						if (l.returned) { return '<span class="pill pill-good">Shelved</span>'; }
						if (l.missing) { return '<span class="pill pill-bad">Missing</span>'; }
						return '<span class="pill pill-warn">To shelve</span>'; } },
				],
			});
		}

		/* ================================================= rack-first scan */

		var pop = $("[data-put-pop]");

		function openPutaway() {
			var dc = LNST.get("challans", state.open);
			if (!dc) { return; }
			state.rack = null;
			state.shelved = {};
			$("[data-put-title]").textContent = "Put-away · " + dc.id;
			$("[data-put-sub]").textContent = hospital(dc.hospital) + " · "
				+ owed(dc).length + " packets to shelve";
			pop.hidden = false;
			paintPut();
			LNST.scan.mount({
				input: $("[data-scan-catcher]", pop),
				resolve: resolvePut,
				onHit: onPutHit,
				onMiss: onPutMiss,
			});
			LNST.scan.resume();
		}

		/* A code is either a rack or an item, and which one is legal depends on
		   whether a rack is currently open. */
		function resolvePut(code) {
			var dc = LNST.get("challans", state.open);
			var rack = LNST.get("racks", code);
			if (rack) {
				if (rack.branch !== dc.branch) {
					return { outcome: "wrong_branch", rack: rack, dc: dc };
				}
				return { outcome: "rack", rack: rack };
			}

			var rows = owed(dc).map(function (l) {
				return { line: l, idx: dc.lines.indexOf(l), code: lineKey(l, dc.lines.indexOf(l)) };
			});
			var row = rows.filter(function (r) { return r.code === code; })[0];
			if (!row) {
				var already = state.shelved[code];
				if (already) { return { outcome: "already", code: code, rack: already }; }
				return null;
			}
			if (!state.rack) { return { outcome: "no_rack", row: row, dc: dc }; }

			var want = homeRack(row.line, dc);
			if (want !== state.rack.id) {
				return { outcome: "other_rack", row: row, want: want };
			}
			var mix = rackOwnership(state.rack.id);
			if (mix && row.line.ownership && mix !== row.line.ownership) {
				return { outcome: "mix", row: row, rackOwn: mix };
			}
			return { outcome: "shelve", row: row };
		}

		function onPutHit(v, code) {
			var dc = LNST.get("challans", state.open);

			if (v.outcome === "rack") {
				state.rack = v.rack;
				ui.toast("Rack " + v.rack.id + " open — scan the packets for this rack.", "ok");
				paintPut();
				return;
			}
			if (v.outcome === "wrong_branch") {
				ui.toast("Rack " + v.rack.id + " is at " + v.rack.branch
					+ ". This challan came back to " + v.dc.branch + ".", "bad");
				return;
			}
			if (v.outcome === "no_rack") {
				ui.toast("Scan a rack first — " + itemName(v.row.line.item)
					+ " belongs on " + homeRack(v.row.line, v.dc) + ".", "warn");
				return;
			}
			if (v.outcome === "other_rack") {
				ui.toast(itemName(v.row.line.item) + " lives on " + v.want
					+ ", not " + state.rack.id + ". Scan that rack next.", "warn");
				return;
			}
			if (v.outcome === "mix") {
				ui.toast("That is " + v.row.line.ownership + " stock and "
					+ state.rack.id + " holds " + v.rackOwn
					+ ". Consignment and purchased never share a rack.", "bad");
				return;
			}
			if (v.outcome === "already") {
				ui.toast("Already shelved on " + v.rack + ".", "warn");
				return;
			}

			// shelve
			state.shelved[v.row.code] = state.rack.id;
			ui.toast("Matched · " + itemName(v.row.line.item) + " on " + state.rack.id
				+ " · " + Object.keys(state.shelved).length + " of "
				+ owed(dc).length + " shelved.", "ok");
			paintPut();
		}

		function onPutMiss(code) {
			ui.toast("Nothing on this challan matches " + code
				+ " — and it is not a rack here.", "bad");
		}

		function paintPut() {
			var dc = LNST.get("challans", state.open);
			var rows = owed(dc).map(function (l) {
				var i = dc.lines.indexOf(l);
				return { line: l, idx: i, code: lineKey(l, i), want: homeRack(l, dc) };
			});
			var done = Object.keys(state.shelved).length;

			$("[data-put-done]").textContent = done;
			$("[data-put-total]").textContent = "/" + rows.length;
			$("[data-put-bar]").style.width = (rows.length ? (done / rows.length) * 100 : 0) + "%";
			$("[data-put-rack]").textContent = state.rack ? state.rack.id : "No rack open";
			$("[data-put-prompt]").textContent = state.rack
				? "Rack open — scan the packets that live here"
				: "Scan a rack to begin";
			$("[data-close-rack]").hidden = !state.rack;

			var left = rows.filter(function (r) { return !state.shelved[r.code]; });
			var racksLeft = {};
			left.forEach(function (r) { racksLeft[r.want] = (racksLeft[r.want] || 0) + 1; });
			var names = Object.keys(racksLeft);
			$("[data-put-rest]").textContent = left.length
				? left.length + " left across " + names.length + " rack"
					+ (names.length > 1 ? "s" : "") + ": " + names.join(", ")
				: "Everything is back on a rack.";

			// Grouped by destination rack, so the order to walk is obvious.
			var groups = {};
			rows.forEach(function (r) { (groups[r.want] = groups[r.want] || []).push(r); });

			$("[data-put-list]").innerHTML = Object.keys(groups).sort().map(function (rackId) {
				var isOpen = state.rack && state.rack.id === rackId;
				var pending = groups[rackId].filter(function (r) { return !state.shelved[r.code]; });
				return '<div class="rack-group' + (isOpen ? " is-open" : "") + '">'
					+ '<div class="rack-group-head">'
					+ "<b>" + ui.esc(rackId) + "</b>"
					+ '<span class="panel-note">' + pending.length + " to shelve</span>"
					+ (isOpen ? '<span class="pill pill-good">Open</span>'
						: '<button type="button" class="btn btn-sm" data-simulate="'
							+ ui.esc(rackId) + '">Scan rack</button>')
					+ "</div>"
					+ groups[rackId].map(function (r) {
						var hit = !!state.shelved[r.code];
						return '<div class="scan-line scan-row' + (hit ? " is-done" : "") + '"'
							+ ' data-scan-code="' + ui.esc(r.code) + '"'
							+ (hit ? "" : " data-scan-pending") + ">"
							+ '<span class="row-main"><b>' + ui.esc(itemName(r.line.item))
							+ "</b><small>" + ui.esc(r.line.ownership) + " · "
							+ ui.esc(r.line.lot || "not serialised") + "</small></span>"
							+ '<span class="sn">' + ui.esc(r.line.serial || "—") + "</span>"
							+ (hit ? '<span class="tick">&#10003;</span>'
								: isOpen
									? '<button type="button" class="btn btn-sm" data-simulate="'
										+ ui.esc(r.code) + '">Simulate scan</button>'
									: '<span class="panel-note">scan ' + ui.esc(rackId)
										+ " first</span>")
							+ "</div>";
					}).join("")
					+ "</div>";
			}).join("");
		}

		function finishPutaway() {
			var dc = LNST.get("challans", state.open);
			var keys = Object.keys(state.shelved);
			if (!keys.length) {
				ui.toast("Nothing has been shelved yet.", "warn");
				return;
			}
			LNST.store.tx(function () {
				dc.lines.forEach(function (l, i) {
					var key = lineKey(l, i);
					if (!state.shelved[key]) { return; }
					l.returned = l.delivered;
					l.line_status = "Returned";
					var serial = l.serial ? LNST.get("serials", l.serial) : null;
					if (serial) {
						serial.status = "available";
						serial.rack = state.shelved[key];
						serial.hospital = null;
						serial.dc = null;
						serial.history.push({ at: db.meta.today,
							what: "Put away on " + state.shelved[key] });
					}
				});
				var rest = owed(dc).length;
				dc.status = rest ? "Partially Returned" : "Fully Returned";
				var req = LNST.get("requests", dc.request);
				if (req) { req.status = dc.status; }
			});
			pop.hidden = true;
			LNST.scan.pause();
			paintList(); paintDetail(); paintKpis();
			ui.toast(keys.length + " packets shelved · " + dc.status.toLowerCase() + ".", "ok");
		}

		/* --------------------------------------------------- print / excel */

		function exportCsv() {
			var head = ["Delivery no", "Usage", "Hospital", "Return by", "To shelve", "State"];
			var body = visible().map(function (c) {
				return [c.id, c.usage_ref || "", hospital(c.hospital), c.expected_return || "",
					owed(c).length, fullyBack(c) ? "Shelved" : "Waiting"];
			});
			var csv = [head].concat(body).map(function (l) {
				return l.map(function (cell) {
					var v = String(cell == null ? "" : cell);
					return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
				}).join(",");
			}).join("\r\n");
			var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
			var a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = "lnst-putaway-" + db.meta.today + ".csv";
			document.body.appendChild(a); a.click(); a.remove();
			ui.toast(body.length + " rows exported.", "ok");
		}

		/* ---------------------------------------------------------- wiring */

		$("[data-list]").addEventListener("click", function (e) {
			var tr = e.target.closest("[data-dc]");
			if (!tr) { return; }
			state.open = tr.getAttribute("data-dc");
			paintList(); paintDetail();
		});
		$("[data-open-putaway]").addEventListener("click", openPutaway);
		$("[data-put-finish]").addEventListener("click", finishPutaway);
		$("[data-put-close]").addEventListener("click", function () {
			pop.hidden = true; LNST.scan.pause();
		});
		$("[data-close-rack]").addEventListener("click", function () {
			state.rack = null; paintPut();
			ui.toast("Rack closed — scan the next one.", "ok");
		});
		pop.addEventListener("click", function (e) {
			if (e.target === pop) { pop.hidden = true; LNST.scan.pause(); }
		});
		document.addEventListener("keydown", function (e) {
			if (e.key === "Escape" && !pop.hidden) { pop.hidden = true; LNST.scan.pause(); }
		});

		var onFilter = LNST.debounce(function () {
			state.filters.search = $("[data-f-search]").value.trim();
			state.filters.branch = $("[data-f-branch]").value;
			state.filters.state = $("[data-f-state]").value;
			paintList();
		}, 220);
		["[data-f-search]", "[data-f-branch]", "[data-f-state]"].forEach(function (sel) {
			$(sel).addEventListener("input", onFilter);
			$(sel).addEventListener("change", onFilter);
		});
		$("[data-f-clear]").addEventListener("click", function () {
			state.filters = { search: "", branch: "", state: "open" };
			$("[data-f-search]").value = ""; $("[data-f-branch]").value = "";
			$("[data-f-state]").value = "open"; paintList();
		});
		$("[data-print]").addEventListener("click", function () { window.print(); });
		$("[data-excel]").addEventListener("click", exportCsv);

		paintKpis(); paintList();
		var first = visible()[0];
		if (first) { state.open = first.id; }
		paintList(); paintDetail();
	},
});
