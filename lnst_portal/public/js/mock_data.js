/* Copyright (c) 2026, Acube Innovations Pvt Ltd and contributors
 *
 * LNST mockup — the single seed. One global: window.LNST_MOCK.
 *
 * No server, no DocType, no API. Every screen reads from here (through
 * LNST.db, which layers localStorage edits on top).
 *
 * Two conventions hold the whole thing together:
 *   1. Ids are human-readable strings and every cross-reference is an id,
 *      never a nested object. LNST.get(collection, id) resolves them.
 *   2. Serial numbers are generated from a seeded PRNG, never Math.random(),
 *      so a reset reproduces exactly the same demo and screenshots are stable.
 *
 * ---------------------------------------------------------------------------
 * TWO PLACES THE BRIEF WAS AMBIGUOUS, AND WHAT WAS ASSUMED
 *
 * a) The balance identity is stated twice, differently. Usage Capture says
 *    "used + return + damaged + missing = delivered"; Open Challans says
 *    "delivered = used + returned + damaged + written-off". Neither mentions
 *    the fifth disposition, Opened-Unused. One identity is used everywhere:
 *
 *        delivered = used + returned + damaged + written_off + missing
 *
 *    with Opened-Unused mapping to written_off (billable, comes back to a
 *    quarantine rack) and To Return at usage time becoming returned once the
 *    Return Receipt is made. This is the most load-bearing arithmetic in the
 *    app and it lives in exactly one function, LNST.rules.balance().
 *
 * b) 91208 / 91280 / 91281 are three codes for a stated two-way consignment
 *    vs purchased split. Read here as warehouse/ownership codes:
 *    91208 consignment, 91280 purchased, 91281 loaner. If they are HSN codes
 *    instead, the put-away branch of the Inward screen changes.
 * ---------------------------------------------------------------------------
 */
