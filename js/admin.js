(() => {
	"use strict";
	const $ = id => document.getElementById(id);
	const loginView = $("admin-login-view"), managementView = $("admin-management-view");
	const loginForm = $("admin-login-form"), passwordInput = $("admin-password");
	const status = $("admin-status"), loginError = $("admin-login-error");
	const analyticsTab = $("admin-tab-analytics"), notesTab = $("admin-tab-notes"), journeysTab = $("admin-tab-journeys");
	const analyticsPane = $("admin-analytics-pane"), notesPane = $("admin-notes-pane"), journeysPane = $("admin-journeys-pane");
	const chartHost = $("analytics-chart"), compareInput = $("analytics-compare");
	const pageUrls = { station: "../index.html", diary: "home.html", archive: "detail.html", toolbox: "toolbox.html", letters: "message.html" };
	let activeDays = 30, activeSeries = "visitors", latestReport = null;
	let requestGeneration = 0, selectedIndex = -1, chartFocus = null, resizeFrame = 0;
	let journeyDays = 30, journeyOffset = 0, journeyGeneration = 0, journeyDetailGeneration = 0;
	let selectedJourneyId = null, journeyRows = [], journeyHasMore = false;
	const pageNames = { station: "启程站台", diary: "夏日手账", archive: "兴趣档案", toolbox: "电脑手记", letters: "纸条信箱", vision: "数字视界（归档）" };
	const nf = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
	const format = value => nf.format(Number(value) || 0);
	const text = (id, value) => { $(id).textContent = value; };
	function el(tag, className, value) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (value !== undefined) node.textContent = value;
		return node;
	}
	function svg(name, attrs = {}) {
		const node = document.createElementNS("http://www.w3.org/2000/svg", name);
		for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
		return node;
	}
	function setStatus(message, error = false) {
		status.textContent = message;
		status.classList.toggle("is-error", error);
	}
	async function requestJSON(url, options = {}) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 15000);
		try {
			const response = await fetch(url, {
				credentials: "same-origin", cache: "no-store", ...options,
				signal: controller.signal,
				headers: { "Content-Type": "application/json", ...(options.headers || {}) }
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				const error = new Error(data.error || "没有读到最新记录，请稍后重试。");
				error.status = response.status;
				throw error;
			}
			return data;
		} catch (error) {
			if (error.name === "AbortError") throw new Error("连接有些慢，请稍后再试。");
			if (error instanceof TypeError) throw new Error("暂时无法连接花园，请检查网络后重试。");
			throw error;
		} finally { clearTimeout(timer); }
	}
	function showLogin(message = "") {
		document.body.classList.remove("is-checking-session");
		$("admin-session-status").hidden = true;
		requestGeneration += 1;
		journeyGeneration += 1; journeyDetailGeneration += 1;
		loginView.hidden = false;
		managementView.hidden = true;
		latestReport = null;
		chartFocus = null;
		chartHost.replaceChildren();
		$("admin-note-list").replaceChildren();
		$("journey-visitor-list").replaceChildren(); $("journey-detail").replaceChildren();
		journeyRows = []; selectedJourneyId = null;
		loginError.textContent = message;
		loginError.hidden = !message;
		if (message) passwordInput.focus();
	}
	function setPane(name, updateHash = true) {
		const panes = { analytics: [analyticsTab, analyticsPane, "来访手账", "#visitors"], journeys: [journeysTab, journeysPane, "来访足迹", "#footprints"], notes: [notesTab, notesPane, "纸条归档", "#letters"] };
		if (!panes[name]) name = "analytics";
		for (const [key, [tab, pane]] of Object.entries(panes)) {
			const selected = name === key;
			tab.classList.toggle("is-active", selected);
			tab.setAttribute("aria-selected", String(selected));
			tab.tabIndex = selected ? 0 : -1;
			pane.hidden = !selected;
		}
		text("workspace-current-label", panes[name][2]);
		if (updateHash) history.replaceState(null, "", panes[name][3]);
		if (name === "analytics") {
			if (latestReport) { drawChart(); setStatus("匿名来访档案 · 仅你可见"); }
			else loadAnalytics();
		} else if (name === "journeys") loadJourneys();
		else loadNotes();
	}
	const paneFromHash = () => location.hash === "#letters" ? "notes" : location.hash === "#footprints" ? "journeys" : "analytics";
	function showManagement() {
		document.body.classList.remove("is-checking-session");
		$("admin-session-status").hidden = true;
		loginView.hidden = true;
		managementView.hidden = false;
		loginError.hidden = true;
		setPane(paneFromHash());
	}
	function applyTheme(night) {
		document.documentElement.dataset.theme = night ? "night" : "day";
		const button = $("admin-theme-toggle");
		button.setAttribute("aria-pressed", String(night));
		button.setAttribute("aria-label", night ? "切换日间值班" : "切换夜间值班");
		button.querySelector("span").textContent = night ? "日间值班" : "夜间值班";
		document.querySelector('meta[name="theme-color"]').content = night ? "#17231e" : "#eef2e9";
	}
	try { applyTheme(localStorage.getItem("jxgarden-admin-theme") === "night"); } catch { applyTheme(false); }
	$("admin-theme-toggle").addEventListener("click", () => {
		const night = document.documentElement.dataset.theme !== "night";
		applyTheme(night);
		try { localStorage.setItem("jxgarden-admin-theme", night ? "night" : "day"); } catch {}
	});
	function renderNotes(notes) {
		const list = $("admin-note-list");
		list.replaceChildren();
		text("admin-note-count", "墙上共有 " + format(notes.length) + " 张纸条");
		if (!notes.length) { list.append(el("p", "admin-empty", "留言墙现在很安静。")); return; }
		for (const note of notes) {
			const color = ["yellow", "green", "pink", "blue"].includes(note.color) ? note.color : "yellow";
			const welcome = note.id === "welcome-note";
			const card = el("article", "admin-note admin-note--" + color + (welcome ? " admin-note--welcome" : ""));
			const head = el("div", "admin-note-head");
			head.append(el("strong", "", note.author || "未署名访客"), el("time", "", note.time || "时间未记录"),
				el("span", "admin-note-replies", format((note.replies || []).length) + " 封回信"));
			const button = el("button", "admin-note-delete", welcome ? "站主欢迎纸条" : "删除纸条");
			button.type = "button"; button.disabled = welcome;
			button.setAttribute("aria-label", welcome ? "站主欢迎纸条不能删除" : "删除 " + (note.author || "未署名访客") + " 的纸条");
			button.addEventListener("click", () => deleteNote(note, button));
			card.append(head, el("p", "admin-note-content", note.content || ""), button);
			list.append(card);
		}
	}
	async function loadNotes() {
		setStatus("正在整理墙上的来信……");
		try {
			const data = await requestJSON("/api/guestbook");
			if (managementView.hidden) return;
			renderNotes(Array.isArray(data.notes) ? data.notes : []);
			setStatus("来信已更新");
		} catch (error) { setStatus(error.message, true); }
	}
	async function deleteNote(note, button) {
		const count = (note.replies || []).length;
		if (!window.confirm("确定删除“" + (note.author || "未署名访客") + "”的纸条" + (count ? "及其 " + count + " 封回信" : "") + "吗？此操作无法在页面中撤销。")) return;
		button.disabled = true;
		try {
			await requestJSON("/api/admin/notes/" + encodeURIComponent(note.id), { method: "DELETE" });
			await loadNotes(); setStatus("纸条已从墙上移除");
		} catch (error) {
			if (error.status === 401) { showLogin("值班会话结束了，请重新登录。"); return; }
			button.disabled = false; setStatus(error.message, true);
		}
	}
	function changeLabel(current, previous, hasPrevious) {
		if (!hasPrevious || !previous) return current ? "新的一页 · 上期尚无记录" : "还没有来访记录";
		const delta = Math.round((current - previous) / previous * 1000) / 10;
		return delta === 0 ? "与上个等长时段持平" : (delta > 0 ? "↗ 比上期多 " : "↘ 比上期少 ") + format(Math.abs(delta)) + "%";
	}
	function renderAnalytics(report) {
		latestReport = report;
		const overview = report.overview, previous = report.comparison || {};
		text("analytics-range-caption", report.from.replaceAll("-", ".") + " — " + report.to.replaceAll("-", "."));
		text("analytics-period-visitors", report.hasData ? format(overview.uniqueVisitors) : "—");
		text("analytics-period-views", report.hasData ? format(overview.pageViews) : "—");
		text("analytics-return-rate", report.hasData ? format(overview.returnRate) : "—");
		text("analytics-average-depth", report.hasData ? format(overview.averageDepth) : "—");
		text("analytics-today-detail", "今日停靠 " + format(overview.todayVisitors) + " 位旅人");
		text("analytics-today-views", "今日翻阅 " + format(overview.todayViews) + " 次");
		text("analytics-new-detail", "本期首见 " + format(overview.newVisitors) + " 位旅人");
		text("analytics-return-detail", format(overview.returningVisitors) + " 位旅人在不同日子回来过");
		text("analytics-visitor-change", changeLabel(overview.uniqueVisitors, previous.uniqueVisitors, previous.hasData));
		text("analytics-view-change", changeLabel(overview.pageViews, previous.pageViews, previous.hasData));
		$("analytics-visitor-change").classList.toggle("is-increase", overview.uniqueVisitors > (previous.uniqueVisitors || 0));
		$("analytics-view-change").classList.toggle("is-increase", overview.pageViews > (previous.pageViews || 0));
		const updated = Number(report.updatedAt);
		text("analytics-updated", updated ? "最近记录于 " + new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(updated) + " · 北京时间" : "统计已准备好 · 等待第一条来访记录");
		renderPages(report);
		renderRhythm(report);
		const top = report.pages[0], band = report.timeBands.slice().sort((a, b) => b.views - a.views)[0];
		text("analytics-observation", report.hasData
			? "这一程，" + format(overview.uniqueVisitors) + " 位旅人留下了 " + format(overview.pageViews) + " 次翻阅。" + (top ? "「" + top.name + "」是最受欢迎的一站。" : "") + (band && band.views ? "大家更常在" + band.label + "路过。" : "")
			: "花园刚刚翻开新的一页。统计从现在开始，过去的访问不会被补写，留一点时间，足迹会慢慢长出来。");
		const tbody = $("analytics-table-body"); tbody.replaceChildren();
		for (const day of report.series.slice().reverse()) {
			const row = el("tr"); row.append(el("td", "", day.date), el("td", "", format(day.visitors)), el("td", "", format(day.views))); tbody.append(row);
		}
		$("analytics-export").disabled = !report.hasData;
		selectedIndex = report.series.length - 1;
		drawChart();
	}
	function renderPages(report) {
		const list = $("analytics-page-list"); list.replaceChildren();
		$("analytics-pages-empty").hidden = report.pages.length > 0;
		const maximum = Math.max(...report.pages.map(page => page.views), 1);
		for (const [index, page] of report.pages.entries()) {
			const row = el("li", "page-row"), main = el("div", "page-main");
			const archived = page.key === "vision";
			const link = archived ? el("span", "archived-page-label", page.name) : el("a", "", page.name);
			if (!archived) { link.href = pageUrls[page.key] || "home.html"; link.target = "_blank"; link.rel = "noopener"; link.append(el("span", "", "↗")); }
			else link.append(el("small", "archived-page-badge", "已下架"));
			const meter = svg("svg", { class: "page-meter", viewBox: "0 0 200 4", preserveAspectRatio: "none", "aria-hidden": "true" });
			meter.append(svg("rect", { class: "page-meter-track", width: 200, height: 4, rx: 2 }), svg("rect", { class: "page-meter-fill", width: 200 * page.views / maximum, height: 4, rx: 2 }));
			main.append(link, el("small", "", format(page.visitors) + " 位旅人 · " + format(report.overview.pageViews ? page.views / report.overview.pageViews * 100 : 0) + "% 的翻阅"), meter);
			const count = el("div", "page-count", format(page.views)); count.append(el("small", "", "次翻阅"));
			row.append(el("span", "page-rank", String(index + 1).padStart(2, "0")), main, count); list.append(row);
		}
	}
	function renderRhythm(report) {
		const bands = $("analytics-time-bands"); bands.replaceChildren();
		for (const band of report.timeBands) {
			const card = el("div", "time-band"), count = el("b", "", format(band.views));
			count.append(el("small", "", " 次")); card.append(el("strong", "", band.label), el("span", "", band.range), count); bands.append(card);
		}
		const hours = report.hours || Array(24).fill(0), maximum = Math.max(...hours, 1);
		const chart = svg("svg", { viewBox: "0 0 480 116", preserveAspectRatio: "none", "aria-hidden": "true" });
		const peakHour = hours.indexOf(Math.max(...hours));
		for (const [hour, count] of hours.entries()) {
			const height = count ? Math.max(5, count / maximum * 105) : 3;
			const bar = svg("rect", { class: "hour-bar" + (count && hour === peakHour ? " is-peak" : ""), x: hour * 20 + 3, y: 116 - height, width: 12, height, rx: 3 });
			const title = svg("title"); title.textContent = String(hour).padStart(2, "0") + ":00—" + String(hour + 1).padStart(2, "0") + ":00 · " + count + " 次翻阅"; bar.append(title); chart.append(bar);
		}
		const host = $("analytics-hour-chart"); host.replaceChildren(chart);
		const summary = report.hasData ? String(peakHour).padStart(2, "0") + ":00—" + String(peakHour + 1).padStart(2, "0") + ":00，是这段时间最常路过的时刻。" : "从晨光到夜色，总会有相遇。";
		text("analytics-rhythm-summary", summary);
		host.setAttribute("aria-label", hours.map((value, hour) => hour + " 点 " + value + " 次翻阅").join("；"));
	}
	function drawChart() {
		if (!latestReport || analyticsPane.hidden) return;
		const report = latestReport, values = report.series.map(day => day[activeSeries]);
		const previous = (report.comparison && report.comparison.series) || [];
		const previousValues = previous.map(day => day[activeSeries]);
		const showPrevious = compareInput.checked && previousValues.some(value => value > 0);
		text("analytics-period-label", "最近 " + report.rangeDays + " 天，含今天 · " + (showPrevious ? "实线本期 / 虚线上期" : "显示本期记录"));
		text("analytics-comparison-note", showPrevious ? "今天仍在记录，上期对应日为完整一天。" : "按北京时间汇总，今天的记录仍在累积。");
		const hasData = values.some(value => value > 0) || showPrevious;
		$("analytics-chart-empty").hidden = hasData; chartHost.hidden = !hasData;
		const peak = report.series.reduce((best, day) => day[activeSeries] > best[activeSeries] ? day : best, report.series[0]);
		text("analytics-peak-caption", peak[activeSeries] ? (activeSeries === "visitors" ? "单日来访高峰 · " : "单日翻阅高峰 · ") + peak.label + " / " + format(peak[activeSeries]) + (activeSeries === "visitors" ? " 位" : " 次") : "第一条足迹，正在路上");
		$("analytics-day-prev").disabled = !hasData;
		$("analytics-day-next").disabled = !hasData;
		if (!hasData) { chartFocus = null; text("analytics-chart-inspector", "没有记录的日期会保留为 0"); return; }
		const width = Math.max(280, Math.round(chartHost.getBoundingClientRect().width));
		const height = Math.max(230, Math.round(width * .28)), left = 31, right = 12, top = 23, bottom = 37;
		const plotWidth = width - left - right, plotHeight = height - top - bottom;
		const ceiling = Math.max(4, Math.ceil(Math.max(...values, ...(showPrevious ? previousValues : []), 1) / 4) * 4);
		const pointsFor = list => list.map((value, index) => ({ x: left + index / Math.max(values.length - 1, 1) * plotWidth, y: top + plotHeight * (1 - value / ceiling) }));
		const points = pointsFor(values), oldPoints = pointsFor(previousValues);
		const pathFor = list => list.map((point, index) => (index ? "L " : "M ") + point.x + " " + point.y).join(" ");
		const chart = svg("svg", { class: "analytics-svg", viewBox: "0 0 " + width + " " + height, role: "img", "aria-labelledby": "chart-title chart-description" });
		const title = svg("title", { id: "chart-title" }); title.textContent = activeSeries === "visitors" ? "每日独立旅人" : "每日页面翻阅";
		const description = svg("desc", { id: "chart-description" }); description.textContent = report.from + " 至 " + report.to + "，绿色实线为本期" + (showPrevious ? "，虚线为上期" : "") + "。下方可打开逐日记录。";
		chart.append(title, description);
		const defs = svg("defs"), gradient = svg("linearGradient", { id: "garden-chart-gradient", x1: "0", x2: "0", y1: "0", y2: "1" });
		gradient.append(svg("stop", { offset: "0%", "stop-color": "var(--chart-fill)", "stop-opacity": ".22" }), svg("stop", { offset: "100%", "stop-color": "var(--chart-fill)", "stop-opacity": ".015" })); defs.append(gradient); chart.append(defs);
		for (let i = 0; i <= 4; i++) {
			const y = top + plotHeight * (1 - i / 4);
			chart.append(svg("line", { class: "chart-grid", x1: left, x2: width - right, y1: y, y2: y }));
			const label = svg("text", { class: "chart-axis", x: left - 9, y: y + 4, "text-anchor": "end" }); label.textContent = format(ceiling * i / 4); chart.append(label);
		}
		if (showPrevious) chart.append(svg("path", { class: "chart-previous", d: pathFor(oldPoints) }));
		const path = pathFor(points);
		chart.append(svg("path", { class: "chart-fill", d: path + " L " + points.at(-1).x + " " + (height - bottom) + " L " + points[0].x + " " + (height - bottom) + " Z" }), svg("path", { class: "chart-line", d: path }));
		const today = points.at(-1);
		chart.append(svg("circle", { class: "chart-today-dot", cx: today.x, cy: today.y, r: 4 }));
		const todayLabel = svg("text", { class: "chart-today-label", x: today.x - 8, y: Math.max(top + 11, today.y - 12), "text-anchor": "end" });
		todayLabel.textContent = "今日"; chart.append(todayLabel);
		const tickCount = width < 450 ? 4 : 7;
		const ticks = new Set(Array.from({ length: tickCount }, (_, i) => Math.round(i * (points.length - 1) / (tickCount - 1))));
		for (const index of ticks) {
			const label = svg("text", { class: "chart-axis", x: points[index].x, y: height - 9, "text-anchor": "middle" }); label.textContent = report.series[index].label; chart.append(label);
		}
		const line = svg("line", { class: "chart-focus-line", y1: top, y2: height - bottom });
		const dot = svg("circle", { class: "chart-focus-dot", r: 4.5 });
		chart.append(line, dot); chartHost.replaceChildren(chart);
		const tooltip = el("div", "chart-tooltip"); tooltip.hidden = true; tooltip.setAttribute("aria-hidden", "true"); chartHost.append(tooltip);
		chartFocus = { points, line, dot, left, plotWidth, width, showPrevious, tooltip };
		selectDay(selectedIndex < 0 ? points.length - 1 : selectedIndex, false);
	}
	function selectDay(index, announce = false) {
		if (!chartFocus || !latestReport) return;
		selectedIndex = Math.max(0, Math.min(index, chartFocus.points.length - 1));
		const point = chartFocus.points[selectedIndex], day = latestReport.series[selectedIndex];
		$("analytics-day-prev").disabled = selectedIndex === 0;
		$("analytics-day-next").disabled = selectedIndex === latestReport.series.length - 1;
		chartFocus.line.setAttribute("x1", point.x); chartFocus.line.setAttribute("x2", point.x);
		chartFocus.dot.setAttribute("cx", point.x); chartFocus.dot.setAttribute("cy", point.y);
		const output = $("analytics-chart-inspector");
		output.setAttribute("aria-live", announce ? "polite" : "off");
		let caption = day.date.replaceAll("-", ".") + " · " + format(day.visitors) + " 位旅人 / " + format(day.views) + " 次翻阅";
		const tooltip = chartFocus.tooltip;
		tooltip.replaceChildren(el("strong", "tooltip-date", day.date.replaceAll("-", ".") + (selectedIndex === latestReport.series.length - 1 ? " · 今天" : "")), el("span", "tooltip-current", (activeSeries === "visitors" ? "来访旅人 " : "页面翻阅 ") + format(day[activeSeries]) + (activeSeries === "visitors" ? " 位" : " 次")));
		if (chartFocus.showPrevious) {
			const previous = latestReport.comparison.series[selectedIndex];
			const comparison = "上期 " + previous.date.slice(5).replace("-", ".") + " · " + format(previous[activeSeries]) + (activeSeries === "visitors" ? " 位" : " 次");
			caption += " · " + comparison;
			tooltip.append(el("small", "tooltip-previous", comparison));
		}
		tooltip.style.left = Math.max(8, Math.min(point.x - 90, chartFocus.width - 218)) + "px";
		tooltip.style.top = Math.max(0, point.y - 108) + "px";
		output.textContent = caption;
	}
	function inspectPointer(event) {
		if (!chartFocus) return;
		const bounds = chartHost.getBoundingClientRect();
		const x = (event.clientX - bounds.left) / bounds.width * chartFocus.width;
		selectDay(Math.round((x - chartFocus.left) / chartFocus.plotWidth * (chartFocus.points.length - 1)));
		chartFocus.tooltip.hidden = false;
	}
	chartHost.addEventListener("pointermove", inspectPointer, { passive: true });
	chartHost.addEventListener("pointerdown", inspectPointer, { passive: true });
	chartHost.addEventListener("pointerleave", () => { if (chartFocus) chartFocus.tooltip.hidden = true; });
	chartHost.addEventListener("blur", () => { if (chartFocus) chartFocus.tooltip.hidden = true; });
	chartHost.addEventListener("keydown", event => {
		if (!chartFocus) return;
		let index = selectedIndex;
		if (event.key === "ArrowRight") index += 1;
		else if (event.key === "ArrowLeft") index -= 1;
		else if (event.key === "Home") index = 0;
		else if (event.key === "End") index = latestReport.series.length - 1;
		else return;
		event.preventDefault(); selectDay(index, true);
	});
	async function loadAnalytics(days = activeDays) {
		if (typeof days !== "number") days = activeDays;
		const generation = ++requestGeneration;
		const content = $("analytics-content");
		content.setAttribute("aria-busy", "true"); content.classList.add("is-loading");
		$("analytics-error").hidden = true;
		$("analytics-refresh").disabled = true;
		$("analytics-export").disabled = true;
		document.querySelectorAll(".analytics-range-button").forEach(button => {
			button.classList.toggle("is-pending", Number(button.dataset.days) === days);
		});
		setStatus("正在读取最近 " + days + " 天的手账……");
		try {
			const report = await requestJSON("/api/admin/analytics?days=" + days);
			if (generation !== requestGeneration || managementView.hidden) return;
			if (!report.overview || !Array.isArray(report.series) || !report.series.length) throw new Error("来访记录格式不完整，请重新连接。");
			renderAnalytics(report);
			activeDays = report.rangeDays;
			document.querySelectorAll(".analytics-range-button").forEach(button => {
				const selected = Number(button.dataset.days) === activeDays;
				button.classList.toggle("is-active", selected); button.setAttribute("aria-pressed", String(selected));
			});
			if (!analyticsPane.hidden) setStatus("匿名来访档案 · 仅你可见");
		} catch (error) {
			if (generation !== requestGeneration) return;
			if (error.status === 401) { showLogin("值班会话结束了，请重新登录。"); return; }
			$("analytics-error").hidden = false;
			$("analytics-error").querySelector("p").textContent = error.message + (latestReport ? " 下方暂时保留上次读取的记录。" : "");
			setStatus("本次更新未完成", true);
		} finally {
			if (generation === requestGeneration) {
				content.setAttribute("aria-busy", "false"); content.classList.remove("is-loading");
				$("analytics-refresh").disabled = false;
				$("analytics-export").disabled = !latestReport?.hasData;
				document.querySelectorAll(".analytics-range-button").forEach(button => button.classList.remove("is-pending"));
			}
		}
	}
	const journeyTime = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
	const journeyClock = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
	function intervalLabel(milliseconds) {
		const seconds = Math.max(0, Math.floor(milliseconds / 1000));
		if (seconds < 1) return "不到 1 秒";
		if (seconds < 60) return seconds + " 秒";
		if (seconds < 3600) return Math.floor(seconds / 60) + " 分 " + seconds % 60 + " 秒";
		return Math.floor(seconds / 3600) + " 小时 " + Math.floor(seconds % 3600 / 60) + " 分";
	}
	function renderJourneyList() {
		const list = $("journey-visitor-list"); list.replaceChildren();
		for (const person of journeyRows) {
			const button = el("button", "journey-person"); button.type = "button";
			button.dataset.visitor = person.id; button.setAttribute("aria-controls", "journey-detail");
			button.setAttribute("aria-pressed", String(person.id === selectedJourneyId));
			const top = el("span", "journey-person-top"); top.append(el("strong", "", person.label), el("span", "journey-person-arrow", "↗"));
			button.append(top, el("span", "journey-person-time", journeyTime.format(person.lastAt) + " · 最后留痕"));
			button.append(el("span", "journey-person-count", format(person.views) + " 次翻页 · " + format(person.sessionCount) + " 段来访"));
			button.append(el("span", "journey-person-route", person.recentPages.map(page => pageNames[page] || "已归档页面").join(" → ")));
			button.addEventListener("click", () => loadJourneyDetail(person.id, true)); list.append(button);
		}
	}
	function renderJourneyDetail(report) {
		const detail = $("journey-detail"), person = report.visitor; detail.replaceChildren();
		const back = el("button", "quiet-button journey-back", "← 选择其他旅人"); back.type = "button";
		back.addEventListener("click", () => { const selected = $("journey-visitor-list").querySelector('[aria-pressed="true"]'); selected?.focus(); selected?.scrollIntoView({ block: "center" }); });
		detail.append(back);
		const heading = el("header", "journey-detail-heading"); heading.append(el("span", "eyebrow", "AN ANONYMOUS TRAVELER"), el("h2", "", person.label));
		heading.append(el("p", "", "本时段最早留痕 " + journeyTime.format(person.firstAt) + " · 最近 " + journeyTime.format(person.lastAt)));
		detail.append(heading);
		const metrics = el("div", "journey-person-metrics");
		for (const [value, label] of [[person.views, "次页面打开"], [person.uniquePages, "个不同页面"], [person.sessionCount, "段来访路线"]]) {
			const item = el("div"); item.append(el("strong", "", format(value)), el("span", "", label)); metrics.append(item);
		}
		detail.append(metrics, el("p", "journey-timeline-hint", "来访按最近一次在前排列；每段路线从上往下，按页面打开顺序阅读。"));
		if (report.timelineTruncated) detail.append(el("p", "journey-truncated", "本时段记录较多，时间线展示最近 " + report.displayedEvents + " 次打开；上方摘要按完整保留记录计算。最早一段路线可能不完整。"));
		for (const [index, session] of report.sessions.entries()) {
			const section = el("section", "journey-session");
			const head = el("div", "journey-session-heading"); head.append(el("h3", "", (index === 0 ? "最近一次来访" : "更早一次来访") + " · " + journeyTime.format(session.startedAt)));
			head.append(el("p", "", session.events.length === 1 ? "只记录到一次页面打开，后续停留未知。" : session.events.length + " 次页面打开 · 首尾记录相隔 " + intervalLabel(session.lastAt - session.startedAt)));
			section.append(head); const steps = el("ol", "journey-steps");
			for (const [stepIndex, event] of session.events.entries()) {
				const step = el("li", "journey-step");
				const time = el("time", "journey-step-time", journeyClock.format(event.at)); time.dateTime = new Date(event.at).toISOString();
				const body = el("div", "journey-step-body");
				body.append(el("span", "journey-step-number", String(stepIndex + 1).padStart(2, "0")));
				const copy = el("div", "journey-step-copy");
				const title = el(pageUrls[event.page] ? "a" : "strong", "journey-page-name", event.name);
				if (pageUrls[event.page]) { title.href = pageUrls[event.page]; title.target = "_blank"; title.rel = "noopener"; title.setAttribute("aria-label", "在新标签页打开" + event.name); }
				copy.append(title, el("p", "", stepIndex === 0 ? "这段来访的第一条记录" : "距上一条记录 " + intervalLabel(event.at - session.events[stepIndex - 1].at)));
				if (stepIndex === session.events.length - 1) copy.append(el("span", "journey-last-mark", "最后一条留痕 · 后续停留未知"));
				body.append(copy); step.append(time, body); steps.append(step);
			}
			section.append(steps); detail.append(section);
		}
	}
	async function loadJourneyDetail(id, moveOnMobile = false) {
		const generation = ++journeyDetailGeneration, days = journeyDays;
		selectedJourneyId = id;
		$("journey-visitor-list").querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.visitor === id)));
		const detail = $("journey-detail"); detail.setAttribute("aria-busy", "true"); detail.replaceChildren(el("p", "journey-detail-loading", "正在打开这位旅人的路线……"));
		try {
			const report = await requestJSON("/api/admin/journeys?days=" + days + "&visitor=" + encodeURIComponent(id));
			if (generation !== journeyDetailGeneration || managementView.hidden) return;
			renderJourneyDetail(report);
			if (moveOnMobile && window.matchMedia("(max-width: 900px)").matches) { detail.focus({ preventScroll: true }); detail.scrollIntoView({ block: "start" }); }
		} catch (error) {
			if (generation !== journeyDetailGeneration) return;
			if (error.status === 401) { showLogin("值班会话结束了，请重新登录。"); return; }
			detail.replaceChildren(el("p", "empty-note", error.message));
			const retry = el("button", "quiet-button", "重新打开路线"); retry.type = "button"; retry.addEventListener("click", () => loadJourneyDetail(id)); detail.append(retry);
		} finally { if (generation === journeyDetailGeneration) detail.setAttribute("aria-busy", "false"); }
	}
	async function loadJourneys(days = journeyDays, offset = journeyOffset) {
		const generation = ++journeyGeneration;
		const content = $("journey-content"); content.setAttribute("aria-busy", "true");
		$("journey-error").hidden = true; $("journey-refresh").disabled = true;
		if (!journeysPane.hidden) setStatus("正在把沿途的足迹连起来……");
		try {
			const report = await requestJSON("/api/admin/journeys?days=" + days + "&offset=" + offset);
			if (generation !== journeyGeneration || managementView.hidden) return;
			journeyDays = report.rangeDays; journeyOffset = report.offset; journeyRows = report.visitors; journeyHasMore = report.hasMore;
			text("journey-total-visitors", format(report.totalVisitors)); text("journey-total-sessions", format(report.totalSessions)); text("journey-total-views", format(report.totalViews));
			text("journey-recording-note", report.recordingStartedAt ? "路线自 " + journeyTime.format(report.recordingStartedAt) + " 开始记录 · 以下是最近 " + journeyDays + " 天的足迹，按最后翻阅时间排列。" : "路线功能已就绪，等待下一次游客访问。历史汇总仍在来访手账里保留。");
			document.querySelectorAll(".journey-range-button").forEach(button => { const selected = Number(button.dataset.days) === journeyDays; button.classList.toggle("is-active", selected); button.setAttribute("aria-pressed", String(selected)); });
			$("journey-empty").hidden = report.totalVisitors !== 0; $("journey-browser").hidden = report.totalVisitors === 0;
			$("journey-prev").disabled = journeyOffset === 0; $("journey-next").disabled = !journeyHasMore;
			text("journey-page-label", journeyRows.length ? (journeyOffset + 1) + "—" + (journeyOffset + journeyRows.length) + " / " + report.totalVisitors : "0 / " + report.totalVisitors);
			if (!journeyRows.some(person => person.id === selectedJourneyId)) selectedJourneyId = journeyRows[0]?.id || null;
			renderJourneyList();
			if (selectedJourneyId) loadJourneyDetail(selectedJourneyId);
			else $("journey-detail").replaceChildren();
			if (!journeysPane.hidden) setStatus("匿名浏览路线 · 仅站主可见");
		} catch (error) {
			if (generation !== journeyGeneration) return;
			if (error.status === 401) { showLogin("值班会话结束了，请重新登录。"); return; }
			$("journey-error").hidden = false; $("journey-error").querySelector("p").textContent = error.message + (journeyRows.length ? " 下方保留上次读取的记录。" : "");
			if (!journeysPane.hidden) setStatus("足迹暂未更新", true);
		} finally { if (generation === journeyGeneration) { content.setAttribute("aria-busy", "false"); $("journey-refresh").disabled = false; } }
	}
	$("journey-refresh").addEventListener("click", () => loadJourneys(journeyDays, 0));
	$("journey-retry").addEventListener("click", () => loadJourneys());
	$("journey-prev").addEventListener("click", () => loadJourneys(journeyDays, Math.max(0, journeyOffset - 20)));
	$("journey-next").addEventListener("click", () => loadJourneys(journeyDays, journeyOffset + 20));
	document.querySelectorAll(".journey-range-button").forEach(button => button.addEventListener("click", () => loadJourneys(Number(button.dataset.days), 0)));
	loginForm.addEventListener("submit", async event => {
		event.preventDefault();
		const button = loginForm.querySelector("button[type=submit]"); button.disabled = true;
		loginError.hidden = true; passwordInput.removeAttribute("aria-invalid");
		try {
			await requestJSON("/api/admin/login", { method: "POST", body: JSON.stringify({ password: passwordInput.value }) });
			passwordInput.value = ""; showManagement();
		} catch (error) {
			loginError.textContent = error.message; loginError.hidden = false;
			passwordInput.setAttribute("aria-invalid", "true"); passwordInput.focus();
		} finally { button.disabled = false; }
	});
	const workspaceTabs = [[analyticsTab, "analytics"], [journeysTab, "journeys"], [notesTab, "notes"]];
	for (const [index, [tab, name]] of workspaceTabs.entries()) {
		tab.addEventListener("click", () => setPane(name));
		tab.addEventListener("keydown", event => {
			let target;
			if (["ArrowRight", "ArrowDown"].includes(event.key)) target = workspaceTabs[(index + 1) % workspaceTabs.length][0];
			else if (["ArrowLeft", "ArrowUp"].includes(event.key)) target = workspaceTabs[(index + workspaceTabs.length - 1) % workspaceTabs.length][0];
			else if (event.key === "Home") target = analyticsTab;
			else if (event.key === "End") target = notesTab;
			if (target) { event.preventDefault(); target.click(); target.focus(); }
		});
	}
	window.addEventListener("hashchange", () => { if (!managementView.hidden) setPane(paneFromHash(), false); });
	$("admin-refresh").addEventListener("click", loadNotes);
	$("analytics-refresh").addEventListener("click", loadAnalytics);
	$("analytics-retry").addEventListener("click", loadAnalytics);
	document.querySelectorAll(".analytics-range-button").forEach(button => button.addEventListener("click", () => {
		loadAnalytics(Number(button.dataset.days));
	}));
	$("analytics-day-prev").addEventListener("click", () => selectDay(selectedIndex - 1, true));
	$("analytics-day-next").addEventListener("click", () => selectDay(selectedIndex + 1, true));
	document.querySelectorAll(".series-switch button").forEach(button => button.addEventListener("click", () => {
		activeSeries = button.dataset.series;
		document.querySelectorAll(".series-switch button").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
		drawChart();
	}));
	compareInput.addEventListener("change", drawChart);
	window.addEventListener("resize", () => {
		if (resizeFrame) return;
		resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; drawChart(); });
	}, { passive: true });
	$("analytics-export").addEventListener("click", () => {
		if (!latestReport) return;
		const csv = "\uFEFF日期,独立旅人UV,页面翻阅PV\r\n" + latestReport.series.map(day => [day.date, day.visitors, day.views].join(",")).join("\r\n");
		const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
		const link = el("a"); link.href = url; link.download = "JX-Garden-" + latestReport.from + "_" + latestReport.to + ".csv";
		document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
	});
	$("admin-logout").addEventListener("click", async () => {
		try { await requestJSON("/api/admin/logout", { method: "POST" }); showLogin("本次值班结束，欢迎下次回来。"); }
		catch (error) { setStatus(error.message, true); }
	});
	(async () => {
		if (location.protocol === "file:") { showLogin("当前打开的是本地文件，无法连接站主服务。请通过本地服务器或你的站点地址访问管理页。"); return; }
		try { await requestJSON("/api/admin/session"); showManagement(); }
		catch (error) { showLogin(error.status === 401 ? "" : error.message); }
	})();
})();
