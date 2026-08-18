/* Copyright (c) 2026, Acube Innovations Pvt Ltd and contributors
 *
 * /lnst/requests — requests that reached this warehouse, and the scan that
 * allocates stock against one.
 *
 * The scan has three outcomes, not two, and the difference matters at a
 * counter: a serial that belongs here and is fresh (accepted), one that is
 * spoken for (already taken), and one that has no business on this request
 * (not matching). Each gets its own colour and its own sentence.
 */
(function () {
"use strict";

var SCREEN = {
	start: function (ctx) {
		var db = LNST.db, ui = LNST.ui, fmt = LNST.fmt, $ = LNST.$;

		/* Three routes, one screen. What differs between them is declared
		   here and nowhere else — the list filter, whose work it is, and what
		   the headings say. Adding a fourth view is a row in this table. */
		var me = (db.users.filter(function (u) { return u.exec; })[0] || {}).exec || null;

		var SCOPES = {
			requests: {
				states: ["Approved", "Picking", "Picked"], mine: false,
				heading: "Requests to me", card: "Requests to me",
				empty: "No requests match",
				jump: { href: "/lnst/my-requests", text: "My requests" },
			},
			my_requests: {
				states: ["Approved", "Picking", "Picked"], mine: true,
				heading: "My requests", card: "Assigned to me",
				empty: "Nothing assigned to you",
				jump: { href: "/lnst/requests", text: "All requests" },
			},
			picks: {
				// A pick starts from an approved request and nothing else. Once
				// it is being picked it belongs on the pick screen, not here.
				states: ["Approved"], mine: false,
				heading: "Pending picks", card: "Pending picks",
				empty: "Nothing waiting to be picked",
				jump: { href: "/lnst/requests", text: "All requests" },
			},
			pick: {
				// Picked and waiting for a vehicle. The work here is dispatch,
				// not scanning — the items were read off on Pending Picks.
				states: ["Picked"], mine: false,
				heading: "Ready to dispatch", card: "Ready to dispatch",
				empty: "Nothing picked and waiting",
				actions: "dispatch", showChallan: true,
				jump: { href: "/lnst/picks", text: "Pending picks" },
			},
		};

		var SCOPE = SCOPES[(ctx && ctx.screen)] || SCOPES.requests;
		SCOPE.actions = SCOPE.actions || "scan";
		var MINE = SCOPE.mine;

		var state = {
			open: null,
			filters: {
				search: "", branch: "", status: "", priority: "",
				executive: MINE ? me : "",
			},
		};

		/* Allocation lives in memory for the session: for each request, the
		   serials a picker is expected to scan. Chosen FEFO, from this branch,
		   skipping anything already out on a challan. */
		var alloc = {};

		function hospital(id) { var h = LNST.get("hospitals", id); return h ? h.short : id; }
		function itemName(id) { var i = LNST.get("items", id); return i ? i.name : id; }

		function buildAlloc(req) {
			if (alloc[req.id]) { return alloc[req.id]; }
			var used = {};
			var lines = req.lines.map(function (l, idx) {
				var item = LNST.get("items", l.item);
				var picked = [];
				if (item && item.serialized) {
					LNST.where("serials", function (s) {
						return s.item === l.item && s.status === "available" && !s.dc && !used[s.id];
					}).sort(function (a, b) { return a.expiry < b.expiry ? -1 : 1; })
						.slice(0, l.qty)
						.forEach(function (s) { used[s.id] = 1; picked.push(s.id); });
				}
				return {
					idx: idx + 1, item: l.item, qty: l.qty,
					serialized: item ? !!item.serialized : 0,
					size: l.size, category: l.category,
					expect: picked,          // serials this line wants
					scanned: [],             // serials actually scanned
				};
			});
			alloc[req.id] = { lines: lines };
			return alloc[req.id];
		}

		function totals(a) {
			var need = 0, done = 0;
			a.lines.forEach(function (l) {
				// A non-serialised line is counted once and satisfied by its
				// own row button — there is no serial to read off it.
				need += l.serialized ? l.expect.length : 1;
				done += l.serialized ? l.scanned.length : (l.scanned.length ? 1 : 0);
			});
			return { need: need, done: done };
		}

		function lineStatus(l) {
			if (!l.serialized) { return l.scanned.length ? "Taken for delivery" : "Not picked"; }
			if (!l.expect.length) { return "No stock"; }
			if (l.scanned.length >= l.expect.length) { return "Taken for delivery"; }
			if (l.scanned.length) { return "Part picked"; }
			return "Not picked";
		}

		var STATUS_TONE = {
			"Taken for delivery": "good", "Part picked": "warn",
			"Not picked": "muted", "No stock": "bad",
		};

		function statusPill(text) {
			return '<span class="pill pill-' + (STATUS_TONE[text] || "muted") + '">'
				+ ui.esc(text) + "</span>";
		}

		/* ---------------------------------------------------------- filters */

		function options(el, values, blank) {
			el.innerHTML = '<option value="">' + blank + "</option>"
				+ values.map(function (v) {
					return '<option value="' + ui.esc(v.id) + '">' + ui.esc(v.label) + "</option>";
				}).join("");
		}

		options($("[data-f-branch]"), db.branches.map(function (b) {
			return { id: b.id, label: b.name };
		}), "All branches");

		options($("[data-f-status]"), SCOPE.states.map(function (v) {
			return { id: v, label: v };
		}), SCOPE.states.length > 1 ? "All live states" : "Approved only");

		options($("[data-f-priority]"), ["Routine", "Urgent", "Emergency"].map(function (p) {
			return { id: p, label: p };
		}), "Any priority");

		options($("[data-f-exec]"), db.executives.map(function (e) {
			var br = LNST.get("branches", e.branch);
			return { id: e.id, label: e.name + " · " + (br ? br.name : e.branch) };
		}), "Any executive");
		$("[data-f-exec]").value = state.filters.executive;

		function visible() {
			var f = state.filters;
			var q = f.search.toLowerCase();
			return db.requests.filter(function (r) {
				if (SCOPE.states.indexOf(r.status) === -1) { return false; }
				if (f.branch && r.branch !== f.branch) { return false; }
				if (f.status && r.status !== f.status) { return false; }
				if (f.priority && r.priority !== f.priority) { return false; }
				if (f.executive && r.executive !== f.executive) { return false; }
				if (q) {
					var hay = (r.id + " " + hospital(r.hospital) + " " + r.surgeon).toLowerCase();
					if (hay.indexOf(q) === -1) { return false; }
				}
				return true;
			}).sort(function (a, b) { return a.surgery_date < b.surgery_date ? -1 : 1; });
		}

		/* ------------------------------------------------------------- kpis */

		function paintKpis() {
			var live = db.requests.filter(function (r) {
				if (SCOPE.states.indexOf(r.status) === -1) { return false; }
				// The cards follow the scope, not the filters: on My Requests
				// they count my work, everywhere else the whole warehouse.
				return !MINE || r.executive === me;
			});
			var counts = { part: 0, ready: 0 };
			live.forEach(function (r) {
				var a = alloc[r.id];
				if (!a) { return; }
				var t = totals(a);
				if (t.done && t.done < t.need) { counts.part++; }
				if (t.need && t.done === t.need) { counts.ready++; }
			});
			var urgent = live.filter(function (r) { return r.priority !== "Routine"; }).length;
			var todayCount = live.filter(function (r) {
				return r.surgery_date === db.meta.today;
			}).length;

			var tiles = [
				{ label: SCOPE.card, value: live.length,
			  foot: SCOPE.states.length > 1 ? "approved and not yet gone"
				: "approved, not yet started" },
				{ label: "Surgery today", value: todayCount, foot: "needs to leave now",
				  tone: todayCount ? "warn" : "" },
				{ label: "Urgent or emergency", value: urgent, foot: "jump the queue",
				  tone: urgent ? "warn" : "" },
				{ label: "Part picked", value: counts.part, foot: "started, not finished",
				  tone: counts.part ? "warn" : "" },
				{ label: "Ready to dispatch", value: counts.ready, foot: "all items scanned",
				  tone: counts.ready ? "good" : "" },
			];

			$("[data-kpis]").innerHTML = tiles.map(function (k) {
				return '<div class="tile' + (k.tone ? " is-" + k.tone : "") + '">'
					+ '<div class="tile-label">' + ui.esc(k.label) + "</div>"
					+ '<div class="tile-value">' + ui.esc(k.value) + "</div>"
					+ '<div class="tile-foot">' + ui.esc(k.foot) + "</div></div>";
			}).join("");
		}

		/* ------------------------------------------------------- LHS: list */

		function paintList() {
			var rows = visible();
			$("[data-list-count]").textContent = rows.length + " open";

			ui.table($("[data-list]"), {
				rows: rows,
				emptyHead: SCOPE.empty,
				emptyHint: "Clear the filters to see everything waiting here.",
				rowAttrs: function (r) {
					return 'data-req="' + ui.esc(r.id) + '" class="is-clickable'
						+ (state.open === r.id ? " is-open" : "") + '"';
				},
				cols: [
					{ label: "Request", render: function (r) {
						return '<span class="doc-no">' + ui.esc(r.id) + "</span>"
							+ "<small>" + ui.esc(r.priority) + "</small>"; } },
					{ label: "Hospital", render: function (r) {
						return "<b>" + ui.esc(hospital(r.hospital)) + "</b>"
							+ "<small>" + ui.esc(r.surgeon) + "</small>"; } },
					{ label: "Surgery", render: function (r) {
						return fmt.day(r.surgery_date) + "<small>" + ui.esc(r.time_slot) + "</small>"; } },
					{ label: "Items", cls: "num", render: function (r) {
						var a = alloc[r.id];
						if (!a) { return r.lines.length; }
						var t = totals(a);
						return t.done + " / " + t.need; } },
					{ label: "Challan", render: function (r) {
						var dc = r.linked && r.linked.challan;
						return dc ? '<span class="doc-no">' + ui.esc(dc) + "</span>"
							: '<span class="pill pill-muted">Not raised</span>'; },
					  when: !!SCOPE.showChallan },
					{ label: "Executive", render: function (r) {
						var e = LNST.get("executives", r.executive);
						return e ? ui.esc(e.name) : "—"; } },
					{ label: "Status", render: function (r) { return ui.pill(r.status); } },
				],
			});
		}

		/* ----------------------------------------------------- RHS: detail */

		function paintDetail() {
			var req = state.open ? LNST.get("requests", state.open) : null;
			var scanBtn = $("[data-open-scan]");
			var printBtn = $("[data-print-dc]");
			var vehBtn = $("[data-add-vehicle]");
			var dispatching = SCOPE.actions === "dispatch";

			scanBtn.hidden = dispatching;
			printBtn.hidden = !dispatching;
			vehBtn.hidden = !dispatching;

			if (!req) {
				$("[data-detail-title]").textContent = "Nothing selected";
				$("[data-detail-head]").innerHTML = "";
				$("[data-dc-block]").innerHTML = "";
				$("[data-detail-lines]").innerHTML = ui.empty(
					"Pick a request on the left",
					dispatching
						? "Its challan, vehicle and lines show here."
						: "Its lines, quantities and pick status show here.");
				scanBtn.disabled = printBtn.disabled = vehBtn.disabled = true;
				return;
			}

			var dc = req.linked && req.linked.challan
				? LNST.get("challans", req.linked.challan) : null;

			scanBtn.disabled = false;
			vehBtn.disabled = false;
			// Nothing to print until a challan exists.
			printBtn.disabled = !dc;
			vehBtn.querySelector("span").textContent = dc
				? "Change delivery vehicle" : "Add delivery vehicle";
			var a = buildAlloc(req);
			var t = totals(a);
			var h = LNST.get("hospitals", req.hospital);

			$("[data-detail-title]").textContent = req.id;

			$("[data-detail-head]").innerHTML = '<dl class="kv">'
				+ kv("Hospital", (h ? h.name : req.hospital) + " · " + (h ? h.city : ""))
				+ kv("Surgeon", req.surgeon)
				+ kv("Patient", req.patient.name + " · " + req.patient.age + " · "
					+ req.patient.gender + " · " + req.patient.case_no)
				+ kv("Procedure", req.procedure + " · " + req.side)
				+ kv("Surgery", fmt.day(req.surgery_date) + " · " + req.time_slot)
				+ kv("Kit", (LNST.get("kits", req.kit) || {}).name || "—")
				+ kv("Priority", req.priority + " · " + req.delivery_mode)
				+ kv("Picked", t.done + " of " + t.need + " items")
				+ "</dl>";

			$("[data-dc-block]").innerHTML = dc ? dcBlock(dc) : (dispatching
				? '<div class="dc-none">No delivery challan yet — add a vehicle to raise one.</div>'
				: "");

			ui.table($("[data-detail-lines]"), {
				rows: a.lines,
				emptyHead: "This request has no lines",
				emptyHint: "",
				rowAttrs: function (l) { return 'data-line="' + l.idx + '"'; },
				cols: [
					{ label: "#", cls: "num", render: function (l) { return l.idx; } },
					{ label: "Item", render: function (l) {
						return "<b>" + ui.esc(itemName(l.item)) + "</b><small>"
							+ ui.esc(l.category + " · " + l.size) + "</small>"; } },
					{ label: "Qty", cls: "num", render: function (l) { return l.qty; } },
					{ label: "Scanned", cls: "num", render: function (l) {
						if (!l.serialized) { return l.scanned.length ? "1" : "0"; }
						return l.scanned.length + " / " + l.expect.length; } },
					{ label: "Status", render: function (l) { return statusPill(lineStatus(l)); } },
				],
			});
		}

		function kv(k, v) {
			return "<dt>" + ui.esc(k) + "</dt><dd>" + ui.esc(v) + "</dd>";
		}

		/* ============================================ delivery challan */

		/* Next in the series, read off what already exists rather than kept in
		   a counter that a reset would put out of step with the data. */
		function nextDcNo() {
			var year = db.meta.today.slice(0, 4);
			var top = 0;
			db.challans.forEach(function (c) {
				var m = /^DC-(\d{4})-(\d+)$/.exec(c.id);
				if (m && m[1] === year) { top = Math.max(top, parseInt(m[2], 10)); }
			});
			return "DC-" + year + "-" + (top + 1);
		}

		function dcBlock(dc) {
			var veh = LNST.get("vehicles", dc.vehicle);
			return '<div class="dc-card">'
				+ '<div class="dc-card-head"><span class="doc-no">' + ui.esc(dc.id) + "</span>"
				+ ui.pill(dc.status) + "</div>"
				+ '<dl class="kv">'
				+ kv("Raised", fmt.day(dc.date))
				+ kv("Vehicle", veh ? veh.reg + " · " + veh.kind : "—")
				+ kv("Delivery staff", dc.staff || "—")
				+ kv("Out time", dc.out_time || "—")
				+ kv("Expected return", fmt.day(dc.expected_return))
				+ kv("e-Way bill", dc.eway_bill || "—")
				+ kv("Movement", dc.movement_type)
				+ "</dl></div>";
		}

		/* Builds the challan from what the pick would have taken. */
		function dcLinesFor(req) {
			var a = buildAlloc(req);
			var out = [];
			a.lines.forEach(function (l) {
				var item = LNST.get("items", l.item);
				if (!l.serialized) {
					out.push({ idx: out.length + 1, item: l.item, serial: null, lot: null,
						expiry: null, ownership: item ? item.ownership_default : "consignment",
						delivered: l.qty, used: 0, returned: 0, damaged: 0, written_off: 0,
						missing: 0, rate: item ? item.rate : 0, scanned: 0,
						line_status: "Delivered" });
					return;
				}
				l.expect.forEach(function (sid) {
					var sn = LNST.get("serials", sid);
					out.push({ idx: out.length + 1, item: l.item, serial: sid,
						lot: sn.lot, expiry: sn.expiry, ownership: sn.ownership,
						delivered: 1, used: 0, returned: 0, damaged: 0, written_off: 0,
						missing: 0, rate: item ? item.rate : 0, scanned: 0,
						line_status: "Delivered" });
				});
			});
			return out;
		}

		/* ================================================== the scan popup */

		var pop = $("[data-scan-pop]");

		function openScan() {
			if (!state.open) { return; }
			var req = LNST.get("requests", state.open);
			$("[data-scan-title]").textContent = "Scan items for " + req.id;
			$("[data-scan-sub]").textContent = hospital(req.hospital) + " · surgery "
				+ fmt.day(req.surgery_date) + " · " + req.priority.toLowerCase();
			pop.hidden = false;
			paintScan();
			LNST.scan.mount({
				input: $("[data-scan-catcher]", pop),
				resolve: resolveScan,
				onHit: onScanHit,
				onMiss: onScanMiss,
			});
			LNST.scan.resume();
		}

		function closeScan() {
			pop.hidden = true;
			LNST.scan.pause();
			paintList();
			paintDetail();
			paintKpis();
		}

		/* The three outcomes. resolve() classifies; the handlers speak. */
		function resolveScan(code) {
			var a = alloc[state.open];
			if (!a) { return null; }

			// A non-serialised line has no barcode to read, so its row reports
			// itself. Routed through the same resolve/hit path as a serial so
			// there is exactly one place that decides an outcome.
			if (/^LINE-/.test(code)) {
				var n = parseInt(code.slice(5), 10);
				var ln = a.lines.filter(function (l) { return l.idx === n; })[0];
				if (!ln) { return null; }
				if (ln.scanned.length) { return { outcome: "already", line: ln, why: "line" }; }
				return { outcome: "accepted", line: ln, lineOnly: true };
			}

			var serial = LNST.get("serials", code)
				|| LNST.where("serials", function (s) { return s.sn === code; })[0];

			// Already scanned on this request.
			for (var i = 0; i < a.lines.length; i++) {
				if (serial && a.lines[i].scanned.indexOf(serial.id) > -1) {
					return { outcome: "already", serial: serial, line: a.lines[i], why: "this" };
				}
			}
			// Known serial, but spoken for by an open challan.
			if (serial && serial.dc) {
				return { outcome: "already", serial: serial, why: "dc" };
			}
			// Expected on one of this request's lines.
			for (var j = 0; j < a.lines.length; j++) {
				if (serial && a.lines[j].expect.indexOf(serial.id) > -1) {
					return { outcome: "accepted", serial: serial, line: a.lines[j] };
				}
			}
			return null;   // not matching — onMiss speaks
		}

		function onScanHit(v, code) {
			$("[data-scan-last]").textContent = code;

			if (v.outcome === "already") {
				var msg;
				if (v.why === "dc") {
					msg = itemName(v.serial.item) + " " + v.serial.sn + " is already out on "
						+ v.serial.dc + ".";
				} else if (v.why === "line") {
					msg = itemName(v.line.item) + " is already taken for this request.";
				} else {
					msg = itemName(v.serial.item) + " " + v.serial.sn
						+ " is already on this request — scan the next one.";
				}
				ui.toast(msg, "warn");
				return;
			}

			v.line.scanned.push(v.lineOnly ? code : v.serial.id);
			var t = totals(alloc[state.open]);
			ui.toast("Accepted · " + itemName(v.line.item)
				+ (v.lineOnly ? "" : " " + v.serial.sn)
				+ " · " + t.done + " of " + t.need + " scanned.", "ok");
			paintScan();
			paintDetail();
		}

		function onScanMiss(code) {
			$("[data-scan-last]").textContent = code;
			var known = LNST.get("serials", code)
				|| LNST.where("serials", function (s) { return s.sn === code; })[0];
			ui.toast(known
				? known.sn + " is " + itemName(known.item) + " — that is not on this request."
				: "Nothing here matches " + code + ".", "bad");
		}

		function paintScan() {
			var a = alloc[state.open];
			var t = totals(a);
			$("[data-scan-done]").textContent = t.done;
			$("[data-scan-total]").textContent = "/" + t.need;
			$("[data-scan-bar]").style.width = (t.need ? (t.done / t.need) * 100 : 0) + "%";

			var html = a.lines.map(function (l) {
				if (!l.serialized) {
					var got = l.scanned.length > 0;
					return scanRow({
						code: "LINE-" + l.idx, main: itemName(l.item),
						sub: l.qty + " × " + l.category + " · not serialised",
						done: got, line: l.idx,
					});
				}
				if (!l.expect.length) {
					return '<div class="scan-line is-none"><span class="row-main"><b>'
						+ ui.esc(itemName(l.item)) + "</b><small>No stock available here</small>"
						+ '</span><span class="pill pill-bad">No stock</span></div>';
				}
				return l.expect.map(function (sid) {
					var s = LNST.get("serials", sid);
					return scanRow({
						code: s.sn, main: itemName(l.item),
						sub: "lot " + s.lot + " · expires " + fmt.day(s.expiry) + " · " + s.ownership,
						done: l.scanned.indexOf(sid) > -1, line: l.idx,
					});
				}).join("");
			}).join("");

			$("[data-scan-list]").innerHTML = html;
		}

		function scanRow(o) {
			return '<div class="scan-line scan-row' + (o.done ? " is-done" : "") + '"'
				+ ' data-scan-code="' + ui.esc(o.code) + '"'
				+ (o.done ? "" : " data-scan-pending") + ">"
				+ '<span class="row-main"><b>' + ui.esc(o.main) + "</b><small>"
				+ ui.esc(o.sub) + "</small></span>"
				+ '<span class="sn">' + ui.esc(o.code) + "</span>"
				+ (o.done
					? '<span class="tick" aria-label="scanned">&#10003;</span>'
					: '<button type="button" class="btn btn-sm" data-simulate="'
						+ ui.esc(o.code) + '">Simulate scan</button>')
				+ "</div>";
		}

		/* ============================================ vehicle popup */

		var vehPop = $("[data-veh-pop]");
		var dcPop = $("[data-dc-pop]");

		function openVehicle() {
			var req = LNST.get("requests", state.open);
			if (!req) { return; }
			var dc = req.linked && req.linked.challan
				? LNST.get("challans", req.linked.challan) : null;

			$("[data-veh-sub]").textContent = req.id + " · " + hospital(req.hospital)
				+ " · surgery " + fmt.day(req.surgery_date);

			// Only this branch's vehicles and staff — a Kochi case does not go
			// out on the Calicut van.
			options($("[data-veh-vehicle]"), db.vehicles
				.filter(function (v) { return v.branch === req.branch; })
				.map(function (v) { return { id: v.id, label: v.reg + " · " + v.kind }; }),
				"Choose a vehicle");
			options($("[data-veh-staff]"), db.executives
				.filter(function (e) { return e.branch === req.branch; })
				.map(function (e) { return { id: e.name, label: e.name }; }),
				"Choose staff");

			$("[data-veh-vehicle]").value = dc ? dc.vehicle : (req.vehicle || "");
			$("[data-veh-staff]").value = dc ? dc.staff : (req.staff || "");
			$("[data-veh-out]").value = dc ? dc.out_time : "07:30";
			// Two days after surgery — the same policy Delivery Confirmation
			// applies, so a challan does not change its own return date the
			// moment somebody signs for it.
			$("[data-veh-return]").value = dc ? dc.expected_return
				: fmt.addDays(req.surgery_date, 2);
			$("[data-veh-eway]").value = dc ? (dc.eway_bill || "") : "";
			$("[data-veh-error]").classList.remove("is-open");

			vehPop.hidden = false;
			LNST.scan.pause();
			$("[data-veh-vehicle]").focus();
		}

		function closeVehicle() { vehPop.hidden = true; }

		function saveVehicle() {
			var req = LNST.get("requests", state.open);
			var vehicle = $("[data-veh-vehicle]").value;
			var staff = $("[data-veh-staff]").value;
			var err = $("[data-veh-error]");

			if (!vehicle || !staff) {
				err.textContent = "Choose a vehicle and who is taking it before saving.";
				err.classList.add("is-open");
				return;
			}

			var existing = req.linked && req.linked.challan
				? LNST.get("challans", req.linked.challan) : null;
			var raised = null;

			LNST.store.tx(function () {
				var target = existing;
				if (!target) {
					var h = LNST.get("hospitals", req.hospital);
					target = {
						id: nextDcNo(), status: req.status, request: req.id, pick: null,
						branch: req.branch, hospital: req.hospital,
						address: h ? h.address : "", surgeon: req.surgeon,
						patient: req.patient, surgery_date: req.surgery_date,
						side: req.side, kit: req.kit,
						source_warehouse: req.branch + "-CONSIGN",
						target_warehouse: "HOSP-" + req.hospital,
						movement_type: "Non-Sale Issue",
						date: db.meta.today,
						executive: req.executive,
						receiver: { name: null, designation: null, phone: null },
						proof: { signature: null, photos: [], geo: null,
							discrepancy: 0, discrepancy_note: "" },
						lines: dcLinesFor(req),
						usage_ref: null, return_refs: [], closed_on: null,
					};
					db.challans.push(target);
					req.linked.challan = target.id;
					raised = target.id;
				}
				target.vehicle = vehicle;
				target.staff = staff;
				target.out_time = $("[data-veh-out]").value;
				target.expected_return = $("[data-veh-return]").value;
				target.eway_bill = $("[data-veh-eway]").value.trim();
			});

			closeVehicle();
			paintList();
			paintDetail();
			paintKpis();
			ui.toast(raised
				? "Challan " + raised + " raised · " + (LNST.get("vehicles", vehicle) || {}).reg
				: "Vehicle updated on " + req.linked.challan + ".", "ok");
		}

		/* =========================================== challan printout */

		function openPrint() {
			var req = LNST.get("requests", state.open);
			var dc = req && req.linked.challan
				? LNST.get("challans", req.linked.challan) : null;
			if (!dc) { return; }
			$("[data-dc-doc]").innerHTML = renderChallan(dc, req);
			dcPop.hidden = false;
			LNST.scan.pause();
		}

		function closePrint() { dcPop.hidden = true; }

		function renderChallan(dc, req) {
			var h = LNST.get("hospitals", dc.hospital);
			var veh = LNST.get("vehicles", dc.vehicle);
			var total = dc.lines.reduce(function (n, l) {
				return n + (l.delivered || 0) * (l.rate || 0);
			}, 0);
			var qty = dc.lines.reduce(function (n, l) { return n + (l.delivered || 0); }, 0);

			return '<div class="dc-doc">'
				+ '<div class="dc-doc-top">'
				+ "<div><b>" + ui.esc(db.meta.company) + "</b>"
				+ '<div class="dc-doc-small">Authorised ' + ui.esc(db.meta.principal)
				+ " distributor</div></div>"
				+ '<div class="dc-doc-right"><b>DELIVERY CHALLAN</b>'
				+ '<div class="dc-doc-small">' + ui.esc(dc.id) + " · " + fmt.day(dc.date)
				+ "</div>"
				+ '<div class="dc-doc-small">' + ui.esc(dc.movement_type) + "</div></div></div>"

				+ '<div class="dc-doc-parties">'
				+ "<div><span>Deliver to</span><b>" + ui.esc(h ? h.name : dc.hospital) + "</b>"
				+ "<div>" + ui.esc(h ? h.address : "") + "</div></div>"
				+ "<div><span>Case</span><b>" + ui.esc(dc.patient.case_no) + "</b>"
				+ "<div>" + ui.esc(dc.surgeon) + " · " + ui.esc(dc.patient.name)
				+ " · " + ui.esc(dc.patient.age) + "/" + ui.esc(dc.patient.gender) + "</div>"
				+ "<div>Surgery " + fmt.day(dc.surgery_date) + " · " + ui.esc(dc.side)
				+ "</div></div>"
				+ "<div><span>Transport</span><b>" + ui.esc(veh ? veh.reg : "—") + "</b>"
				+ "<div>" + ui.esc(dc.staff || "—") + " · out " + ui.esc(dc.out_time || "—")
				+ "</div><div>e-Way " + ui.esc(dc.eway_bill || "—") + "</div></div>"
				+ "</div>"

				+ '<table class="bill-table dc-doc-table"><thead><tr>'
				+ "<th>#</th><th>Item</th><th>Serial</th><th>Lot</th><th>Expiry</th>"
				+ '<th>Own</th><th class="num">Qty</th><th class="num">Rate</th>'
				+ '<th class="num">Value</th></tr></thead><tbody>'
				+ dc.lines.map(function (l, i) {
					var item = LNST.get("items", l.item);
					return "<tr><td>" + (i + 1) + "</td>"
						+ "<td>" + ui.esc(item ? item.name : l.item) + "</td>"
						+ '<td class="sn">' + ui.esc(l.serial || "—") + "</td>"
						+ "<td>" + ui.esc(l.lot || "—") + "</td>"
						+ "<td>" + (l.expiry ? fmt.day(l.expiry) : "—") + "</td>"
						+ "<td>" + ui.esc(l.ownership) + "</td>"
						+ '<td class="num">' + l.delivered + "</td>"
						+ '<td class="num">' + fmt.money(l.rate) + "</td>"
						+ '<td class="num">' + fmt.money(l.delivered * l.rate) + "</td></tr>";
				}).join("")
				+ "</tbody><tfoot><tr>"
				+ '<td colspan="6" class="strong">Total</td>'
				+ '<td class="num strong">' + qty + "</td><td></td>"
				+ '<td class="num strong">' + fmt.money(total) + "</td>"
				+ "</tr></tfoot></table>"

				+ '<p class="dc-doc-small">Goods sent on a non-sale basis for the case named '
				+ "above. Unused items must be returned with this challan.</p>"
				+ '<div class="dc-doc-sign"><div>Prepared by</div><div>Driver</div>'
				+ "<div>Received at hospital</div></div>"
				+ "</div>";
		}

		/* ------------------------------------------------- print and excel */

		function exportCsv() {
			var rows = visible();
			var head = ["Request", "Hospital", "Surgeon", "Surgery", "Slot", "Priority",
				"Branch", "Lines", "Scanned", "Needed", "Status"];
			var body = rows.map(function (r) {
				var t = alloc[r.id] ? totals(alloc[r.id]) : { done: 0, need: 0 };
				return [r.id, hospital(r.hospital), r.surgeon, r.surgery_date, r.time_slot,
					r.priority, r.branch, r.lines.length, t.done, t.need, r.status];
			});
			var csv = [head].concat(body).map(function (line) {
				return line.map(function (cell) {
					var v = String(cell === null || cell === undefined ? "" : cell);
					return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
				}).join(",");
			}).join("\r\n");

			// A real download, not a dead button. CSV, which Excel opens.
			var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
			var a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = "lnst-requests-" + db.meta.today + ".csv";
			document.body.appendChild(a);
			a.click();
			a.remove();
			ui.toast(rows.length + " requests exported.", "ok");
		}

		/* ----------------------------------------------------------- wiring */

		$("[data-list]").addEventListener("click", function (e) {
			var tr = e.target.closest("[data-req]");
			if (!tr) { return; }
			state.open = tr.getAttribute("data-req");
			paintList();
			paintDetail();
		});

		$("[data-open-scan]").addEventListener("click", openScan);
		$("[data-close-scan]").addEventListener("click", closeScan);
		$("[data-add-vehicle]").addEventListener("click", openVehicle);
		$("[data-veh-cancel]").addEventListener("click", closeVehicle);
		$("[data-veh-save]").addEventListener("click", saveVehicle);
		$("[data-print-dc]").addEventListener("click", openPrint);
		$("[data-dc-close]").addEventListener("click", closePrint);
		$("[data-dc-print]").addEventListener("click", function () {
			// Print just the challan: a body class the print stylesheet keys off.
			document.body.classList.add("printing-dc");
			window.print();
			document.body.classList.remove("printing-dc");
		});
		vehPop.addEventListener("click", function (e) {
			if (e.target === vehPop) { closeVehicle(); }
		});
		dcPop.addEventListener("click", function (e) {
			if (e.target === dcPop) { closePrint(); }
		});

		pop.addEventListener("click", function (e) {
			// Clicking the backdrop closes. Simulate buttons are handled by the
			// scan engine's own delegated listener, serial or not.
			if (e.target === pop) { closeScan(); }
		});

		document.addEventListener("keydown", function (e) {
			if (e.key !== "Escape") { return; }
			if (!pop.hidden) { closeScan(); }
			if (!vehPop.hidden) { closeVehicle(); }
			if (!dcPop.hidden) { closePrint(); }
		});

		var onFilter = LNST.debounce(function () {
			state.filters.search = $("[data-f-search]").value.trim();
			state.filters.branch = $("[data-f-branch]").value;
			state.filters.status = $("[data-f-status]").value;
			state.filters.priority = $("[data-f-priority]").value;
			state.filters.executive = $("[data-f-exec]").value;
			paintList();
		}, 220);

		["[data-f-search]", "[data-f-branch]", "[data-f-status]", "[data-f-priority]",
			"[data-f-exec]"]
			.forEach(function (sel) {
				$(sel).addEventListener("input", onFilter);
				$(sel).addEventListener("change", onFilter);
			});

		$("[data-f-clear]").addEventListener("click", function () {
			// On My Requests, Clear returns to me rather than to everyone —
			// clearing into somebody else's work is never what was meant.
			state.filters = {
				search: "", branch: "", status: "", priority: "",
				executive: MINE ? me : "",
			};
			$("[data-f-search]").value = "";
			["[data-f-branch]", "[data-f-status]", "[data-f-priority]"].forEach(function (sel) {
				$(sel).value = "";
			});
			$("[data-f-exec]").value = state.filters.executive;
			paintList();
		});

		$("[data-print]").addEventListener("click", function () { window.print(); });
		$("[data-excel]").addEventListener("click", exportCsv);

		/* --------------------------------------------------------- first paint */

		var heading = $("[data-panel-heading]");
		if (heading) { heading.textContent = SCOPE.heading; }
		var jump = $("[data-scope-link]");
		if (jump) {
			jump.textContent = SCOPE.jump.text;
			jump.setAttribute("href", SCOPE.jump.href);
		}

		paintKpis();
		paintList();

		var first = visible()[0];
		if (first) { state.open = first.id; }
		paintList();
		paintDetail();
		paintKpis();
	},
};

/* One implementation, two routes: /lnst/requests sees everything,
   /lnst/my-requests opens scoped to the executive. Registering the same
   object under both keys keeps them from ever drifting apart. */
LNST.screen("requests", SCREEN);
LNST.screen("my_requests", SCREEN);
LNST.screen("picks", SCREEN);
LNST.screen("pick", SCREEN);
})();
