/* Copyright (c) 2026, Acube Innovations Pvt Ltd and contributors
 *
 * /lnst — Operations Overview.
 *
 * Every number here is derived from mock_data.js at render time rather than
 * stored, so clicking through the mockup and mutating state moves these
 * figures too. Nothing is fetched.
 */
LNST.screen("home", {
	start: function () {
		var db = LNST.db;
		var fmt = LNST.fmt;
		var ui = LNST.ui;
		var today = db.meta.today;

		/* ------------------------------------------------------------ kpis */

		function countBy(status) {
			return db.requests.filter(function (r) { return r.status === status; }).length;
		}

		var inFlight = ["Approved", "Picking", "Picked", "Dispatched"]
			.reduce(function (n, s) { return n + countBy(s); }, 0);

		var awaitingUsage = db.challans.filter(function (c) {
			return c.status === "Delivered" && !c.usage_ref;
		}).length;

		var returnsDue = db.requests.filter(function (r) {
			return r.status === "Return Pending" || r.status === "Partially Returned";
		}).length;

		// Anything expiring inside 90 days is worth a warehouse's attention;
		// the hard block at 30 days is a separate rule on the pick screen.
		var shortExpiry = db.serials.filter(function (s) {
			var d = fmt.daysBetween(today, s.expiry);
			return s.status === "available" && d < 90;
		}).length;

		var atHospital = db.serials.filter(function (s) { return s.status === "at_hospital"; });
		var parkedValue = atHospital.reduce(function (sum, s) {
			var item = LNST.get("items", s.item);
			return sum + (item ? item.rate : 0);
		}, 0);

		var unbalanced = db.challans.filter(function (c) {
			return c.status !== "Closed" && !LNST.rules.balance(c).ok;
		}).length;

		var KPIS = [
			{ label: "Awaiting approval", value: countBy("Pending Approval"),
			  foot: "across four branches", tone: countBy("Pending Approval") ? "warn" : "" },
			{ label: "In flight", value: inFlight, foot: "approved through dispatched" },
			{ label: "Usage not captured", value: awaitingUsage,
			  foot: "delivered, nothing reported", tone: awaitingUsage ? "warn" : "" },
			{ label: "Returns due", value: returnsDue, foot: "pending or partial",
			  tone: returnsDue ? "warn" : "" },
			{ label: "Challans not balanced", value: unbalanced,
			  foot: "cannot close yet", tone: unbalanced ? "bad" : "good" },
			{ label: "Short expiry", value: shortExpiry, foot: "available, under 90 days",
			  tone: shortExpiry ? "bad" : "good" },
			{ label: "Parked at hospitals", value: fmt.money(parkedValue),
			  foot: atHospital.length + " serials out" },
			{ label: "Hospitals served", value: db.meta.hospital_count, foot: "Stryker implants" },
		];

		LNST.$("[data-kpis]").innerHTML = KPIS.map(function (k) {
			return '<div class="tile' + (k.tone ? " is-" + k.tone : "") + '">'
				+ '<div class="tile-label">' + ui.esc(k.label) + "</div>"
				+ '<div class="tile-value">' + ui.esc(k.value) + "</div>"
				+ '<div class="tile-foot">' + ui.esc(k.foot) + "</div></div>";
		}).join("");

		/* ------------------------------------------------- needs attention */

		var attention = [];

		db.requests.filter(function (r) { return r.status === "Pending Approval"; })
			.forEach(function (r) {
				attention.push({
					title: r.id + " · " + short(r.hospital),
					sub: r.priority + " · surgery " + fmt.day(r.surgery_date),
					status: r.status, href: "/lnst/approvals",
				});
			});

		db.challans.filter(function (c) { return c.status === "Delivered" && !c.usage_ref; })
			.forEach(function (c) {
				attention.push({
					title: c.id + " · " + short(c.hospital),
					sub: "Delivered " + fmt.day(c.surgery_date) + " — usage not captured",
					status: "Usage due", href: "/lnst/usage",
				});
			});

		db.returns.filter(function (r) { return r.recon && r.recon.missing; })
			.forEach(function (r) {
				attention.push({
					title: r.id + " · " + short(r.hospital),
					sub: r.recon.missing + " item(s) unaccounted for",
					status: "Variance", href: "/lnst/return-inward",
				});
			});

		// Anything available and expiring inside the 30-day block window.
		db.serials.filter(function (s) {
			return s.status === "available" && fmt.daysBetween(today, s.expiry) < 30;
		}).forEach(function (s) {
			var item = LNST.get("items", s.item);
			attention.push({
				title: s.sn + " · " + (item ? item.name : s.item),
				sub: "Expires " + fmt.day(s.expiry) + " — blocked for surgery",
				status: "Expiring", href: "/lnst/expiry",
			});
		});

		LNST.$("[data-attention-count]").textContent = attention.length + " open";

		ui.rows(LNST.$("[data-attention]"), {
			items: attention.slice(0, 9),
			emptyHead: "Nothing needs you right now",
			emptyHint: "Approvals, missing usage and variances land here.",
			line: function (a) {
				return '<a class="row-line" href="' + a.href + '">'
					+ '<span class="row-main"><b>' + ui.esc(a.title) + "</b>"
					+ "<small>" + ui.esc(a.sub) + "</small></span>"
					+ ui.pill(a.status) + "</a>";
			},
		});

		/* ------------------------------------------------------ state board */

		var states = db.meta.states.map(function (s) {
			return { state: s, n: countBy(s) };
		}).filter(function (row) { return row.n; });

		var top = Math.max.apply(null, states.map(function (r) { return r.n; }));

		LNST.$("[data-states]").innerHTML = '<div class="bars">' + states.map(function (r) {
			var pct = Math.round((r.n / top) * 100);
			return '<div class="bar-row">'
				+ '<span class="bar-label">' + ui.esc(r.state) + "</span>"
				+ '<span class="bar-track"><span class="bar-fill bar-' + LNST.flow.tone(r.state)
				+ '" style="width:' + pct + '%"></span></span>'
				+ '<span class="bar-n">' + r.n + "</span></div>";
		}).join("") + "</div>";

		/* -------------------------------------------------- recent challans */

		var recent = db.challans.slice().sort(function (a, b) {
			return a.date < b.date ? 1 : -1;
		}).slice(0, 8);

		ui.table(LNST.$("[data-challans]"), {
			rows: recent,
			emptyHead: "No challans yet",
			emptyHint: "They appear once a request is picked and dispatched.",
			cols: [
				{ label: "Challan", render: function (c) {
					return '<span class="doc-no">' + ui.esc(c.id) + "</span>"; } },
				{ label: "Hospital", render: function (c) { return ui.esc(short(c.hospital)); } },
				{ label: "Surgery", render: function (c) { return fmt.day(c.surgery_date); } },
				{ label: "Lines", cls: "num", render: function (c) { return c.lines.length; } },
				{ label: "Delivered", cls: "num", render: function (c) {
					return LNST.rules.balance(c).delivered; } },
				{ label: "Balance", cls: "num", render: function (c) {
					var t = LNST.rules.balance(c);
					return t.balance
						? '<b style="color:var(--stop)">' + t.balance + "</b>"
						: '<span style="color:var(--go)">0</span>'; } },
				{ label: "Status", render: function (c) { return ui.pill(c.status); } },
			],
		});

		function short(hospitalId) {
			var h = LNST.get("hospitals", hospitalId);
			return h ? h.short : hospitalId;
		}
	},
});
