/* Copyright (c) 2026, Acube Innovations Pvt Ltd and contributors
 *
 * /lnst/usage — what was actually used in theatre.
 *
 * The rule the whole screen turns on: scanning a packet says it was opened and
 * used. Anything NOT scanned is still at the hospital and owes a return. So
 * finishing the scan does not need every line read — it needs an honest
 * account of which ones were.
 */
LNST.screen("usage", {
	start: function () {
		var db = LNST.db, ui = LNST.ui, fmt = LNST.fmt, $ = LNST.$;

		var state = { open: null, scanned: {}, filters: { search: "", branch: "", state: "open" } };

		function hospital(id) { var h = LNST.get("hospitals", id); return h ? h.short : id; }
		function itemName(id) { var i = LNST.get("items", id); return i ? i.name : id; }

		/* A delivery is ready for usage once it has been signed for, and stays
		   here until somebody reports what happened to it. */
		function awaitingUsage(c) { return c.status === "Delivered" && !c.usage_ref; }
		function captured(c) { return !!c.usage_ref; }

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
			'<option value="open">Usage not captured</option>'
			+ '<option value="done">Usage captured</option>'
			+ '<option value="">All delivered</option>';

		function visible() {
			var f = state.filters, q = f.search.toLowerCase();
			return db.challans.filter(function (c) {
				// Only things that actually reached a hospital.
				if (!captured(c) && c.status !== "Delivered") { return false; }
				if (f.state === "open" && !awaitingUsage(c)) { return false; }
				if (f.state === "done" && !captured(c)) { return false; }
				if (f.branch && c.branch !== f.branch) { return false; }
				if (q) {
					var hay = (c.id + " " + c.request + " " + hospital(c.hospital)
						+ " " + c.surgeon).toLowerCase();
					if (hay.indexOf(q) === -1) { return false; }
				}
				return true;
			}).sort(function (a, b) { return a.surgery_date < b.surgery_date ? 1 : -1; });
		}

		/* ------------------------------------------------------------ kpis */

		function paintKpis() {
			var delivered = db.challans.filter(function (c) {
				return c.status === "Delivered" || captured(c);
			});
			var open = db.challans.filter(awaitingUsage).length;
			var overdue = db.challans.filter(function (c) {
				return awaitingUsage(c) && fmt.daysBetween(c.surgery_date, db.meta.today) > 1;
			}).length;
			var owed = 0;
			db.challans.filter(captured).forEach(function (c) {
				var t = LNST.rules.balance(c);
				owed += t.delivered - t.used - t.returned - t.damaged - t.written_off - t.missing;
			});

			var tiles = [
				{ label: "Usage not captured", value: open, foot: "signed for, nothing reported",
				  tone: open ? "warn" : "good" },
				{ label: "Overdue", value: overdue, foot: "surgery was over a day ago",
				  tone: overdue ? "bad" : "" },
				{ label: "Captured", value: delivered.length - open, foot: "reported and costed",
				  tone: "good" },
				{ label: "Awaiting return", value: owed, foot: "items still at hospitals",
				  tone: owed ? "warn" : "" },
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
				emptyHead: "Nothing waiting",
				emptyHint: "A delivery appears here once it has been signed for.",
				rowAttrs: function (c) {
					return 'data-dc="' + ui.esc(c.id) + '" class="is-clickable'
						+ (state.open === c.id ? " is-open" : "") + '"';
				},
				cols: [
					{ label: "Delivery no", render: function (c) {
						return '<span class="doc-no">' + ui.esc(c.id) + "</span><small>"
							+ ui.esc(c.request) + "</small>"; } },
					{ label: "Hospital", render: function (c) {
						return "<b>" + ui.esc(hospital(c.hospital)) + "</b><small>"
							+ ui.esc(c.surgeon) + "</small>"; } },
					{ label: "Surgery", render: function (c) {
						return fmt.day(c.surgery_date) + "<small>"
							+ ui.esc(c.patient.case_no) + "</small>"; } },
					{ label: "Used", cls: "num", render: function (c) {
						var t = LNST.rules.balance(c);
						return captured(c) ? t.used + " / " + t.delivered : "—"; } },
					{ label: "Usage", render: function (c) {
						return captured(c)
							? '<span class="pill pill-good">Captured</span>'
							: '<span class="pill pill-warn">Not captured</span>'; } },
				],
			});
		}

		/* ------------------------------------------------------------- RHS */

		function paintDetail() {
			var dc = state.open ? LNST.get("challans", state.open) : null;
			var btn = $("[data-open-scan]");

			if (!dc) {
				$("[data-detail-title]").textContent = "Nothing selected";
				$("[data-detail-head]").innerHTML = "";
				$("[data-detail-lines]").innerHTML = ui.empty("Pick a delivery on the left",
					"Its packets and what happened to them show here.");
				btn.disabled = true;
				return;
			}

			var done = captured(dc);
			btn.disabled = done;
			btn.hidden = done;

			var h = LNST.get("hospitals", dc.hospital);
			var r = dc.receiver || {};
			$("[data-detail-title]").textContent = dc.id;
			$("[data-detail-head]").innerHTML = '<dl class="kv">'
				+ "<dt>Hospital</dt><dd>" + ui.esc(h ? h.name : dc.hospital) + "</dd>"
				+ "<dt>Case</dt><dd>" + ui.esc(dc.patient.case_no) + " · "
				+ ui.esc(dc.patient.name) + " · " + ui.esc(dc.surgeon) + "</dd>"
				+ "<dt>Surgery</dt><dd>" + fmt.day(dc.surgery_date) + " · " + ui.esc(dc.side) + "</dd>"
				+ "<dt>Signed for by</dt><dd>" + ui.esc(r.name || "—")
				+ (r.phone ? " · " + ui.esc(r.phone) : "") + "</dd>"
				+ "<dt>Return by</dt><dd>" + fmt.day(dc.expected_return) + "</dd>"
				+ "</dl>"
				+ (done ? usageSummary(dc) : "");

			paintLines(dc, done);
		}

		function usageSummary(dc) {
			var t = LNST.rules.balance(dc);
			var owed = t.delivered - t.used - t.returned - t.damaged - t.written_off - t.missing;
			return '<div class="dc-card"><div class="dc-card-head"><b>Usage captured</b>'
				+ '<span class="pill pill-good">' + ui.esc(dc.usage_ref) + "</span></div>"
				+ '<div class="usage-tally">'
				+ tally("Delivered", t.delivered, "")
				+ tally("Used", t.used, "good")
				+ tally("Missing", t.missing, t.missing ? "bad" : "")
				+ tally("To come back", owed, owed ? "warn" : "good")
				+ "</div></div>";
		}

		function tally(label, value, tone) {
			return '<div class="tally' + (tone ? " is-" + tone : "") + '">'
				+ '<span class="tally-n">' + value + "</span>"
				+ '<span class="tally-l">' + ui.esc(label) + "</span></div>";
		}

		var DISPOSITIONS = ["Used", "To Return", "Damaged at Site", "Opened-Unused", "Missing"];

		function paintLines(dc, done) {
			var usage = dc.usage_ref ? LNST.get("usage", dc.usage_ref) : null;

			ui.table($("[data-detail-lines]"), {
				rows: dc.lines,
				emptyHead: "This challan has no lines",
				cols: [
					{ label: "#", cls: "num", render: function (l, i) { return i + 1; } },
					{ label: "Item", render: function (l) {
						return "<b>" + ui.esc(itemName(l.item)) + "</b><small>"
							+ ui.esc(l.lot || "—")
							+ (l.expiry ? " · exp " + fmt.day(l.expiry) : "") + "</small>"; } },
					{ label: "Serial", cls: "sn", render: function (l) {
						return ui.esc(l.serial || "—"); } },
					{ label: "Qty", cls: "num", render: function (l) { return l.delivered; } },
					{ label: "Disposition", render: function (l, i) {
						if (!done) {
							return state.scanned[lineKey(l, i)]
								? '<span class="pill pill-good">Used</span>'
								: '<span class="pill pill-muted">Not scanned</span>';
						}
						// Captured: the account can still be corrected — a packet
						// thought returnable often turns out to be missing.
						var row = usage && usage.lines[i];
						var current = row ? row.disposition : "To Return";
						return '<select class="input input-mini" data-disp="' + i + '">'
							+ DISPOSITIONS.map(function (d) {
								return '<option value="' + d + '"'
									+ (d === current ? " selected" : "") + ">" + d + "</option>";
							}).join("") + "</select>"; } },
				],
			});

			if (done) {
				LNST.$$("[data-disp]").forEach(function (sel) {
					sel.addEventListener("change", function () {
						changeDisposition(dc, parseInt(sel.getAttribute("data-disp"), 10), sel.value);
					});
				});
			}
		}

		function lineKey(l, i) { return l.serial || "LINE-" + i; }

		/* Re-deciding a line after capture. Only the tallies that the balance
		   identity knows about are touched. */
		function changeDisposition(dc, idx, value) {
			LNST.store.tx(function () {
				var line = dc.lines[idx];
				var usage = LNST.get("usage", dc.usage_ref);
				if (usage && usage.lines[idx]) { usage.lines[idx].disposition = value; }
				line.used = value === "Used" ? line.delivered : 0;
				line.missing = value === "Missing" ? line.delivered : 0;
				line.damaged = value === "Damaged at Site" ? line.delivered : 0;
				line.written_off = value === "Opened-Unused" ? line.delivered : 0;
			});
			paintDetail();
			paintList();
			paintKpis();
			ui.toast(itemName(dc.lines[idx].item) + " marked " + value.toLowerCase() + ".", "ok");
		}

		/* ======================================================= scanning */

		var pop = $("[data-scan-pop]");

		function scannable(dc) {
			return dc.lines.map(function (l, i) {
				return { line: l, idx: i, code: lineKey(l, i) };
			});
		}

		function openScan() {
			var dc = LNST.get("challans", state.open);
			if (!dc) { return; }
			state.scanned = {};
			$("[data-scan-title]").textContent = "Scan used packets · " + dc.id;
			$("[data-scan-sub]").textContent = hospital(dc.hospital) + " · "
				+ dc.patient.case_no + " · surgery " + fmt.day(dc.surgery_date);
			pop.hidden = false;
			paintScan();
			LNST.scan.mount({
				input: $("[data-scan-catcher]", pop),
				resolve: resolveScan,
				onHit: onHit,
				onMiss: onMiss,
			});
			LNST.scan.resume();
		}

		function resolveScan(code) {
			var dc = LNST.get("challans", state.open);
			var rows = scannable(dc);
			for (var i = 0; i < rows.length; i++) {
				if (rows[i].code !== code) { continue; }
				if (state.scanned[code]) { return { outcome: "already", row: rows[i] }; }
				return { outcome: "used", row: rows[i] };
			}
			return null;
		}

		function onHit(v, code) {
			$("[data-scan-last]").textContent = code;
			if (v.outcome === "already") {
				ui.toast(itemName(v.row.line.item)
					+ " is already marked used on this delivery.", "warn");
				return;
			}
			state.scanned[code] = 1;
			var dc = LNST.get("challans", state.open);
			ui.toast("Used · " + itemName(v.row.line.item)
				+ " · " + Object.keys(state.scanned).length + " of "
				+ dc.lines.length + " packets.", "ok");
			paintScan();
		}

		function onMiss(code) {
			$("[data-scan-last]").textContent = code;
			var known = LNST.get("serials", code);
			ui.toast(known
				? known.sn + " went out on " + (known.dc || "another challan")
					+ " — it is not on this one."
				: "Nothing on this delivery matches " + code + ".", "bad");
		}

		function paintScan() {
			var dc = LNST.get("challans", state.open);
			var rows = scannable(dc);
			var done = Object.keys(state.scanned).length;

			$("[data-scan-done]").textContent = done;
			$("[data-scan-total]").textContent = "/" + rows.length;
			$("[data-scan-bar]").style.width = (rows.length ? (done / rows.length) * 100 : 0) + "%";
			$("[data-scan-rest]").textContent = (rows.length - done)
				+ " not scanned — they will be recorded as still at the hospital.";

			$("[data-scan-list]").innerHTML = rows.map(function (r) {
				var hit = !!state.scanned[r.code];
				return '<div class="scan-line scan-row' + (hit ? " is-done" : "") + '"'
					+ ' data-scan-code="' + ui.esc(r.code) + '"'
					+ (hit ? "" : " data-scan-pending") + ">"
					+ '<span class="row-main"><b>' + ui.esc(itemName(r.line.item)) + "</b><small>"
					+ ui.esc(r.line.lot || "not serialised")
					+ (r.line.expiry ? " · exp " + fmt.day(r.line.expiry) : "") + "</small></span>"
					+ '<span class="sn">' + ui.esc(r.line.serial || "—") + "</span>"
					+ (hit ? '<span class="tick">&#10003;</span>'
						: '<button type="button" class="btn btn-sm" data-simulate="'
							+ ui.esc(r.code) + '">Simulate scan</button>')
					+ "</div>";
			}).join("");
		}

		/* Finish does not require a full scan — a short list is the point. */
		function finishScan() {
			var dc = LNST.get("challans", state.open);
			var used = Object.keys(state.scanned).length;
			var rest = dc.lines.length - used;
			var usageId = null;

			LNST.store.tx(function () {
				usageId = nextUsageNo();
				var lines = dc.lines.map(function (l, i) {
					var hit = !!state.scanned[lineKey(l, i)];
					l.used = hit ? l.delivered : 0;
					l.line_status = hit ? "Used" : "To Return";
					return {
						serial: l.serial, item: l.item, lot: l.lot, expiry: l.expiry,
						ownership: l.ownership, delivered: l.delivered,
						used: l.used, disposition: hit ? "Used" : "To Return",
						damage_reason: null, rate: l.rate, amount: l.used * l.rate,
						foc: 0, foc_reason: null,
					};
				});
				db.usage.push({
					id: usageId, status: "Usage Reported", challan: dc.id,
					hospital: dc.hospital, surgery_datetime: dc.surgery_date + " 09:15",
					patient: dc.patient, surgeon: dc.surgeon, procedure: "Arthroplasty",
					side: dc.side,
					tally_receipt_no: null, tally_receipt_date: null,
					hospital_invoice_no: null, hospital_invoice_date: null,
					sticker_photos: [], captured_by: dc.executive,
					captured_at: db.meta.today, wos_status: "Pending",
					principal_invoice: null, replacement_status: "Not applicable",
					lines: lines,
				});
				dc.usage_ref = usageId;
				dc.status = "Usage Reported";
				var req = LNST.get("requests", dc.request);
				if (req) { req.status = "Usage Reported"; }
			});

			pop.hidden = true;
			LNST.scan.pause();
			paintList();
			paintDetail();
			paintKpis();

			ui.toast("Scan completed · " + used + " used, " + rest
				+ " to come back · " + usageId, "ok");
		}

		function nextUsageNo() {
			var year = db.meta.today.slice(0, 4), top = 0;
			db.usage.forEach(function (u) {
				var m = /^USE-(\d{4})-(\d+)$/.exec(u.id);
				if (m && m[1] === year) { top = Math.max(top, parseInt(m[2], 10)); }
			});
			return "USE-" + year + "-" + (top + 1);
		}

		/* --------------------------------------------------- print / excel */

		function exportCsv() {
			var head = ["Delivery no", "Request", "Hospital", "Case", "Surgery",
				"Delivered", "Used", "Missing", "To return", "Usage"];
			var body = visible().map(function (c) {
				var t = LNST.rules.balance(c);
				return [c.id, c.request, hospital(c.hospital), c.patient.case_no,
					c.surgery_date, t.delivered, t.used, t.missing,
					t.delivered - t.used - t.returned - t.damaged - t.written_off - t.missing,
					c.usage_ref || ""];
			});
			var csv = [head].concat(body).map(function (line) {
				return line.map(function (cell) {
					var v = String(cell === null || cell === undefined ? "" : cell);
					return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
				}).join(",");
			}).join("\r\n");
			var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
			var a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = "lnst-usage-" + db.meta.today + ".csv";
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

		$("[data-open-scan]").addEventListener("click", openScan);
		$("[data-finish-scan]").addEventListener("click", finishScan);
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
			$("[data-f-state]").value = "open";
			paintList();
		});
		$("[data-print]").addEventListener("click", function () { window.print(); });
		$("[data-excel]").addEventListener("click", exportCsv);

		paintKpis(); paintList();
		var first = visible()[0];
		if (first) { state.open = first.id; }
		paintList(); paintDetail();
	},
});