(function (window) {
	"use strict";

	var TODAY = "2026-08-18";

	/* Deterministic PRNG — mulberry32. Math.random() would make every reset a
	   different demo and every screenshot a different picture. */
	function rng(seed) {
		return function () {
			seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
			var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	/* UTC throughout: parsing an ISO day as local midnight and rendering it
	   back through toISOString() shifts the date east of Greenwich. */
	function addDays(iso, days) {
		var d = new Date(iso + "T00:00:00Z");
		d.setUTCDate(d.getUTCDate() + days);
		return d.toISOString().slice(0, 10);
	}

	/* ------------------------------------------------------------ masters */

	var branches = [
		{ id: "KCH", name: "Kochi", code: "KCH", city: "Kochi", is_hub: 1, phone: "0484 4012200" },
		{ id: "TVM", name: "Trivandrum", code: "TVM", city: "Thiruvananthapuram", is_hub: 0, phone: "0471 4012200" },
		{ id: "TSR", name: "Thrissur", code: "TSR", city: "Thrissur", is_hub: 0, phone: "0487 4012200" },
		{ id: "CLT", name: "Calicut", code: "CLT", city: "Kozhikode", is_hub: 0, phone: "0495 4012200" },
	];

	/* 91208 consignment · 91280 purchased · 91281 loaner — see note (b). */
	var WH_KINDS = [
		["CONSIGN", "91208", "Consignment"],
		["PURCH", "91280", "Purchased"],
		["LOANER", "91281", "Loaner"],
		["DAMAGE", "DMG", "Damage"],
		["QUAR", "QTN", "Quarantine"],
	];

	var warehouses = [];
	branches.forEach(function (b) {
		WH_KINDS.forEach(function (k) {
			warehouses.push({
				id: b.id + "-" + k[0], branch: b.id, kind: k[0],
				code: k[1], name: b.name + " " + k[2], ownership_code: k[1],
			});
		});
	});

	var racks = [];
	branches.forEach(function (b) {
		["A", "B", "C"].forEach(function (zone) {
			for (var n = 1; n <= 4; n++) {
				racks.push({
					id: b.id + "-" + zone + "-" + String(n).padStart(2, "0"),
					branch: b.id, zone: zone,
					kind: zone === "A" ? "pick" : zone === "B" ? "bulk" : "returns",
					capacity: 40,
				});
			}
		});
		racks.push({ id: b.id + "-Q-01", branch: b.id, zone: "Q", kind: "quarantine", capacity: 20 });
		racks.push({ id: b.id + "-D-01", branch: b.id, zone: "D", kind: "damage", capacity: 20 });
	});

	var items = [
		["IMP-HIP-STEM-A", "Accolade II Hip Stem", "Implant", "Hip", "Size 3", "Right", "—", 68500],
		["IMP-HIP-STEM-B", "Accolade II Hip Stem", "Implant", "Hip", "Size 5", "Right", "—", 68500],
		["IMP-HIP-HEAD-32", "LFIT V40 Femoral Head", "Implant", "Hip", "32 mm", "Both", "—", 24800],
		["IMP-HIP-CUP-52", "Trident II Acetabular Shell", "Implant", "Hip", "52 mm", "Left", "—", 51200],
		["IMP-KNEE-FEM-3R", "Triathlon Femoral Component", "Implant", "Knee", "Size 3", "Right", "—", 74200],
		["IMP-KNEE-TIB-3", "Triathlon Tibial Baseplate", "Implant", "Knee", "Size 3", "Both", "—", 46900],
		["IMP-KNEE-INS-10", "Triathlon X3 Insert", "Implant", "Knee", "Size 3", "Both", "10 mm", 28400],
		["IMP-SPN-CAGE-8", "Tritanium C Cage", "Implant", "Spine", "8 mm", "Both", "8 mm", 62300],
		["IMP-SPN-SCREW-45", "Xia 3 Pedicle Screw", "Implant", "Spine", "6.5 x 45", "Both", "—", 18700],
		["IMP-SPN-ROD-90", "Xia 3 Titanium Rod", "Implant", "Spine", "90 mm", "Both", "5.5 mm", 9400],
		["IMP-TRA-PLATE-7", "VariAx 2 Distal Radius Plate", "Implant", "Trauma", "7 hole", "Left", "2.4 mm", 32600],
		["IMP-TRA-NAIL-360", "T2 Alpha Femoral Nail", "Implant", "Trauma", "360 mm", "Right", "10 mm", 58900],
		["IMP-TRA-SCREW-32", "Asnis III Cannulated Screw", "Implant", "Trauma", "32 mm", "Both", "—", 7300],
		["INS-HIP-TRAY", "Hip Instrument Tray", "Instrument", "Hip", "Standard", "Both", "—", 0],
		["INS-KNEE-TRAY", "Triathlon Instrument Tray", "Instrument", "Knee", "Standard", "Both", "—", 0],
		["INS-SPN-TRAY", "Xia 3 Instrument Tray", "Instrument", "Spine", "Standard", "Both", "—", 0],
		["CON-CEMENT-40", "Simplex P Bone Cement 40g", "Consumable", "Cement", "40 g", "Both", "—", 6800],
		["CON-BLADE-SAG", "Sagittal Saw Blade", "Consumable", "Disposable", "90 mm", "Both", "—", 4200],
		["CON-DRILL-32", "Drill Bit 3.2 mm", "Consumable", "Disposable", "3.2 mm", "Both", "—", 2100],
		["CON-SUTURE-2", "Suture Anchor #2", "Consumable", "Disposable", "—", "Both", "—", 5600],
	].map(function (r, i) {
		return {
			id: r[0], code: r[0], name: r[1], group: r[2], family: r[3],
			size: r[4], side: r[5], thickness: r[6], rate: r[7],
			brand: "Stryker", uom: "Nos",
			serialized: r[2] !== "Consumable" ? 1 : 0,
			implant: r[2] === "Implant" ? 1 : 0,
			gtin: "0885" + String(760000 + i * 137).slice(0, 6),
			hsn: "90213100",
			shelf_life_months: r[2] === "Consumable" ? 24 : 60,
			ownership_default: i % 3 === 1 ? "purchased" : "consignment",
		};
	});

	var kits = [
		{ id: "KIT-HIP-PRIM", name: "Primary Hip Kit", specialty: "Hip",
		  lines: [["IMP-HIP-STEM-A", 1], ["IMP-HIP-HEAD-32", 1], ["IMP-HIP-CUP-52", 1],
		          ["INS-HIP-TRAY", 1], ["CON-CEMENT-40", 2]] },
		{ id: "KIT-KNEE-PRIM", name: "Primary Knee Kit", specialty: "Knee",
		  lines: [["IMP-KNEE-FEM-3R", 1], ["IMP-KNEE-TIB-3", 1], ["IMP-KNEE-INS-10", 1],
		          ["INS-KNEE-TRAY", 1], ["CON-CEMENT-40", 2], ["CON-BLADE-SAG", 1]] },
		{ id: "KIT-SPN-FUSION", name: "Lumbar Fusion Kit", specialty: "Spine",
		  lines: [["IMP-SPN-CAGE-8", 2], ["IMP-SPN-SCREW-45", 6], ["IMP-SPN-ROD-90", 2],
		          ["INS-SPN-TRAY", 1]] },
		{ id: "KIT-TRA-RADIUS", name: "Distal Radius Kit", specialty: "Trauma",
		  lines: [["IMP-TRA-PLATE-7", 1], ["IMP-TRA-SCREW-32", 6], ["CON-DRILL-32", 2]] },
		{ id: "KIT-TRA-FEMUR", name: "Femoral Nailing Kit", specialty: "Trauma",
		  lines: [["IMP-TRA-NAIL-360", 1], ["IMP-TRA-SCREW-32", 4], ["CON-DRILL-32", 2]] },
	].map(function (k) {
		k.lines = k.lines.map(function (l, i) { return { idx: i + 1, item: l[0], qty: l[1], optional: 0 }; });
		return k;
	});

	var HOSP = [
		["H-AMR-KCH", "Amrita Institute of Medical Sciences", "Amrita", "Kochi", "KCH", "A"],
		["H-LIS-KCH", "Lisie Hospital", "Lisie", "Kochi", "KCH", "A"],
		["H-RAJ-KCH", "Rajagiri Hospital", "Rajagiri", "Aluva", "KCH", "A"],
		["H-LAK-KCH", "Lakeshore Hospital", "Lakeshore", "Kochi", "KCH", "A"],
		["H-LOU-KCH", "Lourdes Hospital", "Lourdes", "Kochi", "KCH", "B"],
		["H-AST-KCH", "Aster Medcity", "Aster Medcity", "Kochi", "KCH", "A"],
		["H-MOS-KCH", "MOSC Medical College", "MOSC", "Kolenchery", "KCH", "B"],
		["H-SUN-KCH", "Sunrise Hospital", "Sunrise", "Kakkanad", "KCH", "B"],
		["H-KIM-TVM", "KIMSHEALTH", "KIMS", "Thiruvananthapuram", "TVM", "A"],
		["H-SUT-TVM", "SUT Hospital", "SUT", "Thiruvananthapuram", "TVM", "B"],
		["H-ANA-TVM", "Ananthapuri Hospitals", "Ananthapuri", "Thiruvananthapuram", "TVM", "B"],
		["H-SCT-TVM", "Sree Chitra Institute", "Sree Chitra", "Thiruvananthapuram", "TVM", "A"],
		["H-JUB-TSR", "Jubilee Mission Medical College", "Jubilee", "Thrissur", "TSR", "A"],
		["H-DAY-TSR", "Daya General Hospital", "Daya", "Thrissur", "TSR", "B"],
		["H-AMA-TSR", "Amala Institute of Medical Sciences", "Amala", "Thrissur", "TSR", "B"],
		["H-AST-CLT", "Aster MIMS", "Aster MIMS", "Kozhikode", "CLT", "A"],
		["H-BAB-CLT", "Baby Memorial Hospital", "Baby Memorial", "Kozhikode", "CLT", "A"],
		["H-IQR-CLT", "IQRAA International Hospital", "IQRAA", "Kozhikode", "CLT", "B"],
	];

	var SURGEONS = ["Dr Anil Kuruvilla", "Dr Meera Raghavan", "Dr Sajan Thomas", "Dr Priya Menon",
		"Dr Rafeeq Ahmed", "Dr Nandita Pillai", "Dr George Varkey", "Dr Habeeb Rahman"];

	var hospitals = HOSP.map(function (h, i) {
		return {
			id: h[0], name: h[1], short: h[2], city: h[3], branch: h[4], tier: h[5],
			category: i % 4 === 0 ? "Corporate" : i % 3 === 0 ? "Trust" : "Private",
			credit_days: [30, 45, 60][i % 3],
			contact: { name: ["Store Manager", "OT Incharge", "Purchase Officer"][i % 3],
			           phone: "98" + String(47000000 + i * 131717) },
			surgeons: [SURGEONS[i % SURGEONS.length], SURGEONS[(i + 3) % SURGEONS.length]],
			address: h[1] + ", " + h[3] + ", Kerala",
		};
	});

	var executives = [
		{ id: "EX-01", name: "Vishnu Prasad", code: "EX-01", branch: "KCH", phone: "9847011201", vehicle: "VH-01" },
		{ id: "EX-02", name: "Aneesh Kumar", code: "EX-02", branch: "KCH", phone: "9847011202", vehicle: "VH-02" },
		{ id: "EX-03", name: "Rahul Nair", code: "EX-03", branch: "TVM", phone: "9847011203", vehicle: "VH-03" },
		{ id: "EX-04", name: "Sreejith M", code: "EX-04", branch: "TSR", phone: "9847011204", vehicle: "VH-04" },
		{ id: "EX-05", name: "Faisal Rahman", code: "EX-05", branch: "CLT", phone: "9847011205", vehicle: "VH-05" },
		{ id: "EX-06", name: "Deepak Menon", code: "EX-06", branch: "KCH", phone: "9847011206", vehicle: "VH-06" },
	];

	var vehicles = [
		{ id: "VH-01", reg: "KL-07-CN-4412", branch: "KCH", kind: "Two-wheeler", driver: "Vishnu Prasad" },
		{ id: "VH-02", reg: "KL-07-AT-8890", branch: "KCH", kind: "Car", driver: "Aneesh Kumar" },
		{ id: "VH-03", reg: "KL-01-BQ-2271", branch: "TVM", kind: "Car", driver: "Rahul Nair" },
		{ id: "VH-04", reg: "KL-08-CE-6634", branch: "TSR", kind: "Two-wheeler", driver: "Sreejith M" },
		{ id: "VH-05", reg: "KL-11-DA-1902", branch: "CLT", kind: "Car", driver: "Faisal Rahman" },
		{ id: "VH-06", reg: "KL-07-CV-7745", branch: "KCH", kind: "Van", driver: "Contract" },
		// A branch with one vehicle gives a dispatcher no choice to make, and
		// the assignment popup has nothing to show. Two apiece, minimum.
		{ id: "VH-07", reg: "KL-01-CP-3318", branch: "TVM", kind: "Two-wheeler", driver: "Contract" },
		{ id: "VH-08", reg: "KL-08-BF-5027", branch: "TSR", kind: "Car", driver: "Contract" },
		{ id: "VH-09", reg: "KL-11-AK-6690", branch: "CLT", kind: "Two-wheeler", driver: "Contract" },
	];

	/* ---------------------------------------------------- lots and serials */

	var rand = rng(20260818);
	var lots = [];
	var serials = [];
	var serialSeq = 0;

	items.forEach(function (item, ii) {
		if (!item.serialized) { return; }
		var lotCount = 2 + Math.floor(rand() * 2);
		for (var l = 0; l < lotCount; l++) {
			var ownership = l % 2 === 0 ? item.ownership_default
				: (item.ownership_default === "consignment" ? "purchased" : "consignment");
			// Most lots sit comfortably in date; a couple are deliberately close
			// so the 30-day expiry rule has something to fire on.
			var months = 6 + Math.floor(rand() * 30);
			if (ii === 4 && l === 0) { months = 0; }          // ~18 days out
			var expiry = ii === 4 && l === 0 ? addDays(TODAY, 18) : addDays(TODAY, months * 30);
			var lotId = "LOT-" + item.code.split("-").slice(-1)[0] + "-" + (2400 + lots.length);
			lots.push({
				id: lotId, item: item.id, lot_no: lotId, ownership: ownership,
				mfg: addDays(expiry, -(item.shelf_life_months * 30)), expiry: expiry,
				principal_invoice: "STR/26/" + (4100 + lots.length), branch: branches[lots.length % 4].id,
			});

			var perLot = 2 + Math.floor(rand() * 3);
			for (var s = 0; s < perLot; s++) {
				serialSeq++;
				var br = branches[(lots.length + s) % 4].id;
				var rackPool = racks.filter(function (r) { return r.branch === br && r.kind === "pick"; });
				serials.push({
					id: "SN-" + String(7420000 + serialSeq * 37),
					sn: "SN-" + String(7420000 + serialSeq * 37),
					item: item.id, lot: lotId, gtin: item.gtin, expiry: expiry,
					ownership: ownership, branch: br,
					rack: rackPool[s % rackPool.length].id,
					warehouse: br + "-" + (ownership === "consignment" ? "CONSIGN" : "PURCH"),
					status: "available", hospital: null, dc: null, condition: null,
					history: [{ at: addDays(TODAY, -40), what: "Received from principal" }],
				});
			}
		}
	});

	/* ------------------------------------------------------- the documents */

	var STATES = ["Draft", "Pending Approval", "Approved", "Picking", "Picked", "Dispatched",
		"Delivered", "Usage Reported", "Return Pending", "Partially Returned",
		"Fully Returned", "Reconciled", "Closed", "Rejected", "Cancelled"];

	/* Sixteen requests, one per state (Pending Approval twice — one of them
	   carries the short-expiry trap), so every list has content cold. */
	var REQ_SPEC = [
		["0034", "Draft", "H-LIS-KCH", "KCH", "EX-01", "KIT-HIP-PRIM", 2, "Routine"],
		["0035", "Pending Approval", "H-AMR-KCH", "KCH", "EX-01", "KIT-KNEE-PRIM", 3, "Routine"],
		["0036", "Pending Approval", "H-KIM-TVM", "TVM", "EX-03", "KIT-SPN-FUSION", 1, "Emergency"],
		["0037", "Rejected", "H-AST-CLT", "CLT", "EX-05", "KIT-TRA-RADIUS", 4, "Routine"],
		["0038", "Approved", "H-RAJ-KCH", "KCH", "EX-01", "KIT-HIP-PRIM", 2, "Urgent"],
		["0039", "Picking", "H-BAB-CLT", "CLT", "EX-05", "KIT-KNEE-PRIM", 1, "Routine"],
		["0040", "Picked", "H-JUB-TSR", "TSR", "EX-04", "KIT-TRA-FEMUR", 1, "Urgent"],
		["0041", "Dispatched", "H-SUT-TVM", "TVM", "EX-03", "KIT-TRA-RADIUS", 0, "Routine"],
		["0042", "Delivered", "H-AMR-KCH", "KCH", "EX-01", "KIT-KNEE-PRIM", 0, "Routine"],
		["0043", "Usage Reported", "H-LOU-KCH", "KCH", "EX-06", "KIT-HIP-PRIM", -1, "Routine"],
		["0044", "Return Pending", "H-DAY-TSR", "TSR", "EX-04", "KIT-SPN-FUSION", -2, "Routine"],
		["0045", "Partially Returned", "H-KIM-TVM", "TVM", "EX-03", "KIT-KNEE-PRIM", -3, "Urgent"],
		["0046", "Fully Returned", "H-AST-KCH", "KCH", "EX-02", "KIT-TRA-FEMUR", -4, "Routine"],
		["0047", "Reconciled", "H-LAK-KCH", "KCH", "EX-01", "KIT-HIP-PRIM", -6, "Routine"],
		["0048", "Closed", "H-MOS-KCH", "KCH", "EX-06", "KIT-TRA-RADIUS", -9, "Routine"],
		["0049", "Cancelled", "H-SUN-KCH", "KCH", "EX-02", "KIT-KNEE-PRIM", -1, "Routine"],
		// Two more on the demo executive so My Requests has something to open
		// and something still to pick.
		["0050", "Approved", "H-LIS-KCH", "KCH", "EX-01", "KIT-TRA-RADIUS", 1, "Routine"],
		["0051", "Picking", "H-LAK-KCH", "KCH", "EX-01", "KIT-SPN-FUSION", 3, "Urgent"],
	];

	function daysOut(iso) {
		return Math.round((new Date(iso + "T00:00:00Z") - new Date(TODAY + "T00:00:00Z")) / 86400000);
	}

	/* A challan is packed from the branch that raised it. Without the branch
	   filter one delivery could carry stock from four warehouses, and the
	   put-away would send a picker walking between cities. */
	function pickSerials(itemId, n, taken, branch) {
		var out = [];
		var pool = serials.filter(function (s) { return !branch || s.branch === branch; });
		if (pool.length < n) { pool = serials; }   // fall back rather than short-ship
		for (var i = 0; i < pool.length && out.length < n; i++) {
			var s = pool[i];
			// Short-dated stock is never allocated to a case here. Two reasons:
			// a picker would not pick it, and the 30-day rule needs live
			// available targets to fire on — if the seed consumed them all,
			// the rule could never be demonstrated.
			if (daysOut(s.expiry) < 45) { continue; }
			if (s.item === itemId && !taken[s.id] && s.status === "available") {
				taken[s.id] = 1; out.push(s);
			}
		}
		return out;
	}

	var taken = {};
	var requests = [];
	var challans = [];
	var usage = [];
	var returns = [];
	var picks = [];

	REQ_SPEC.forEach(function (spec, n) {
		var id = "REQ-2026-" + spec[0];
		var hosp = hospitals.filter(function (h) { return h.id === spec[2]; })[0];
		var kit = kits.filter(function (k) { return k.id === spec[5]; })[0];
		var surgeryDate = addDays(TODAY, spec[6]);
		var state = spec[1];

		var lines = kit.lines.map(function (kl, i) {
			var item = items.filter(function (it) { return it.id === kl.item; })[0];
			var pool = serials.filter(function (s) { return s.item === item.id; });
			return {
				idx: i + 1, item: item.id, category: item.group, size: item.size,
				side: item.side, thickness: item.thickness, qty: kl.qty, uom: item.uom,
				available_here: pool.filter(function (s) { return s.branch === spec[3] && s.status === "available"; }).length,
				available_elsewhere: pool.filter(function (s) { return s.branch !== spec[3] && s.status === "available"; }).length,
				ownership_pref: item.ownership_default,
				substitution_allowed: i % 3 === 0 ? 1 : 0,
				substituted_from: null,
			};
		});

		requests.push({
			id: id, status: state, branch: spec[3], warehouse: spec[3] + "-CONSIGN",
			hospital: hosp.id, area: hosp.city, surgeon: hosp.surgeons[0],
			patient: { name: "Patient " + (101 + n), age: 38 + (n % 40),
			           gender: n % 2 ? "Female" : "Male", case_no: "IP/2026/" + (5100 + n) },
			procedure: kit.specialty + " arthroplasty",
			side: n % 2 ? "Left" : "Right",
			request_type: "Kit", kit: kit.id,
			surgery_date: surgeryDate, time_slot: ["08:00–10:00", "10:00–12:00", "14:00–16:00"][n % 3],
			required_by: addDays(surgeryDate, -1),
			priority: spec[7], delivery_mode: n % 3 === 0 ? "Executive" : "Vehicle",
			vehicle: executives.filter(function (e) { return e.id === spec[4]; })[0].vehicle,
			executive: spec[4], staff: executives.filter(function (e) { return e.id === spec[4]; })[0].name,
			remarks: state === "Rejected" ? "Duplicate of REQ-2026-0031." : "",
			date: addDays(surgeryDate, -3),
			approval: { by: state === "Rejected" ? "Back Office" : (STATES.indexOf(state) > 1 ? "Back Office" : null),
			            on: STATES.indexOf(state) > 1 ? addDays(surgeryDate, -2) : null,
			            note: "", rejected_reason: state === "Rejected" ? "Duplicate request" : null },
			lines: lines,
			linked: { pick: null, challan: null },
		});
	});

	/* Requests that have got as far as a challan carry one, with real serials
	   attached, so the DC / usage / return screens have a spine to read. */
	var DC_FROM = ["Dispatched", "Delivered", "Usage Reported", "Return Pending",
		"Partially Returned", "Fully Returned", "Reconciled", "Closed", "Cancelled"];

	requests.forEach(function (req, n) {
		if (DC_FROM.indexOf(req.status) === -1) { return; }
		var dcId = "DC-2026-" + String(380 + n);
		var hosp = hospitals.filter(function (h) { return h.id === req.hospital; })[0];

		var dcLines = [];
		req.lines.forEach(function (rl) {
			var item = items.filter(function (it) { return it.id === rl.item; })[0];
			if (!item.serialized) {
				dcLines.push({ idx: dcLines.length + 1, item: item.id, serial: null, lot: null,
					expiry: null, ownership: item.ownership_default, delivered: rl.qty,
					used: 0, returned: 0, damaged: 0, written_off: 0, missing: 0,
					rate: item.rate, scanned: 0, line_status: "Delivered" });
				return;
			}
			pickSerials(item.id, rl.qty, taken, req.branch).forEach(function (s) {
				s.status = "at_hospital"; s.hospital = hosp.id; s.dc = dcId;
				dcLines.push({ idx: dcLines.length + 1, item: item.id, serial: s.id,
					lot: s.lot, expiry: s.expiry, ownership: s.ownership, delivered: 1,
					used: 0, returned: 0, damaged: 0, written_off: 0, missing: 0,
					rate: item.rate, scanned: 0, line_status: "Delivered" });
			});
		});

		// Settle the dispositions according to how far the case has travelled.
		var idx = STATES.indexOf(req.status);
		if (idx >= STATES.indexOf("Usage Reported") && req.status !== "Cancelled") {
			dcLines.forEach(function (l, i) {
				if (i === 0) { l.used = l.delivered; }
				else if (i === 1 && req.id === "REQ-2026-0045") { l.missing = l.delivered; }
				else if (i === 2 && req.id === "REQ-2026-0044") { l.damaged = l.delivered; }
				else { l.returned = l.delivered; }
			});
		}

		challans.push({
			id: dcId, status: req.status, request: req.id, pick: null,
			branch: req.branch, hospital: hosp.id, address: hosp.address,
			surgeon: req.surgeon, patient: req.patient, surgery_date: req.surgery_date,
			side: req.side, kit: req.kit,
			source_warehouse: req.branch + "-CONSIGN", target_warehouse: "HOSP-" + hosp.id,
			movement_type: "Non-Sale Issue",
			date: addDays(req.surgery_date, -1), out_time: "07:20",
			staff: req.staff, vehicle: req.vehicle, executive: req.executive,
			expected_return: addDays(req.surgery_date, 3),
			eway_bill: "3312" + String(40000 + n),
			receiver: idx >= STATES.indexOf("Delivered")
				? { name: hosp.contact.name, designation: "Store Manager", phone: hosp.contact.phone }
				: { name: null, designation: null, phone: null },
			proof: { signature: null, photos: [], geo: null, discrepancy: 0, discrepancy_note: "" },
			lines: dcLines,
			usage_ref: null, return_refs: [], closed_on: req.status === "Closed" ? addDays(TODAY, -8) : null,
		});
		req.linked.challan = dcId;
	});

	/* Usage entries for everything at or past Usage Reported (never for the
	   cancelled case — that is the "Surgery Cancelled" path the rule allows). */
	challans.forEach(function (dc, n) {
		if (STATES.indexOf(dc.status) < STATES.indexOf("Usage Reported")) { return; }
		if (dc.status === "Cancelled") { return; }
		var uid = "USE-2026-" + String(170 + n);
		usage.push({
			id: uid, status: dc.status, challan: dc.id, hospital: dc.hospital,
			surgery_datetime: dc.surgery_date + " 09:15", patient: dc.patient,
			surgeon: dc.surgeon, procedure: "Arthroplasty", side: dc.side,
			tally_receipt_no: "TLY/26/" + (7700 + n), tally_receipt_date: dc.surgery_date,
			hospital_invoice_no: "HIN/" + (3300 + n), hospital_invoice_date: dc.surgery_date,
			sticker_photos: ["sticker-1.jpg"], captured_by: dc.executive,
			captured_at: dc.surgery_date + " 12:40",
			wos_status: n % 2 ? "Submitted" : "Pending",
			principal_invoice: n % 2 ? "STR/26/" + (4400 + n) : null,
			replacement_status: n % 2 ? "Awaited" : "Not applicable",
			lines: dc.lines.map(function (l) {
				return { serial: l.serial, item: l.item, lot: l.lot, expiry: l.expiry,
					ownership: l.ownership, delivered: l.delivered, used: l.used,
					disposition: l.used ? "Used" : l.missing ? "Missing"
						: l.damaged ? "Damaged at Site" : "To Return",
					damage_reason: l.damaged ? "Dropped in OT" : null,
					rate: l.rate, amount: l.used * l.rate, foc: 0, foc_reason: null };
			}),
		});
		dc.usage_ref = uid;
	});

	/* Return receipts for the cases that have started coming back. */
	challans.forEach(function (dc, n) {
		if (["Partially Returned", "Fully Returned", "Reconciled", "Closed"].indexOf(dc.status) === -1) { return; }
		var rid = "RET-2026-" + String(150 + n);
		var delivered = 0, used = 0, returned = 0, damaged = 0, written = 0, missing = 0;
		dc.lines.forEach(function (l) {
			delivered += l.delivered; used += l.used; returned += l.returned;
			damaged += l.damaged; written += l.written_off; missing += l.missing;
		});
		returns.push({
			id: rid, status: dc.status, challan: dc.id, usage: dc.usage_ref,
			hospital: dc.hospital, branch: dc.branch,
			received_on: addDays(dc.surgery_date, 2) + " 16:30",
			received_by: "Warehouse", executive: dc.executive, vehicle: dc.vehicle,
			target_warehouse: dc.branch + "-CONSIGN",
			surgery_cancelled: 0,
			lines: dc.lines.filter(function (l) { return l.returned || l.damaged || l.missing; })
				.map(function (l) {
					return { serial: l.serial, item: l.item, lot: l.lot, expiry: l.expiry,
						ownership: l.ownership, expected: l.delivered,
						returned: l.returned, condition: l.damaged ? "Damaged"
							: l.missing ? "Not returned" : "Sealed",
						destination_rack: l.damaged ? dc.branch + "-D-01" : dc.branch + "-C-01",
						variance: l.missing, variance_reason: l.missing ? "Not traceable at hospital store" : null };
				}),
			recon: { delivered: delivered, used: used, returned: returned, damaged: damaged,
				written_off: written, missing: missing,
				balance: delivered - (used + returned + damaged + written + missing) },
		});
		dc.return_refs.push(rid);
	});

	var reasons = {
		short_pick: ["Not in rack", "Damaged packaging", "Expiry too near", "Reserved for another case"],
		substitution: ["Size unavailable", "Surgeon preference", "Principal advisory"],
		fefo_override: ["Nearer lot reserved", "Hospital rejected lot", "Physical damage to nearer lot"],
		discrepancy: ["Short delivery", "Seal broken", "Wrong item", "Late arrival"],
		variance: ["Not traceable at hospital store", "Retained by hospital", "Lost in transit", "Consumed, not reported"],
		damage: ["Dropped in OT", "Seal broken in transit", "Packaging torn", "Expired before use"],
		cancel: ["Surgery cancelled", "Patient not fit", "Duplicate request", "Hospital deferred"],
	};

	var users = [
		{ id: "U-EX", name: "Vishnu Prasad", role: "Field Executive", branch: "KCH", exec: "EX-01" },
		{ id: "U-WH", name: "Store Keeper", role: "Warehouse", branch: "KCH", exec: null },
		{ id: "U-BO", name: "Back Office", role: "Back Office", branch: "KCH", exec: null },
	];

	window.LNST_MOCK = {
		meta: {
			seed_version: 6,
			today: TODAY,
			company: "Lakshmi NeuroSpine Technologies Pvt Ltd",
			principal: "Stryker",
			hospital_count: 317,
			states: STATES,
		},
		branches: branches,
		warehouses: warehouses,
		racks: racks,
		items: items,
		lots: lots,
		serials: serials,
		kits: kits,
		hospitals: hospitals,
		executives: executives,
		vehicles: vehicles,
		requests: requests,
		picks: picks,
		challans: challans,
		usage: usage,
		returns: returns,
		transfers: [],
		damages: [],
		wos: [],
		principal_invoices: [],
		reasons: reasons,
		users: users,
	};
})(window);
