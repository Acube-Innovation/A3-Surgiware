/* Copyright (c) 2026, Acube Innovations Pvt Ltd and contributors
 *
 * /lnst/status-board — the operation on one screen.
 *
 * Everything here is derived at paint time, so the board cannot drift from the
 * screens that feed it. It repaints on three signals: a change made in this
 * tab, a change made in ANY other tab (the storage event — that is what makes
 * it a live board rather than a snapshot), and a slow tick so the clock and
 * the ageing figures stay honest.
 *
 * Nothing on this page needs a second click to be understood. Anything that
 * does have a click takes you to the screen that fixes it.
 */
LNST.screen("status_board", {
	start: function () {
		var db = LNST.db, ui = LNST.ui, fmt = LNST.fmt, $ = LNST.$;
		var branch = "";
		var lastPaint = Date.now();

		function hospital(id) { var h = LNST.get("hospitals", id); return h ? h.short : id; }
		function itemName(id) { var i = LNST.get("items", id); return i ? i.name : id; }
		function inBranch(row) { return !branch || row.branch === branch; }

		/* The fifteen states collapse into the eight things a manager actually
		   asks about. Each stage owns the screen that acts on it. */
		var STAGES = [
			{ key: "asked",   label: "Requested",   states: ["Draft", "Pending Approval"],
			  href: "/lnst/approvals", tone: "muted" },
			{ key: "ok",      label: "Approved",    states: ["Approved"],
			  href: "/lnst/picks", tone: "sky" },
			{ key: "picking", label: "Picking",     states: ["Picking", "Picked"],
			  href: "/lnst/pick", tone: "sky" },
			{ key: "out",     label: "In transit",  states: ["Dispatched"],
			  href: "/lnst/delivery", tone: "warn" },
			{ key: "at",      label: "At hospital", states: ["Delivered"],
			  href: "/lnst/usage", tone: "warn" },
			{ key: "used",    label: "Usage in",    states: ["Usage Reported"],
			  href: "/lnst/inward", tone: "good" },
			{ key: "back",    label: "Coming back", states: ["Return Pending", "Partially Returned"],
			  href: "/lnst/inward", tone: "warn" },
			{ key: "done",    label: "Settled",     states: ["Fully Returned", "Reconciled", "Closed"],
			  href: "/lnst/challans", tone: "good" },
		];

		/* ------------------------------------------------------------ kpis */

		function figures() {
			var reqs = db.requests.filter(inBranch);
			var dcs = db.challans.filter(inBranch);

			var open = reqs.filter(function (r) {
				return ["Closed", "Cancelled", "Rejected"].indexOf(r.status) === -1;
			});
			var surgeryToday = reqs.filter(function (r) {
				return r.surgery_date === db.meta.today
					&& ["Closed", "Cancelled", "Rejected"].indexOf(r.status) === -1;
			});
			var awaitingApproval = reqs.filter(function (r) { return r.status === "Pending Approval"; });
			var usageDue = dcs.filter(function (c) { return c.status === "Delivered" && !c.usage_ref; });
			var overdue = dcs.filter(function (c) {
				return c.expected_return && c.expected_return < db.meta.today
					&& ["Reconciled", "Closed"].indexOf(c.status) === -1;
			});
			var atHospital = db.serials.filter(function (s) {
				return s.status === "at_hospital" && (!branch || s.branch === branch);
			});
			var parked = atHospital.reduce(function (n, s) {
				var i = LNST.get("items", s.item);
				return n + (i ? i.rate : 0);
			}, 0);
			var unbalanced = dcs.filter(function (c) {
				return ["Reconciled", "Closed"].indexOf(c.status) === -1
					&& c.usage_ref && !LNST.rules.balance(c).ok;
			});
			var missing = dcs.reduce(function (n, c) {
				return n + LNST.rules.balance(c).missing;
			}, 0);
			var shortExp = db.serials.filter(function (s) {
				return s.status === "available" && (!branch || s.branch === branch)
					&& fmt.daysBetween(db.meta.today, s.expiry) < 90;
			});

			return { reqs: reqs, dcs: dcs, open: open, surgeryToday: surgeryToday,
				awaitingApproval: awaitingApproval, usageDue: usageDue, overdue: overdue,
				parked: parked, atHospital: atHospital, unbalanced: unbalanced,
				missing: missing, shortExp: shortExp };
		}

		function paintKpis(f) {
			var tiles = [
				{ label: "Live cases", value: f.open.length, foot: "not yet closed" },
				{ label: "Surgery today", value: f.surgeryToday.length, foot: "must not slip",
				  tone: f.surgeryToday.length ? "warn" : "" },
				{ label: "Awaiting approval", value: f.awaitingApproval.length,
				  foot: "blocking a pick", tone: f.awaitingApproval.length ? "warn" : "good" },
				{ label: "Usage not in", value: f.usageDue.length, foot: "delivered, unreported",
				  tone: f.usageDue.length ? "warn" : "good" },
				{ label: "Returns overdue", value: f.overdue.length, foot: "past the return date",
				  tone: f.overdue.length ? "bad" : "good" },
				{ label: "Items unaccounted", value: f.missing, foot: "reported missing",
				  tone: f.missing ? "bad" : "good" },
			];
			$("[data-kpis]").innerHTML = tiles.map(function (k) {
				return '<div class="tile' + (k.tone ? " is-" + k.tone : "") + '">'
					+ '<div class="tile-label">' + ui.esc(k.label) + "</div>"
					+ '<div class="tile-value">' + ui.esc(k.value) + "</div>"
					+ '<div class="tile-foot">' + ui.esc(k.foot) + "</div></div>";
			}).join("");
		}

		/* ----------------------------------------------------- the pipeline */

		function paintFlow(f) {
			var counts = STAGES.map(function (st) {
				return f.reqs.filter(function (r) { return st.states.indexOf(r.status) > -1; }).length;
			});
			var top = Math.max.apply(null, counts.concat([1]));

			var lost = f.reqs.filter(function (r) {
				return r.status === "Rejected" || r.status === "Cancelled";
			}).length;

			$("[data-flow]").innerHTML = STAGES.map(function (st, i) {
				var n = counts[i];
				return '<a class="flow-step' + (n ? "" : " is-empty") + '" href="' + st.href + '">'
					+ '<span class="flow-n flow-' + st.tone + '">' + n + "</span>"
					+ '<span class="flow-l">' + ui.esc(st.label) + "</span>"
					+ '<span class="flow-bar"><span style="height:'
					+ Math.round((n / top) * 100) + '%"></span></span>'
					+ "</a>";
			}).join('<span class="flow-arrow" aria-hidden="true">›</span>')
			+ (lost ? '<span class="flow-lost"><b>' + lost + "</b>rejected<br>or cancelled</span>" : "");
		}

		/* ------------------------------------------------- needs a manager */

		function paintAttention(f) {
			var rows = [];

			f.awaitingApproval.forEach(function (r) {
				rows.push({ rank: r.priority === "Routine" ? 3 : 1,
					tone: r.priority === "Routine" ? "warn" : "bad",
					what: r.id + " · " + hospital(r.hospital),
					why: r.priority + " · surgery " + fmt.day(r.surgery_date) + " · not approved",
					href: "/lnst/approvals" });
			});

			f.overdue.forEach(function (c) {
				var late = fmt.daysBetween(c.expected_return, db.meta.today);
				rows.push({ rank: 0, tone: "bad",
					what: c.id + " · " + hospital(c.hospital),
					why: late + " day" + (late === 1 ? "" : "s") + " past the return date",
					href: "/lnst/inward" });
			});

			f.usageDue.forEach(function (c) {
				var since = fmt.daysBetween(c.surgery_date, db.meta.today);
				rows.push({ rank: since > 1 ? 1 : 4, tone: since > 1 ? "bad" : "warn",
					what: c.id + " · " + hospital(c.hospital),
					why: "surgery " + (since <= 0 ? "today" : since + " day"
						+ (since === 1 ? "" : "s") + " ago") + " · usage not captured",
					href: "/lnst/usage" });
			});

			f.dcs.forEach(function (c) {
				var t = LNST.rules.balance(c);
				if (!t.missing) { return; }
				rows.push({ rank: 0, tone: "bad",
					what: c.id + " · " + hospital(c.hospital),
					why: t.missing + " item" + (t.missing === 1 ? "" : "s") + " unaccounted for",
					href: "/lnst/return-inward" });
			});

			f.shortExp.filter(function (s) {
				return fmt.daysBetween(db.meta.today, s.expiry) < 30;
			}).forEach(function (s) {
				rows.push({ rank: 2, tone: "warn",
					what: s.sn + " · " + itemName(s.item),
					why: "expires " + fmt.day(s.expiry) + " · blocked for surgery",
					href: "/lnst/expiry" });
			});

			rows.sort(function (a, b) { return a.rank - b.rank; });
			$("[data-attention-count]").textContent = rows.length
				? rows.length + " open" : "all clear";

			$("[data-attention]").innerHTML = rows.length
				? '<div class="row-list">' + rows.map(function (r) {
					return '<a class="row-line" href="' + r.href + '">'
						+ '<span class="row-main"><b>' + ui.esc(r.what) + "</b><small>"
						+ ui.esc(r.why) + "</small></span>"
						+ '<span class="pill pill-' + r.tone + '">'
						+ (r.tone === "bad" ? "Act now" : "Watch") + "</span></a>";
				}).join("") + "</div>"
				: ui.empty("Nothing needs you", "Approvals, overdue returns and variances land here.");
		}

		/* ------------------------------------------------------- by branch */

		function paintBranches(f) {
			var rows = db.branches.filter(function (b) { return !branch || b.id === branch; })
				.map(function (b) {
					var reqs = db.requests.filter(function (r) { return r.branch === b.id; });
					var dcs = db.challans.filter(function (c) { return c.branch === b.id; });
					var live = reqs.filter(function (r) {
						return ["Closed", "Cancelled", "Rejected"].indexOf(r.status) === -1;
					}).length;
					var out = dcs.filter(function (c) {
						return ["Dispatched", "Delivered", "Usage Reported"].indexOf(c.status) > -1;
					}).length;
					var late = dcs.filter(function (c) {
						return c.expected_return && c.expected_return < db.meta.today
							&& ["Reconciled", "Closed"].indexOf(c.status) === -1;
					}).length;
					var parked = db.serials.filter(function (s) {
						return s.status === "at_hospital" && s.branch === b.id;
					}).reduce(function (n, s) {
						var i = LNST.get("items", s.item); return n + (i ? i.rate : 0);
					}, 0);
					return { b: b, live: live, out: out, late: late, parked: parked };
				});

			ui.table($("[data-branches]"), {
				rows: rows,
				emptyHead: "No branches",
				cols: [
					{ label: "Branch", render: function (r) {
						return "<b>" + ui.esc(r.b.name) + "</b>"
							+ (r.b.is_hub ? '<small>hub</small>' : ""); } },
					{ label: "Live", cls: "num", render: function (r) { return r.live; } },
					{ label: "Out", cls: "num", render: function (r) { return r.out; } },
					{ label: "Late", cls: "num", render: function (r) {
						return r.late
							? '<b style="color:var(--stop)">' + r.late + "</b>" : "0"; } },
					{ label: "Parked", cls: "num", render: function (r) {
						return fmt.money(r.parked); } },
				],
			});
		}

		/* ------------------------------------------- money and shelf life */

		function paintRisk(f) {
			var oldest = 0;
			f.dcs.forEach(function (c) {
				if (["Reconciled", "Closed"].indexOf(c.status) > -1) { return; }
				oldest = Math.max(oldest, fmt.daysBetween(c.date, db.meta.today));
			});

			var buckets = [
				{ label: "Expired", test: function (d) { return d < 0; }, tone: "bad" },
				{ label: "Under 30 days", test: function (d) { return d >= 0 && d < 30; }, tone: "bad" },
				{ label: "30 to 90 days", test: function (d) { return d >= 30 && d < 90; }, tone: "warn" },
				{ label: "Over 90 days", test: function (d) { return d >= 90; }, tone: "good" },
			];
			var avail = db.serials.filter(function (s) {
				return s.status === "available" && (!branch || s.branch === branch);
			});
			var top = Math.max.apply(null, buckets.map(function (bk) {
				return avail.filter(function (s) {
					return bk.test(fmt.daysBetween(db.meta.today, s.expiry));
				}).length;
			}).concat([1]));

			$("[data-risk]").innerHTML = ''
				+ '<div class="risk-heads">'
				+ '<div class="tile is-warn"><div class="tile-label">Parked at hospitals</div>'
				+ '<div class="tile-value">' + fmt.money(f.parked) + "</div>"
				+ '<div class="tile-foot">' + f.atHospital.length + " serials out</div></div>"
				+ '<div class="tile' + (oldest > 7 ? " is-bad" : "") + '">'
				+ '<div class="tile-label">Oldest open challan</div>'
				+ '<div class="tile-value">' + oldest + "d</div>"
				+ '<div class="tile-foot">since it was raised</div></div>'
				+ "</div>"
				+ '<div class="bars" style="margin-top:12px">' + buckets.map(function (bk) {
					var n = avail.filter(function (s) {
						return bk.test(fmt.daysBetween(db.meta.today, s.expiry));
					}).length;
					return '<div class="bar-row"><span class="bar-label">' + ui.esc(bk.label)
						+ "</span>"
						+ '<span class="bar-track"><span class="bar-fill bar-' + bk.tone
						+ '" style="width:' + Math.round((n / top) * 100) + '%"></span></span>'
						+ '<span class="bar-n">' + n + "</span></div>";
				}).join("") + "</div>"
				+ '<p class="panel-note" style="margin-top:8px">Available stock by shelf life'
				+ (branch ? " · " + ui.esc((LNST.get("branches", branch) || {}).name) : " · all branches")
				+ "</p>";
		}

		/* ----------------------------------------------------------- paint */

		function paintAll() {
			var f = figures();
			paintKpis(f);
			paintFlow(f);
			paintAttention(f);
			paintBranches(f);
			paintRisk(f);
			lastPaint = Date.now();
			$("[data-updated]").textContent = "just now";
		}

		/* ------------------------------------------------------------ live */

		function tick() {
			var now = new Date();
			$("[data-clock]").textContent = now.toTimeString().slice(0, 8);
			var age = Math.round((Date.now() - lastPaint) / 1000);
			$("[data-updated]").textContent = age < 5 ? "just now"
				: age < 60 ? "updated " + age + "s ago"
				: "updated " + Math.round(age / 60) + "m ago";
		}

		// A change in THIS tab.
		LNST.on("changed", paintAll);

		// A change in ANY other tab. This is what makes the board live: leave
		// it on a second screen and it follows the warehouse in real time.
		window.addEventListener("storage", function (e) {
			if (e.key && e.key !== "lnst.state") { return; }
			LNST.store.load();
			db = LNST.db;
			paintAll();
			ui.toast("Board updated.", "ok");
		});

		window.setInterval(tick, 1000);

		/* --------------------------------------------------------- filter */

		var sel = $("[data-f-branch]");
		sel.innerHTML = '<option value="">All Kerala</option>'
			+ db.branches.map(function (b) {
				return '<option value="' + ui.esc(b.id) + '">' + ui.esc(b.name) + "</option>";
			}).join("");
		sel.addEventListener("change", function () { branch = sel.value; paintAll(); });

		paintAll();
		tick();
	},
});
