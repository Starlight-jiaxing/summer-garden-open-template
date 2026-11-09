/* JX Garden: browser-local passport, optional wayfinding and quiet reading. */
(function () {
	"use strict";
	const KEY = "jxgarden-journey-v1";
	const publicPaths = ["/", "/index.html", "/html/home.html", "/html/detail.html", "/html/toolbox.html", "/html/message.html"];
	if (!publicPaths.includes(location.pathname)) return;
	const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
	const icons = {
		book: '<path d="M4 4h6c2 0 2 2 2 2s0-2 2-2h6v16h-6c-2 0-2 1-2 1s0-1-2-1H4V4Zm8 2v15M7 8h2m6 0h2M7 12h2m6 0h2"/>',
		moon: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>',
		leaf: '<path d="M6 18C2 7 11 3 20 4c0 10-4 17-14 14Zm0 0L16 8"/>',
		music: '<path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>',
		photo: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="m8 6 1-3h6l1 3"/><circle cx="12" cy="13" r="4"/>',
		notes: '<rect x="5" y="3" width="14" height="19" rx="2"/><path d="M3 7h4m-4 5h4m-4 5h4m3-10h6m-6 5h6m-6 5h4"/>',
		letter: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
		compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/>',
		game: '<path d="M7 7h10c4 0 7 11 3 12-2 1-4-3-4-3H8s-2 4-4 3C0 18 3 7 7 7Z"/><path d="M6 10v5m-2-2.5h4m7-1h.01m3 2h.01"/>',
		close: '<path d="m6 6 12 12M18 6 6 18"/>',
		save: '<path d="M6 3h12v19l-6-4-6 4V3Z"/>',
		arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
		check: '<path d="m5 12 4 4L19 6"/>',
		back: '<path d="M5 9a8 8 0 1 1-1 7M5 3v6h6"/>',
		sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'
	};
	const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name] || icons.leaf}</svg>`;
	const stops = [
		{ id: "arrival", title: "夏日站台", icon: "leaf", path: "/index.html", note: "在蓝天与铁轨之间，留一个初次见面的印记。", rule: "在首页或个人手账停留片刻", mood: "relax" },
		{ id: "music", title: "私藏旋律", icon: "music", path: "/html/detail.html#music", note: "挑一张唱片，听听陪站主走过夏天的声音。", rule: "实际播放一段页面歌单", mood: "relax" },
		{ id: "reading", title: "纸墨书阁", icon: "book", path: "/html/detail.html#reading", note: "翻开书页，看看一段文字怎样留在生活里。", rule: "在书阁停留阅读片刻", mood: "relax" },
		{ id: "photo", title: "瞬息光影", icon: "photo", path: "/html/detail.html#photo", note: "去照片展厅走走，收下一格生活里的光。", rule: "在照片展厅停留观看片刻", mood: "relax" },
		{ id: "notes", title: "电脑手记", icon: "notes", path: "/html/toolbox.html#tool-drawer", note: "打开工具抽屉，也许有个小办法正好用得上。", rule: "在工具或经验手记停留阅读片刻", mood: "learn" },
		{ id: "letters", title: "墙上来信", icon: "letter", path: "/html/message.html#sticky-board", note: "看看路过的人留下了什么，也可以回一封信。", rule: "在公开留言墙停留阅读片刻", mood: "relax" }
	];
	const destinations = [...stops.filter(s => s.id !== "arrival"),
		{ id: "home", title: "夏日手账", icon: "leaf", path: "/html/home.html", note: "先认识一下站主，再慢慢走进他的兴趣世界。", mood: "relax" },
		{ id: "game", title: "游戏驿站", icon: "game", path: "/html/detail.html#game", note: "去平行世界里，看看站主留下的存档与故事。", mood: "relax" },
		{ id: "fieldnotes", title: "经验手记", icon: "notes", path: "/html/toolbox.html#fieldnotes", note: "从遇到问题到找到办法，翻一页真实的折腾经历。", mood: "learn" }
	];
	function defaults() { return { version: 1, stamps: {}, bookmarks: [], visits: [], reading: { mode: "off", size: 18, space: "normal" } }; }
	let state = defaults(), storageAvailable = true;
	function safePath(path) {
		if (typeof path !== "string" || path.length > 240) return null;
		try {
			const u = new URL(path, location.origin);
			if (u.origin !== location.origin || !publicPaths.includes(u.pathname) || u.search || !/^#[\w-]*$|^$/.test(u.hash)) return null;
			return u.pathname + u.hash;
		} catch (error) { return null; }
	}
	function cleanRecord(value) {
		if (!value || typeof value !== "object") return null;
		const path = safePath(value.path);
		if (!path || typeof value.title !== "string" || typeof value.id !== "string") return null;
		return { id: value.id.slice(0, 100), title: value.title.replace(/[\u0000-\u001f]/g, "").slice(0, 80), path, at: Number.isFinite(value.at) ? clamp(value.at, 0, Date.now()) : Date.now() };
	}
	function read() {
		if (!storageAvailable) return state;
		try {
			const raw = JSON.parse(localStorage.getItem(KEY) || "null"), next = defaults();
			if (!raw || raw.version !== 1) return next;
			stops.forEach(s => { if (Number.isFinite(raw.stamps?.[s.id]) && raw.stamps[s.id] > 0) next.stamps[s.id] = Math.min(raw.stamps[s.id], Date.now()); });
			["bookmarks", "visits"].forEach(key => {
				const unique = new Set();
				if (Array.isArray(raw[key])) next[key] = raw[key].slice(0, key === "bookmarks" ? 60 : 12).map(cleanRecord).filter(r => r && !unique.has(r.id) && unique.add(r.id));
			});
			if (["off", "paper", "night"].includes(raw.reading?.mode)) next.reading.mode = raw.reading.mode;
			if ([16, 18, 20].includes(raw.reading?.size)) next.reading.size = raw.reading.size;
			if (["normal", "loose"].includes(raw.reading?.space)) next.reading.space = raw.reading.space;
			return next;
		} catch (error) { storageAvailable = false; return state; }
	}
	state = read();
	function update(change) {
		state = read(); change(state);
		try { if (storageAvailable) localStorage.setItem(KEY, JSON.stringify(state)); } catch (error) { storageAvailable = false; }
	}
	function init() {
		if (document.getElementById("gardenJourney")) return;
		let view = "stamps", focusBefore = null, suggestion = null, mood = "all", activeId = "", toastTimer = 0, checkTimer = 0, lastVisitAt = 0;
		let restoreScroll = 0, navigating = false;
		const seenTimers = new Map(), zoneList = [];
		const root = document.createElement("div");
		root.id = "gardenJourney";
		root.className = "garden-journey";
		root.innerHTML = `
			<nav class="journey-tools" aria-label="旅人手册与夜读">
				<button type="button" class="journey-tool" id="journeyPassportOpen" aria-label="打开旅人护照" aria-haspopup="dialog">${icon("book")}<span class="journey-tool-label">旅人护照</span><i class="journey-tool-dot" hidden></i></button>
				<button type="button" class="journey-tool" id="journeyReadingOpen" aria-label="打开夜读设置" aria-haspopup="dialog">${icon("moon")}<span class="journey-tool-label">夜读设置</span></button>
			</nav>
			<div class="journey-toast" role="status" aria-live="polite" aria-atomic="true"></div>
			<dialog class="journey-dialog" id="journeyDialog" aria-labelledby="journeyTitle">
				<div class="journey-book">
					<aside class="journey-cover" aria-label="护照封面">
						<div class="journey-cover-brand"><span class="journey-monogram">jx</span><span>JX Garden</span></div>
						<div class="journey-cover-title"><span>属于这段小旅途</span><h2>旅人护照</h2><p>循着铁轨，慢慢走。<br>沿途的微光，都可以留下。</p></div>
						<div class="journey-cover-seal" aria-hidden="true">${icon("leaf")}<span>夏日花园</span><small>沿途留印</small></div>
						<div class="journey-cover-bottom"><p id="journeyProgress">还没有留下印记</p><div class="journey-progress-track" aria-hidden="true"><i></i></div><span>不记名 · 自由漫游</span></div>
					</aside>
					<div class="journey-page">
						<header class="journey-page-head"><div><p class="journey-page-note">大鱼陪你，翻开这一页</p><h2 id="journeyTitle">沿途的印记</h2></div><button type="button" class="journey-close" id="journeyClose" aria-label="合上旅人护照">${icon("close")}</button></header>
						<nav class="journey-tabs" aria-label="护照内容"><button type="button" data-journey-view="stamps" aria-pressed="true">沿途印记</button><button type="button" data-journey-view="saved" aria-pressed="false">夹页收藏 <span id="journeySavedCount">0</span></button><button type="button" data-journey-view="guide" aria-pressed="false">大鱼带路</button><button type="button" data-journey-view="reading" aria-pressed="false">夜读</button></nav>
						<div class="journey-page-body">
							<section data-journey-page="stamps" aria-label="沿途印记"><p class="journey-lede">不用赶着集齐。认真停过的地方，会慢慢留下印章。</p><div class="journey-stamps" id="journeyStamps"></div><p class="journey-small-note">音乐章在实际播放后留下；其他印章在页面可见、停留阅读后留下。</p></section>
							<section data-journey-page="saved" aria-label="夹页收藏" hidden><p class="journey-lede">喜欢的章节和电脑手记，夹在这里，下次接着翻。</p><ul class="journey-saved-list" id="journeySavedList"></ul><div class="journey-empty" id="journeySavedEmpty">${icon("save")}<h3>给喜欢的那一页，留个书签。</h3><p>浏览时点「夹入护照」，它就会留在这里。</p><a href="/html/toolbox.html#fieldnotes">去翻翻电脑手记 ${icon("arrow")}</a></div></section>
							<section data-journey-page="guide" aria-label="大鱼带路" hidden><p class="journey-lede">不知道下一站去哪？大鱼帮你挑一个，你来决定。</p><div class="journey-moods" role="group" aria-label="想怎么逛"><button type="button" data-journey-mood="all" aria-pressed="true">随便走走</button><button type="button" data-journey-mood="relax" aria-pressed="false">放松一下</button><button type="button" data-journey-mood="learn" aria-pressed="false">学点东西</button></div><article class="journey-route-ticket"><div class="journey-route-icon" id="journeyRouteIcon"></div><span class="journey-route-label">大鱼选的下一站</span><h3 id="journeyRouteTitle"></h3><p id="journeyRouteNote"></p><span class="journey-route-reason" id="journeyRouteReason"></span><div class="journey-route-actions"><a id="journeyGo" href="/html/home.html">去这里看看 ${icon("arrow")}</a><button type="button" id="journeyShuffle">再换一站</button></div></article><a class="journey-resume" id="journeyResume" href="/html/home.html" hidden>${icon("back")}<span><small>继续上次那一页</small><strong></strong></span>${icon("arrow")}</a></section>
							<section data-journey-page="reading" aria-label="夜读设置" hidden><p class="journey-lede">把灯调柔，把字放松。给自己留一会儿安静翻页的时间。</p><fieldset class="journey-reading-group"><legend>这一页的纸色</legend><div class="journey-reading-modes"><button type="button" data-reading-mode="off" aria-pressed="true"><span class="journey-paper-swatch is-original">Aa</span>原来的花园</button><button type="button" data-reading-mode="paper" aria-pressed="false"><span class="journey-paper-swatch is-paper">Aa</span>暖纸阅读</button><button type="button" data-reading-mode="night" aria-pressed="false"><span class="journey-paper-swatch is-night">Aa</span>夜间小站</button></div></fieldset><div class="journey-reading-row"><fieldset class="journey-reading-group"><legend>正文字号</legend><div class="journey-reading-options" role="group" aria-label="正文字号"><button type="button" data-reading-size="16">标准</button><button type="button" data-reading-size="18">舒展</button><button type="button" data-reading-size="20">大字</button></div></fieldset><fieldset class="journey-reading-group"><legend>行间留白</legend><div class="journey-reading-options" role="group" aria-label="行间留白"><button type="button" data-reading-space="normal">适中</button><button type="button" data-reading-space="loose">宽松</button></div></fieldset></div><div class="journey-reading-sample"><span>大鱼的页边小记</span><p>夜色慢慢落在站台上。<br>不必急着去下一站，<br>这一页，也可以多停一会儿。</p></div><p class="journey-small-note">阅读时，大鱼与快捷导航会暂时收起。右侧小灯可以随时退出；音乐仍由原来的耳机按钮独立控制。</p><button type="button" class="journey-reading-done" id="journeyReadingDone">合上手册，慢慢读 ${icon("arrow")}</button></section>
						</div>
						<footer class="journey-page-foot"><span id="journeyStorageNote">护照只存在当前浏览器，无需登录。</span><button type="button" id="journeyReset">重新出发</button></footer>
					</div>
				</div>
			</dialog>`;
		document.body.appendChild(root);
		const $ = selector => root.querySelector(selector);
		const dialog = $("#journeyDialog"), toast = $(".journey-toast"), tools = $(".journey-tools");
		const stampNodes = new Map(), saveButtons = new Map();
		function say(message) {
			clearTimeout(toastTimer); toast.textContent = message; toast.classList.add("is-visible");
			toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
		}
		function date(at) { return new Date(at).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }).replaceAll("/", "."); }
		stops.forEach((stop, index) => {
			const a = document.createElement("a"); a.className = "journey-stamp"; a.href = stop.path;
			a.style.setProperty("--stamp-turn", `${[-5, 4, -2, 3, -4, 2][index]}deg`);
			a.innerHTML = `<span class="journey-stamp-ring">${icon(stop.icon)}<strong></strong><small></small></span><span class="journey-stamp-caption"></span>`;
			a.querySelector("strong").textContent = stop.title;
			$("#journeyStamps").appendChild(a); stampNodes.set(stop.id, a);
		});
		function render() {
			const count = Object.keys(state.stamps).length;
			$("#journeyProgress").textContent = count ? `沿途留下了 ${count} 枚印记` : "故事从第一站开始";
			$(".journey-progress-track i").style.width = `${count / stops.length * 100}%`;
			$(".journey-tool-dot").hidden = count === 0;
			$("#journeySavedCount").textContent = state.bookmarks.length;
			$("#journeyStorageNote").textContent = storageAvailable ? "护照只存在当前浏览器，无需登录。" : "当前无法保存，护照仅在本次浏览有效。";
			stops.forEach(s => {
				const node = stampNodes.get(s.id), at = state.stamps[s.id];
				node.classList.toggle("is-earned", !!at);
				node.querySelector("small").textContent = at ? date(at) + " · 留印" : "等你路过";
				node.querySelector(".journey-stamp-caption").textContent = at ? "再去看看" : s.rule;
				node.setAttribute("aria-label", `${s.title}，${at ? date(at) + "已留印，再去看看" : "尚未留印，" + s.rule}`);
			});
			saveButtons.forEach(({ button, record }) => {
				const saved = state.bookmarks.some(b => b.id === record.id);
				button.setAttribute("aria-pressed", String(saved));
				button.setAttribute("aria-label", `${saved ? "取消收藏" : "夹入护照"}：${record.title}`);
				button.querySelector("span").textContent = saved ? "已夹入护照" : "夹入护照";
			});
			renderSaved(); renderResume(); renderReading();
		}
		function renderSaved() {
			const list = $("#journeySavedList"); list.replaceChildren();
			$("#journeySavedEmpty").hidden = state.bookmarks.length > 0;
			state.bookmarks.forEach(record => {
				const li = document.createElement("li"), a = document.createElement("a"), copy = document.createElement("span"), title = document.createElement("strong"), detail = document.createElement("small"), remove = document.createElement("button");
				a.href = record.path; title.textContent = record.title; detail.textContent = `夹于 ${date(record.at)}`;
				copy.append(title, detail); a.innerHTML = icon("save"); a.appendChild(copy);
				remove.type = "button"; remove.innerHTML = icon("close"); remove.setAttribute("aria-label", `移出护照：${record.title}`);
				remove.addEventListener("click", () => {
					const index = state.bookmarks.findIndex(r => r.id === record.id);
					update(s => { s.bookmarks = s.bookmarks.filter(r => r.id !== record.id); }); render();
					const next = list.querySelectorAll("button")[Math.min(index, state.bookmarks.length - 1)];
					(next || $("[data-journey-view='saved']")).focus();
					say("这一页已从护照移出。");
				});
				li.append(a, remove); list.appendChild(li);
			});
		}
		function renderResume() {
			const currentPath = location.pathname + location.hash;
			const record = state.visits.find(r => r.path !== currentPath && r.id !== activeId);
			const link = $("#journeyResume"); link.hidden = !record;
			if (record) { link.href = record.path; link.querySelector("strong").textContent = record.title; }
		}
		function pick() {
			let pool = destinations.filter(d => d.id !== activeId && d.id !== suggestion?.id && (mood === "all" || mood === d.mood));
			if (!pool.length) pool = destinations.filter(d => d.id !== suggestion?.id && (mood === "all" || mood === d.mood));
			const fresh = pool.filter(d => !state.stamps[d.id] && !state.visits.some(v => v.id === d.id));
			if (fresh.length) pool = fresh;
			suggestion = pool[Math.floor(Math.random() * pool.length)];
			$("#journeyRouteIcon").innerHTML = icon(suggestion.icon);
			$("#journeyRouteTitle").textContent = suggestion.title;
			$("#journeyRouteNote").textContent = suggestion.note;
			$("#journeyRouteReason").textContent = state.visits.some(v => v.id === suggestion.id) ? "去熟悉的地方，再发现一点新东西。" : "这次，去看看还没细逛的地方。";
			$("#journeyGo").href = suggestion.path;
		}
		function switchView(next) {
			view = ["stamps", "saved", "guide", "reading"].includes(next) ? next : "stamps";
			root.querySelectorAll("[data-journey-page]").forEach(s => { s.hidden = s.dataset.journeyPage !== view; });
			root.querySelectorAll("[data-journey-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.journeyView === view)));
			$("#journeyTitle").textContent = { stamps: "沿途的印记", saved: "把喜欢的页夹好", guide: "大鱼选的下一站", reading: "把灯调柔一点" }[view];
			$(".journey-page-body").scrollTop = 0;
			if (view === "guide") { pick(); renderResume(); }
		}
		function open(next = "stamps") {
			if (dialog.open) { switchView(next); return; }
			state = read(); render(); switchView(next); navigating = false;
			focusBefore = document.activeElement;
			if (focusBefore?.closest("#gardenPetPanel")) focusBefore = document.getElementById("gardenPetMenu");
			restoreScroll = scrollY;
			document.documentElement.classList.add("journey-is-open");
			dialog.showModal(); $("#journeyClose").focus({ preventScroll: true });
			window.dispatchEvent(new CustomEvent("jxgarden:journey-overlay", { detail: { open: true } }));
			cancelDwell();
		}
		function close() { if (dialog.open) dialog.close(); }
		dialog.addEventListener("close", () => {
			document.documentElement.classList.remove("journey-is-open");
			window.dispatchEvent(new CustomEvent("jxgarden:journey-overlay", { detail: { open: false } }));
			if (!navigating) {
				const target = focusBefore?.isConnected && focusBefore.getClientRects().length && getComputedStyle(focusBefore).visibility !== "hidden" ? focusBefore : $("#journeyReadingOpen");
				target.focus({ preventScroll: true });
				window.scrollTo({ top: restoreScroll, behavior: "instant" });
			}
			queueCheck();
		});
		dialog.addEventListener("click", e => {
			const link = e.target.closest("a[href]");
			if (!link || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || link.target === "_blank") return;
			navigating = true; close();
		});
		// A backdrop click closes only when both ends of the gesture were outside the book.
		let backdropDown = false;
		dialog.addEventListener("pointerdown", e => { backdropDown = e.target === dialog; });
		dialog.addEventListener("click", e => { if (backdropDown && e.target === dialog) close(); backdropDown = false; });
		$("#journeyClose").addEventListener("click", close);
		$("#journeyPassportOpen").addEventListener("click", () => open("stamps"));
		$("#journeyReadingOpen").addEventListener("click", () => {
			if (state.reading.mode !== "off") { update(s => { s.reading.mode = "off"; }); applyReading(); renderReading(); say("灯已调回原来的花园。"); }
			else open("reading");
		});
		root.querySelectorAll("[data-journey-view]").forEach(b => b.addEventListener("click", () => switchView(b.dataset.journeyView)));
		root.querySelectorAll("[data-journey-mood]").forEach(b => b.addEventListener("click", () => {
			mood = b.dataset.journeyMood;
			root.querySelectorAll("[data-journey-mood]").forEach(n => n.setAttribute("aria-pressed", String(n === b))); pick();
		}));
		$("#journeyShuffle").addEventListener("click", pick);
		$("#journeyReadingDone").addEventListener("click", close);
		$("#journeyReset").addEventListener("click", () => {
			if (!window.confirm("重新出发会清空这台设备的印章、收藏与最近翻阅记录。夜读设置会保留。确定清空吗？")) return;
			cancelDwell(); update(s => { s.stamps = {}; s.bookmarks = []; s.visits = []; }); render(); say("护照已翻到新的一页。");
		});
		function applyReading() {
			const r = state.reading, html = document.documentElement;
			if (r.mode === "off") delete html.dataset.gardenReading; else html.dataset.gardenReading = r.mode;
			html.style.setProperty("--journey-reading-size", r.size + "px");
			html.style.setProperty("--journey-reading-line", r.space === "loose" ? "2.15" : "1.85");
			const button = $("#journeyReadingOpen");
			button.classList.toggle("is-reading", r.mode !== "off");
			button.setAttribute("aria-label", r.mode === "off" ? "打开夜读设置" : "退出阅读模式，回到原来的花园");
			button.querySelector(".journey-tool-label").textContent = r.mode === "off" ? "夜读设置" : "退出夜读";
			window.dispatchEvent(new CustomEvent("jxgarden:reading", { detail: { mode: r.mode } }));
		}
		function renderReading() {
			root.querySelectorAll("[data-reading-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.readingMode === state.reading.mode)));
			root.querySelectorAll("[data-reading-size]").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.readingSize) === state.reading.size)));
			root.querySelectorAll("[data-reading-space]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.readingSpace === state.reading.space)));
		}
		root.querySelectorAll("[data-reading-mode], [data-reading-size], [data-reading-space]").forEach(b => b.addEventListener("click", () => {
			update(s => {
				if (b.dataset.readingMode) s.reading.mode = b.dataset.readingMode;
				if (b.dataset.readingSize) s.reading.size = Number(b.dataset.readingSize);
				if (b.dataset.readingSpace) s.reading.space = b.dataset.readingSpace;
			}); applyReading(); renderReading();
		}));
		function addSave(record, host, anchor) {
			if (!host || saveButtons.has(record.id)) return;
			const button = document.createElement("button"); button.type = "button"; button.className = "journey-save";
			button.innerHTML = icon("save") + "<span>夹入护照</span>";
			button.addEventListener("click", e => {
				e.stopPropagation();
				const saved = state.bookmarks.some(r => r.id === record.id);
				if (!saved && state.bookmarks.length >= 60) { say("护照已夹了 60 页，先整理几张书签再继续吧。"); return; }
				update(s => { s.bookmarks = saved ? s.bookmarks.filter(r => r.id !== record.id) : [{ ...record, at: Date.now() }, ...s.bookmarks]; });
				render(); say(saved ? "这一页已从护照移出。" : "这一页夹好了，右侧小书签里能找到。");
			});
			host.appendChild(button); saveButtons.set(record.id, { button, record });
			if (anchor) anchor.dataset.journeyReader = "";
		}
		const hash = text => { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.codePointAt(0), 16777619); return (h >>> 0).toString(36); };
		["music", "game", "reading", "photo"].forEach(id => {
			const section = document.getElementById(id), header = section?.querySelector(".section-header-block");
			const d = destinations.find(s => s.id === id);
			if (d) addSave({ id, title: d.title, path: d.path }, header, id === "game" ? null : section);
		});
		const home = document.querySelector(".narrative-lead")?.parentElement;
		if (home) addSave({ id: "home", title: "夏日手账", path: "/html/home.html" }, home, document.querySelector(".diary-container"));
		document.querySelectorAll(".tool-card, .fieldnote").forEach(element => {
			const title = element.querySelector("h3")?.textContent.trim(); if (!title) return;
			const id = "journey-note-" + hash(title); element.id ||= id;
			const host = element.matches("details") ? element.querySelector(".fieldnote-body") : element;
			addSave({ id, title, path: "/html/toolbox.html#" + element.id }, host, element);
		});
		const fieldnotes = document.querySelector(".fieldnotes-section"); if (fieldnotes && !fieldnotes.id) fieldnotes.id = "fieldnotes";
		function visible(node) {
			if (!node || !node.getClientRects().length) return false;
			const surface = node.closest(".section-hero-visual, .section-content-body") || node;
			const appearance = getComputedStyle(surface);
			if (appearance.visibility !== "visible" || Number(appearance.opacity) < .05) return false;
			const r = node.getBoundingClientRect();
			return r.top < innerHeight * .72 && r.bottom > innerHeight * .28;
		}
		function canRecord() {
			return !document.hidden && !document.documentElement.classList.contains("station-booting") && !document.querySelector("dialog[open]") && !tools.hidden;
		}
		function earn(id) {
			if (state.stamps[id]) return;
			update(s => { if (!s.stamps[id]) s.stamps[id] = Date.now(); }); render();
			const stop = stops.find(s => s.id === id);
			if (stop) say(`「${stop.title}」留下一枚印记，已收进旅人护照。`);
		}
		function cancelDwell() { seenTimers.forEach(clearTimeout); seenTimers.clear(); }
		function addZone(id, selector, stamp = id) {
			const node = typeof selector === "string" ? document.querySelector(selector) : selector;
			if (node) zoneList.push({ id, node, stamp });
		}
		if (location.pathname === "/" || location.pathname === "/index.html") addZone("arrival", document.querySelector(".glass-card") || document.body);
		if (location.pathname === "/html/home.html") addZone("home", ".diary-main", "arrival");
		addZone("music", "#music", null); addZone("game", "#game", null);
		addZone("reading", "#reading .open-notebook"); addZone("photo", "#photoStageViewport");
		addZone("notes", "#tool-drawer"); addZone("fieldnotes", ".fieldnotes-section", "notes");
		addZone("letters", "#sticky-board");
		function checkZones() {
			checkTimer = 0;
			if (!canRecord()) { cancelDwell(); return; }
			let current = null, best = 0;
			zoneList.forEach(zone => {
				const on = visible(zone.node), r = zone.node.getBoundingClientRect();
				const amount = on ? Math.min(innerHeight, r.bottom) - Math.max(0, r.top) : 0;
				if (amount > best) { current = zone; best = amount; }
				if (on && zone.stamp && !state.stamps[zone.stamp] && !seenTimers.has(zone.id)) {
					seenTimers.set(zone.id, setTimeout(() => {
						seenTimers.delete(zone.id);
						if (canRecord() && visible(zone.node)) earn(zone.stamp);
					}, 2200));
				} else if (!on && seenTimers.has(zone.id)) { clearTimeout(seenTimers.get(zone.id)); seenTimers.delete(zone.id); }
			});
			if (current && (activeId !== current.id || Date.now() - lastVisitAt > 10000)) {
				activeId = current.id; lastVisitAt = Date.now();
				const d = destinations.find(d => d.id === activeId) || stops.find(s => s.id === activeId);
				if (d) update(s => { s.visits = [{ id: d.id, title: d.title, path: d.path, at: Date.now() }, ...s.visits.filter(v => v.id !== d.id)].slice(0, 12); });
			}
		}
		function queueCheck() { if (!checkTimer) checkTimer = setTimeout(checkZones, 100); }
		const observer = new IntersectionObserver(queueCheck, { threshold: [0, .1, .25, .5, .75] });
		zoneList.forEach(z => observer.observe(z.node));
		document.addEventListener("scroll", queueCheck, { passive: true });
		document.addEventListener("animationend", e => { if (e.target.closest?.(".camp-section")) queueCheck(); });
		window.addEventListener("resize", queueCheck, { passive: true });
		window.addEventListener("hashchange", queueCheck);
		window.addEventListener("station:release", queueCheck);
		document.addEventListener("visibilitychange", () => { if (document.hidden) cancelDwell(); else queueCheck(); });
		const foreground = document.getElementById("real-audio-player");
		let heard = 0, lastAudioTime = foreground?.currentTime || 0;
		foreground?.addEventListener("seeking", () => { lastAudioTime = foreground.currentTime; });
		foreground?.addEventListener("timeupdate", () => {
			const delta = foreground.currentTime - lastAudioTime; lastAudioTime = foreground.currentTime;
			if (canRecord() && !foreground.paused && !foreground.seeking && delta > 0 && delta < 1) heard += delta;
			if (heard >= 1.2) earn("music");
		});
		window.addEventListener("storage", e => { if (e.key === KEY || e.key === null) { state = read(); applyReading(); render(); } });
		window.addEventListener("pagehide", () => { cancelDwell(); clearTimeout(checkTimer); checkTimer = 0; });
		window.addEventListener("pageshow", () => { state = read(); applyReading(); render(); queueCheck(); });
		const otherModals = document.querySelectorAll("#contact-community-modal, #lightbox-modal, #lyric-card-modal");
		function modalState() {
			tools.hidden = Array.from(otherModals).some(m => m.getAttribute("aria-hidden") === "false" || m.classList.contains("show") || m.classList.contains("is-open"));
			if (tools.hidden) cancelDwell(); else queueCheck();
		}
		const modalObserver = new MutationObserver(modalState);
		otherModals.forEach(m => modalObserver.observe(m, { attributes: true, attributeFilter: ["class", "aria-hidden"] }));
		let target = null;
		try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (error) {}
		if (target?.matches("details.fieldnote")) target.open = true;
		if (target?.id.startsWith("journey-note-")) requestAnimationFrame(() => target.scrollIntoView({ block: "start", behavior: "instant" }));
		window.JXGardenJourney = { open, guide: () => open("guide") };
		document.querySelectorAll(".diary-container, .notes-shell, .message-container, body > #header, #intro, #music, #reading, #photo").forEach(n => { n.dataset.journeyReader = ""; });
		render(); applyReading(); modalState(); queueCheck();
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
