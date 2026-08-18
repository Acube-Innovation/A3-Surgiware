/* Copyright (c) 2026, Acube Innovations Pvt Ltd and contributors
 *
 * /lnst/delivery — confirm a challan was handed over.
 *
 * Fed by whatever Pick Execution raised: a challan only appears here once it
 * has a delivery number. The left list leads with that number because it is
 * what the person at the hospital reads out; everything else about the case
 * follows it.
 *
 * The right side is a form, not a line table, which is why this is its own
 * screen rather than another scope on the requests family.
 */
(function () {
"use strict";

var SCREEN = {
	start: function (ctx) {
		var db = LNST.db, ui = LNST.ui, fmt = LNST.fmt, $ = LNST.$;

		/* Two confirmations, one screen. Going out, somebody at the hospital
		   signs for the goods; coming back, the store keeper signs for them.
		   Same shape — a list on the left, a form and a signature on the
		   right — so the difference is declared here rather than duplicated. */
		var SCOPES = {
			delivery: {
				title: "Deliveries", who: "Received by", whoHint: "Hospital staff name",
				askPhone: true, askReturnDate: true, askVehicle: false,
				proofLabel: "Proof of delivery",
				proofHint: "photo of the signed challan",
				finish: "Finish and confirm delivery",
				doneLabel: "Handed over",
				emptyHead: "Nothing to confirm",
				emptyHint: "Challans appear here once Pick Execution raises a number.",
				awaiting: function (c) { return c.status === "Picked" || c.status === "Dispatched"; },
				next: "Delivered",
			},
			return_inward: {
				title: "Returns coming in", who: "Returned by", whoHint: "Who brought it back",
				askPhone: false, askReturnDate: false, askVehicle: true,
				proofLabel: "Photograph of the returned goods",
				proofHint: "photo of what came back",
				finish: "Confirm receipt of return",
				doneLabel: "Received back",
				emptyHead: "Nothing coming back",
				emptyHint: "A challan lands here once its stock has been put away.",
				// Put-away has happened; the store keeper is signing for it.
				awaiting: function (c) {
					return c.status === "Partially Returned" || c.status === "Fully Returned";
				},
				next: "Reconciled",
			},
		};

		var SCOPE = SCOPES[(ctx && ctx.screen)] || SCOPES.delivery;

		var state = {
			open: null,
			pad: null,
			photos: [],
			filters: { search: "", branch: "", state: "awaiting", executive: "" },
		};

		function hospital(id) { var h = LNST.get("hospitals", id); return h ? h.short : id; }
		function hospitalFull(id) { var h = LNST.get("hospitals", id); return h ? h : null; }

		/* Policy: stock comes back two days after the surgery. */
		function returnBy(surgeryDate) { return fmt.addDays(surgeryDate, 2); }

		function isDone(dc) { return !SCOPE.awaiting(dc); }

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

		$("[data-f-state]").innerHTML =
			'<option value="awaiting">Awaiting confirmation</option>'
			+ '<option value="done">Confirmed</option>'
			+ '<option value="">All</option>';

		options($("[data-f-exec]"), db.executives.map(function (e) {
			var br = LNST.get("branches", e.branch);
			return { id: e.id, label: e.name + " · " + (br ? br.name : e.branch) };
		}), "Any executive");

		function visible() {
			var f = state.filters;
			var q = f.search.toLowerCase();
			return db.challans.filter(function (c) {
				// Confirmed rows stay visible on their own scope only.
				var mine = SCOPE.awaiting(c) || c[SCOPE === SCOPES.delivery
					? "delivered_on" : "returned_on"];
				if (!mine) { return false; }
				if (f.state === "awaiting" && isDone(c)) { return false; }
				if (f.state === "done" && !isDone(c)) { return false; }
				if (f.branch && c.branch !== f.branch) { return false; }
				if (f.executive && c.executive !== f.executive) { return false; }
				if (q) {
					var hay = (c.id + " " + c.request + " " + hospital(c.hospital)
						+ " " + c.surgeon).toLowerCase();
					if (hay.indexOf(q) === -1) { return false; }
				}
				return true;
			}).sort(function (a, b) {
				// Soonest surgery first — that is the one going out next.
				return a.surgery_date < b.surgery_date ? -1 : 1;
			});
		}

		/* ------------------------------------------------------------- kpis */

		function paintKpis() {
			var all = db.challans.filter(function (c) {
				return SCOPE.awaiting(c) || (SCOPE.askPhone ? c.delivered_on : c.returned_on);
			});
			var awaiting = all.filter(function (c) { return !isDone(c); });
			var todayRuns = awaiting.filter(function (c) {
				return c.surgery_date <= db.meta.today;
			}).length;
			var confirmed = all.filter(function (c) { return c.receiver && c.receiver.name; }).length;
			var noProof = all.filter(function (c) {
				return c.receiver && c.receiver.name && !(c.proof && c.proof.signature);
			}).length;

			[
				{ label: "Awaiting confirmation", value: awaiting.length,
				  foot: "challan raised, not signed", tone: awaiting.length ? "warn" : "good" },
				{ label: "Due today or overdue", value: todayRuns,
				  foot: "surgery already here", tone: todayRuns ? "bad" : "" },
				{ label: "Confirmed", value: confirmed, foot: "handed over and signed",
				  tone: "good" },
				{ label: "Signed without proof", value: noProof,
				  foot: "no signature on file", tone: noProof ? "warn" : "" },
			].forEach(function () { /* rendered below */ });

			var tiles = [
				{ label: "Awaiting confirmation", value: awaiting.length,
				  foot: "challan raised, not signed", tone: awaiting.length ? "warn" : "good" },
				{ label: "Due today or overdue", value: todayRuns,
				  foot: "surgery already here", tone: todayRuns ? "bad" : "" },
				{ label: "Confirmed", value: confirmed, foot: "handed over and signed", tone: "good" },
				{ label: "Missing signature", value: noProof,
				  foot: "confirmed without a sign-off", tone: noProof ? "warn" : "" },
			];

			$("[data-kpis]").innerHTML = tiles.map(function (k) {
				return '<div class="tile' + (k.tone ? " is-" + k.tone : "") + '">'
					+ '<div class="tile-label">' + ui.esc(k.label) + "</div>"
					+ '<div class="tile-value">' + ui.esc(k.value) + "</div>"
					+ '<div class="tile-foot">' + ui.esc(k.foot) + "</div></div>";
			}).join("");
		}

		/* -------------------------------------------- LHS: delivery number */

		function paintList() {
			var rows = visible();
			$("[data-list-count]").textContent = rows.length + " shown";

			ui.table($("[data-list]"), {
				rows: rows,
				emptyHead: SCOPE.emptyHead,
				emptyHint: SCOPE.emptyHint,
				rowAttrs: function (c) {
					return 'data-dc="' + ui.esc(c.id) + '" class="is-clickable'
						+ (state.open === c.id ? " is-open" : "") + '"';
				},
				cols: [
					// The delivery number leads: it is what gets read out at the desk.
					{ label: "Delivery no", render: function (c) {
						return '<span class="doc-no">' + ui.esc(c.id) + "</span>"
							+ "<small>" + fmt.day(c.date) + "</small>"; } },
					{ label: "Request", render: function (c) {
						return ui.esc(c.request) + "<small>"
							+ ui.esc((LNST.get("kits", c.kit) || {}).name || "—") + "</small>"; } },
					{ label: "Hospital", render: function (c) {
						return "<b>" + ui.esc(hospital(c.hospital)) + "</b><small>"
							+ ui.esc(c.surgeon) + "</small>"; } },
					{ label: "Surgery", render: function (c) {
						return fmt.day(c.surgery_date) + "<small>" + ui.esc(c.side) + "</small>"; } },
					{ label: "Items", cls: "num", render: function (c) {
						return LNST.rules.balance(c).delivered; } },
					{ label: "Status", render: function (c) { return ui.pill(c.status); } },
				],
			});
		}

		/* ------------------------------------------------ RHS: the handover */

		function paintDetail() {
			var dc = state.open ? LNST.get("challans", state.open) : null;
			state.pad = null;

			if (!dc) {
				$("[data-detail-title]").textContent = "Nothing selected";
				$("[data-detail-pill]").innerHTML = "";
				$("[data-detail-head]").innerHTML = "";
				$("[data-form]").innerHTML = ui.empty(
					"Pick a delivery on the left",
					"Its handover form opens here.");
				return;
			}

			var h = hospitalFull(dc.hospital);
			var veh = LNST.get("vehicles", dc.vehicle);

			$("[data-detail-title]").textContent = dc.id;
			$("[data-detail-pill]").innerHTML = ui.pill(dc.status);

			$("[data-detail-head]").innerHTML = '<dl class="kv">'
				+ "<dt>Hospital</dt><dd>" + ui.esc(h ? h.name : dc.hospital) + "</dd>"
				+ "<dt>Case</dt><dd>" + ui.esc(dc.patient.case_no) + " · "
				+ ui.esc(dc.patient.name) + " · " + ui.esc(dc.surgeon) + "</dd>"
				+ "<dt>Surgery</dt><dd>" + fmt.day(dc.surgery_date) + " · "
				+ ui.esc(dc.side) + "</dd>"
				+ "<dt>Transport</dt><dd>" + ui.esc(veh ? veh.reg : "—") + " · "
				+ ui.esc(dc.staff || "—") + "</dd>"
				+ "<dt>Items</dt><dd>" + LNST.rules.balance(dc).delivered + " on this challan</dd>"
				+ "</dl>";

			isDone(dc) ? paintConfirmed(dc) : paintForm(dc);
		}

		/* Already signed for: show what was captured, do not offer it again. */
		function paintConfirmed(dc) {
			var inward = !SCOPE.askPhone;
			var r = (inward ? dc.returned_by : dc.receiver) || {};
			var p = (inward ? dc.return_proof : dc.proof) || {};
			var veh = r.vehicle ? LNST.get("vehicles", r.vehicle) : null;
			$("[data-form]").innerHTML = '<div class="dc-card">'
				+ '<div class="dc-card-head"><b>' + ui.esc(SCOPE.doneLabel) + "</b>"
				+ '<span class="pill pill-good">Confirmed</span></div>'
				+ '<dl class="kv">'
				+ "<dt>" + ui.esc(SCOPE.who) + "</dt><dd>" + ui.esc(r.name || "—")
				+ (r.designation ? " · " + ui.esc(r.designation) : "") + "</dd>"
				+ (inward
					? "<dt>Vehicle</dt><dd>" + ui.esc(veh ? veh.reg : "—") + "</dd>"
					  + "<dt>Received on</dt><dd>" + ui.esc(dc.returned_on || "—") + "</dd>"
					: "<dt>Phone</dt><dd>" + ui.esc(r.phone || "—") + "</dd>"
					  + "<dt>Return by</dt><dd>" + fmt.day(dc.expected_return) + "</dd>")
				+ "</dl>"
				+ (p.signature
					? '<div class="sig-shown"><span class="field-label">Signature</span>'
						+ '<img src="' + p.signature + '" alt="signature"></div>'
					: '<p class="field-error is-open">No signature was captured.</p>')
				+ ((p.photos || []).length
					? '<div class="photo-strip">' + p.photos.map(function (src) {
						return '<img src="' + src + '" alt="proof">';
					}).join("") + "</div>"
					: "")
				+ "</div>";
		}

		function paintForm(dc) {
			var h = hospitalFull(dc.hospital);
			var capture = LNST.isTouchDevice() ? ' capture="environment"' : "";
			var vehicles = db.vehicles.filter(function (v) { return v.branch === dc.branch; });

			$("[data-form]").innerHTML = ''
				+ '<div class="field-row">'
				+ '<div class="field"><label class="field-label">' + ui.esc(SCOPE.who) + " "
				+ '<span class="req">*</span></label>'
				+ '<input class="input" data-r-name placeholder="' + ui.esc(SCOPE.whoHint) + '" '
				+ 'value="' + ui.esc(SCOPE.askPhone && h && h.contact ? h.contact.name : "")
				+ '"></div>'
				+ '<div class="field"><label class="field-label">Designation</label>'
				+ '<input class="input" data-r-desig placeholder="Store manager, OT nurse…"></div>'
				+ "</div>"

				+ '<div class="field-row">'
				+ (SCOPE.askPhone
					? '<div class="field"><label class="field-label">Phone number '
					  + '<span class="req">*</span></label>'
					  + '<input class="input" data-r-phone inputmode="numeric" maxlength="10" '
					  + 'placeholder="10 digits" value="'
					  + ui.esc(h && h.contact ? h.contact.phone : "") + '"></div>'
					: "")
				+ (SCOPE.askVehicle
					? '<div class="field"><label class="field-label">Vehicle '
					  + '<span class="req">*</span></label>'
					  + '<select class="input" data-r-vehicle>'
					  + '<option value="">Choose a vehicle</option>'
					  + vehicles.map(function (v) {
							return '<option value="' + ui.esc(v.id) + '"'
								+ (v.id === dc.vehicle ? " selected" : "") + ">"
								+ ui.esc(v.reg + " · " + v.kind) + "</option>";
						}).join("")
					  + "</select></div>"
					: "")
				+ '<div class="field"><label class="field-label">'
				+ (SCOPE.askReturnDate ? "Return by" : "Received on") + "</label>"
				+ '<input class="input" type="date" data-r-return value="'
				+ ui.esc(SCOPE.askReturnDate ? returnBy(dc.surgery_date) : db.meta.today) + '">'
				+ '<span class="field-hint">'
				+ (SCOPE.askReturnDate ? "Two days after surgery" : "Date the goods came in")
				+ "</span></div>"
				+ "</div>"

				+ '<div class="field"><label class="field-label">'
				+ ui.esc(SCOPE.proofLabel) + "</label>"
				+ '<label class="photo-drop">'
				+ '<input type="file" accept="image/*"' + capture + ' multiple data-r-photo hidden>'
				+ "<span>" + (LNST.isTouchDevice() ? "Take a " : "Attach a ")
				+ ui.esc(SCOPE.proofHint) + "</span>"
				+ '<span class="photo-drop-sub">'
				+ (LNST.isTouchDevice() ? "Opens the camera" : "JPG or PNG") + "</span>"
				+ "</label>"
				+ '<div class="photo-strip" data-photo-strip></div></div>'

				+ '<div class="field"><label class="field-label">Signature '
				+ '<span class="req">*</span></label>'
				+ '<div class="sig-wrap"><canvas class="sig-pad" data-sig></canvas>'
				+ '<button type="button" class="linkbtn is-quiet sig-clear" data-sig-clear>'
				+ "Clear</button></div>"
				+ '<span class="field-hint">Ask the '
				+ (SCOPE.askPhone ? "receiver" : "person returning it") + " to sign above</span></div>"

				+ '<p class="field-error" data-form-error></p>'
				+ '<button type="button" class="btn btn-primary btn-block" data-finish>'
				+ ui.esc(SCOPE.finish) + "</button>";

			// The pad has to be sized after it is in the document, or it draws
			// into a zero-width canvas and the signature comes out blank.
			var canvas = $("[data-sig]");
			state.pad = LNST.signature(canvas);
			state.pad.resize();
			state.photos = [];

			$("[data-sig-clear]").addEventListener("click", function () { state.pad.clear(); });
			$("[data-r-photo]").addEventListener("change", onPhotos);
			$("[data-finish]").addEventListener("click", finish);
		}

		function onPhotos(event) {
			var files = Array.prototype.slice.call(event.target.files || []);
			if (!files.length) { return; }
			Promise.all(files.map(function (f) { return LNST.shrinkImage(f, 640, 0.7); }))
				.then(function (shots) {
					state.photos = state.photos.concat(shots);
					$("[data-photo-strip]").innerHTML = state.photos.map(function (src) {
						return '<img src="' + src + '" alt="proof">';
					}).join("");
					ui.toast(shots.length + " photo" + (shots.length > 1 ? "s" : "") + " attached.", "ok");
				})
				.catch(function (err) { ui.toast(err.message, "bad"); });
		}

		/* ------------------------------------------------------------ finish */

		function finish() {
			var dc = LNST.get("challans", state.open);
			// Defensive: the confirmed view has no pad, and a stray click on a
			// stale handler should not take the page down with it.
			if (!dc || !state.pad) { return; }
			var name = $("[data-r-name]").value.trim();
			var phone = $("[data-r-phone]").value.replace(/\D/g, "");
			var err = $("[data-form-error]");

			function refuse(message) {
				err.textContent = message;
				err.classList.add("is-open");
				return false;
			}

			if (!name) {
				return refuse(SCOPE.askPhone
					? "Write down who took delivery before finishing."
					: "Write down who brought the goods back before finishing.");
			}
			if (SCOPE.askPhone && phone.length !== 10) {
				return refuse("A ten-digit mobile number is needed for the person who signed.");
			}
			var vehicleEl = $("[data-r-vehicle]");
			if (SCOPE.askVehicle && vehicleEl && !vehicleEl.value) {
				return refuse("Say which vehicle the goods came back on.");
			}
			if (state.pad.isEmpty()) {
				return refuse("Ask the receiver to sign before finishing.");
			}
			err.classList.remove("is-open");

			var signature = state.pad.toDataURL();
			var photos = state.photos.slice();
			// An empty date field would otherwise store a bare time.
			var returnDate = $("[data-r-return]").value || db.meta.today;
			var designation = $("[data-r-desig]").value.trim();

			LNST.store.tx(function () {
				if (SCOPE.askPhone) {
					dc.receiver = { name: name, designation: designation, phone: phone };
					dc.proof = dc.proof || {};
					dc.proof.signature = signature;
					dc.proof.photos = photos;
					dc.expected_return = returnDate;
					dc.delivered_on = db.meta.today;
					dc.lines.forEach(function (l) { l.line_status = "Delivered"; });
				} else {
					// Coming back: a separate record, so the outward proof of
					// delivery is not overwritten by the inward one.
					dc.returned_by = {
						name: name, designation: designation,
						vehicle: vehicleEl ? vehicleEl.value : null,
					};
					dc.return_proof = { signature: signature, photos: photos };
					dc.returned_on = returnDate + " " + new Date()
						.toTimeString().slice(0, 5);
				}
				dc.status = SCOPE.next;
				var req = LNST.get("requests", dc.request);
				if (req) { req.status = SCOPE.next; }
			});

			paintList();
			paintDetail();
			paintKpis();
			ui.toast(SCOPE.askPhone
				? dc.id + " confirmed · handed to " + name + "."
				: dc.id + " received back · signed by " + name + ".", "ok");
		}

		/* -------------------------------------------------- print and excel */

		function exportCsv() {
			var rows = visible();
			var head = ["Delivery no", "Date", "Request", "Hospital", "Surgeon", "Surgery",
				"Vehicle", "Items", "Received by", "Phone", "Return by", "Status"];
			var body = rows.map(function (c) {
				var r = c.receiver || {};
				var veh = LNST.get("vehicles", c.vehicle);
				return [c.id, c.date, c.request, hospital(c.hospital), c.surgeon,
					c.surgery_date, veh ? veh.reg : "", LNST.rules.balance(c).delivered,
					r.name || "", r.phone || "", c.expected_return || "", c.status];
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
			a.download = "lnst-deliveries-" + db.meta.today + ".csv";
			document.body.appendChild(a);
			a.click();
			a.remove();
			ui.toast(rows.length + " deliveries exported.", "ok");
		}

		/* ----------------------------------------------------------- wiring */

		$("[data-list]").addEventListener("click", function (e) {
			var tr = e.target.closest("[data-dc]");
			if (!tr) { return; }
			state.open = tr.getAttribute("data-dc");
			paintList();
			paintDetail();
		});

		var onFilter = LNST.debounce(function () {
			state.filters.search = $("[data-f-search]").value.trim();
			state.filters.branch = $("[data-f-branch]").value;
			state.filters.state = $("[data-f-state]").value;
			state.filters.executive = $("[data-f-exec]").value;
			paintList();
		}, 220);

		["[data-f-search]", "[data-f-branch]", "[data-f-state]", "[data-f-exec]"]
			.forEach(function (sel) {
				$(sel).addEventListener("input", onFilter);
				$(sel).addEventListener("change", onFilter);
			});

		$("[data-f-clear]").addEventListener("click", function () {
			state.filters = { search: "", branch: "", state: "awaiting", executive: "" };
			$("[data-f-search]").value = "";
			$("[data-f-branch]").value = "";
			$("[data-f-exec]").value = "";
			$("[data-f-state]").value = "awaiting";
			paintList();
		});

		$("[data-print]").addEventListener("click", function () { window.print(); });
		$("[data-excel]").addEventListener("click", exportCsv);

		window.addEventListener("resize", LNST.debounce(function () {
			if (state.pad) { state.pad.resize(); }
		}, 200));

		/* ------------------------------------------------------- first paint */

		var heading = $("[data-panel-heading]");
		if (heading) { heading.textContent = SCOPE.title; }

		paintKpis();
		paintList();
		var first = visible()[0];
		if (first) { state.open = first.id; }
		paintList();
		paintDetail();
	},
};

/* Outbound and inbound confirmation are the same screen. */
LNST.screen("delivery", SCREEN);
LNST.screen("return_inward", SCREEN);
})();
