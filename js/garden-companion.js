/* JX Garden adapter for DeepSeek Balance Whale Widget v0.4.2 (5247dd6).
 * Press/rebound and snap-zone logic adapted from MeteorNOX, Copyright (c) 2026, MIT.
 * Full code license and separate artwork provenance: /licenses/whale-widget.txt.
 * DSH accounting, account access, network polling and sound modules are not loaded. */
(function () {
	"use strict";
	const spriteUrl = new URL("../img/garden-whale.webp?v=20261027-whale02", document.currentScript.src).href;
	function init() {
		if (document.getElementById("gardenCompanion")) return;
		const key = "jxgarden-companion-v1";
		const pageNames = { home: "花园首页", detail: "兴趣营地", message: "留言墙", toolbox: "电脑手记" };
		const reduced = matchMedia("(prefers-reduced-motion: reduce)");
		const fine = matchMedia("(hover: hover) and (pointer: fine)");
		const clamp = (n, min, max) => Math.min(Math.max(n, min), Math.max(min, max));
		const state = { collapsed: false, resting: false, halo: true, snap: true, sound: true, width: 136, edge: null, bottom: false, pats: 0, snacks: 0, bubbles: 0, bubbleGames: 0, pageVisits: {}, visitSessions: 0, greetingCycle: 0, lastGreeting: "", x: null, y: null, corner: 0 };
		function readState() { try {
			const saved = JSON.parse(localStorage.getItem(key) || "null");
			if (saved && typeof saved === "object") {
				["collapsed", "resting", "halo", "snap", "sound", "bottom"].forEach(k => { if (typeof saved[k] === "boolean") state[k] = saved[k]; });
				["pats", "snacks", "bubbles", "bubbleGames", "visitSessions", "greetingCycle", "corner"].forEach(k => { if (Number.isFinite(saved[k])) state[k] = clamp(Math.floor(saved[k]), 0, 9999); });
				if (saved.pageVisits && typeof saved.pageVisits === "object") Object.keys(pageNames).forEach(page => { if (Number.isFinite(saved.pageVisits[page])) state.pageVisits[page] = clamp(Math.floor(saved.pageVisits[page]), 0, 9999); });
				if (typeof saved.lastGreeting === "string") state.lastGreeting = saved.lastGreeting;
				["x", "y"].forEach(k => { if (Number.isFinite(saved[k])) state[k] = clamp(saved[k], 0, 1); });
				if (Number.isFinite(saved.width)) state.width = clamp(saved.width, 104, 168);
				state.edge = ["left", "right"].includes(saved.edge) ? saved.edge : null;
			}
		} catch (error) {} }
		readState();
		function save() { try { localStorage.setItem(key, JSON.stringify(state)); } catch (error) {} }
		const hadHistory = state.visitSessions > 0 || state.pats > 0 || state.snacks > 0 || state.bubbles > 0 || Object.values(state.pageVisits).some(count => count > 0);
		function currentPageKey() {
			const path = location.pathname.toLowerCase();
			if (path.endsWith("/html/message.html")) return "message";
			if (path.endsWith("/html/toolbox.html")) return "toolbox";
			if (path.endsWith("/html/detail.html")) return "detail";
			if (path === "/" || path.endsWith("/index.html") || path.endsWith("/html/home.html")) return "home";
			return "";
		}
		function recordPageVisit() {
			const page = currentPageKey();
			if (!page) return false;
			let firstPageVisit = true, firstWelcome = true;
			try {
				const pageSessionKey = `jxgarden-companion-page:${page}`;
				firstPageVisit = sessionStorage.getItem(pageSessionKey) !== "1";
				if (firstPageVisit) sessionStorage.setItem(pageSessionKey, "1");
				firstWelcome = sessionStorage.getItem("jxgarden-companion-welcomed-v1") !== "1";
				if (firstWelcome) sessionStorage.setItem("jxgarden-companion-welcomed-v1", "1");
			} catch (error) {}
			if (firstPageVisit) state.pageVisits[page] = Math.min(9999, (state.pageVisits[page] || 0) + 1);
			if (firstWelcome) state.visitSessions = Math.min(9999, state.visitSessions + 1);
			save();
			return firstWelcome;
		}
		const shouldWelcome = recordPageVisit();
		function favoritePageKey() {
			const pages = Object.keys(pageNames).map(page => [page, state.pageVisits[page] || 0]).sort((a, b) => b[1] - a[1]);
			return pages[0]?.[1] >= 2 ? pages[0][0] : "";
		}
		const shell = document.createElement("div");
		shell.id = "gardenCompanion";
		shell.className = "garden-companion";
		shell.innerHTML = `
			<div class="garden-pet" id="gardenPet">
				<button class="garden-pet-body" id="gardenPetBody" type="button" aria-label="摸摸大鱼，花园里的小鲸鱼" aria-describedby="gardenPetHint">
					<span class="garden-pet-facing" aria-hidden="true"><span class="garden-pet-art">
						<span class="garden-pet-placeholder">jx</span>
						<span class="garden-pet-sprite"><img src="${spriteUrl}" width="448" height="448" alt="" draggable="false" decoding="async" fetchpriority="low"></span>
						<svg class="garden-pet-affection" viewBox="0 0 28 28" focusable="false"><path d="M10 8C5 1-3 9 3 14l7 7 8-8C23 7 15 1 10 8Z"/><path d="M23 4c-3-4-7 0-4 3l4 4 3-4c3-3-1-6-3-3Z"/></svg>
						<svg class="garden-pet-snack" viewBox="0 0 32 32" focusable="false"><path d="M25 8a7 7 0 0 1-7-6A14 14 0 1 0 30 17a8 8 0 0 1-5-9Z"/><circle cx="9" cy="13" r="1.6"/><circle cx="15" cy="23" r="1.6"/><circle cx="22" cy="18" r="1.6"/></svg>
					</span></span>
					<span class="garden-pet-sleep" aria-hidden="true">z z</span>
				</button>
				<span class="garden-pet-name" aria-hidden="true"><span class="garden-pet-music"><i></i><i></i><i></i></span>大鱼</span>
				<button type="button" class="garden-pet-menu" id="gardenPetMenu" aria-label="打开大鱼的互动菜单" aria-expanded="false" aria-controls="gardenPetPanel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17C3 8 10 4 18 5c1 8-3 15-11 12ZM7 17l8-8"/></svg></button>
				<div class="garden-pet-speech" id="gardenPetSpeech" role="status" aria-live="polite" aria-atomic="true"></div>
			</div>
			<section class="garden-pet-panel" id="gardenPetPanel" aria-labelledby="gardenPetTitle" hidden>
				<div class="garden-pet-panel-head"><div><span class="garden-pet-eyebrow">A LITTLE TRAVEL BUDDY</span><h2 id="gardenPetTitle">大鱼的泡泡口袋</h2></div><button class="garden-pet-close" id="gardenPetClose" type="button" aria-label="关闭大鱼的互动菜单"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div>
				<p class="garden-pet-intro">一只住进花园的小鲸鱼。<br>轻轻揉一下，就把好心情弹回来。</p>
				<div class="garden-pet-journey" hidden><button type="button" id="gardenPetPassport">我的旅人护照</button><button type="button" id="gardenPetGuide">大鱼带你逛逛 <span aria-hidden="true">↗</span></button></div>
				<div class="garden-pet-memory"><span id="gardenPetMood">今天也很高兴见到你</span><strong id="gardenPetPocket" role="status"></strong></div>
				<div class="garden-pet-actions">
					<button type="button" id="gardenPetFeed"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7C6 2 2 8 5 13l7 8 7-9c3-5-2-10-7-5ZM12 7c-1-4 2-6 5-6"/></svg><span>喂一口</span></button>
					<button type="button" id="gardenPetPlay"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="15" r="6"/><circle cx="17.5" cy="6.5" r="3.5"/><path d="M5 14c0-2 1-3 3-3M16 5h1"/></svg><span>追泡泡</span></button>
					<button type="button" id="gardenPetMove"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 12h8M12 8v8"/></svg><span>换个角落</span></button>
				</div>
				<div class="garden-pet-size"><label for="gardenPetSize">同伴大小</label><input id="gardenPetSize" type="range" min="104" max="168" step="8" value="136"><output for="gardenPetSize" id="gardenPetSizeValue">标准</output></div>
				<div class="garden-pet-settings"><button type="button" id="gardenPetRest" aria-pressed="false">让大鱼休息</button><button type="button" id="gardenPetCollapse">收成小徽章</button><button type="button" id="gardenPetSnap" aria-pressed="true">靠边停靠 · 开</button><button type="button" id="gardenPointerToggle" aria-pressed="true">花园星屑 · 开</button><button type="button" id="gardenPetSound" aria-pressed="true">触碰音效 · 开</button></div>
				<p class="garden-pet-hint" id="gardenPetHint">按住揉揉，松手回弹。拖到左右边缘可停靠，也可以点「换个角落」。</p>
				<a class="garden-pet-credit" href="https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget" target="_blank" rel="noopener noreferrer">鲸鱼来自 MeteorNOX <span aria-hidden="true">↗</span></a>
			</section>
			<div class="garden-cursor" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<i class="garden-cursor-star" style="--i:${i}"></i>`).join("")}</div>`;
		document.body.appendChild(shell);
		const pet = shell.querySelector("#gardenPet");
		const bodyButton = shell.querySelector("#gardenPetBody");
		const menu = shell.querySelector("#gardenPetMenu");
		const panel = shell.querySelector("#gardenPetPanel");
		const speech = shell.querySelector("#gardenPetSpeech");
		const cursor = shell.querySelector(".garden-cursor");
		const cursorLinks = "a[href], button:not(:disabled), summary, [role='button'], [role='tab']";
		const cursorNative = "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [draggable='true'], :disabled, [aria-disabled='true'], .garden-pet-body, .photo-stage-viewport, #lightbox-img";
		const pointerToggle = shell.querySelector("#gardenPointerToggle");
		const soundToggle = shell.querySelector("#gardenPetSound");
		const rest = shell.querySelector("#gardenPetRest");
		const snapToggle = shell.querySelector("#gardenPetSnap");
		const sizeInput = shell.querySelector("#gardenPetSize");
		const art = shell.querySelector(".garden-pet-art");
		const sprite = shell.querySelector(".garden-pet-sprite img");
		const showSprite = () => { if (sprite.naturalWidth) pet.classList.add("has-sprite"); };
		sprite.addEventListener("load", showSprite, { once: true });
		sprite.addEventListener("error", () => pet.classList.add("sprite-unavailable"), { once: true });
		if (sprite.complete) showSprite();
		let x = 0, y = 0, drag = null, ignoreClickUntil = 0, actionTimer = 0, speechTimer = 0, gameTimer = 0, welcomeTimer = 0;
		let pointerFrame = 0, resizeFrame = 0, dragFrame = 0, actionFrame = 0, lastRipple = -Infinity, lastPat = -Infinity, turn = 0, gameStep = 0, bubble = null;
		let petAudioContext = null, lastPetSound = -Infinity;
		let pointerX = -100, pointerY = -100, pointerIdle = 0, pressVisualStartedAt = 0, pressing = false;
		// Upstream v0.4.2: bottom-anchored compression and immediate release, including rapid taps.
		const SQUISH = "scaleY(0.88) scaleX(1.05)";
		const PRESS_VISUAL_TAP_MS = 32;
		const CLICK_SQ = 9;
		function pressDown() {
			pressVisualStartedAt = performance.now();
			pressing = true;
			art.style.transform = reduced.matches ? "none" : SQUISH;
			pet.classList.add("is-pressed");
		}
		function pressUp() {
			if (!pressing) return;
			if (!reduced.matches && performance.now() - pressVisualStartedAt < PRESS_VISUAL_TAP_MS) {
				const previousTransition = art.style.transition;
				art.style.transition = "none";
				art.style.transform = SQUISH;
				void art.offsetWidth; // Upstream fix #243: commit a same-frame tap before rebounding.
				art.style.transition = previousTransition;
			}
			art.style.transform = "scaleY(1) scaleX(1)";
			pressing = false;
			pet.classList.remove("is-pressed");
		}
		// Same default zones as the upstream widget: sides 10%, bottom 15%, top disabled.
		function snapZones(cx, cy, vp) {
			if (!state.snap) return { h: null, bottom: false };
			return { h: cx < vp.w * .1 ? "left" : cx > vp.w * .9 ? "right" : null, bottom: cy > vp.h * .85 };
		}

		function size() { const w = Math.min(state.width, innerWidth < 540 ? 128 : 168); return state.collapsed ? { w: 48, h: 48 } : { w, h: w + 24 }; }
		function place(nextX, nextY, remember = false) {
			const s = size();
			pet.style.setProperty("--pet-size", `${s.w}px`);
			x = clamp(nextX, 12, innerWidth - s.w - 12);
			y = clamp(nextY, innerHeight > 300 ? 64 : 12, innerHeight - s.h - 16);
			if (remember) {
				const reserved = document.querySelectorAll("#capsuleNav, .site-audio-control-wrap, .journey-tools, #somersaultCloudBtn.is-visible, .back-to-top");
				reserved.forEach(element => {
					const r = element.getBoundingClientRect();
					if (r.width && r.height && x < r.right + 8 && x + s.w > r.left - 8 && y < r.bottom + 8 && y + s.h > r.top - 8) {
						// Keep a docked whale on its edge while making space for the site's controls.
						const above = r.top - s.h - 12, below = r.bottom + 12;
						if (state.edge && (above >= 64 || below <= innerHeight - s.h - 16)) {
							y = above >= 64 && (below > innerHeight - s.h - 16 || Math.abs(y - above) < Math.abs(y - below)) ? above : below;
						} else {
							x = clamp(r.left < innerWidth / 2 ? r.right + 12 : r.left - s.w - 12, 12, innerWidth - s.w - 12);
						}
					}
				});
				state.x = x / Math.max(1, innerWidth - s.w);
				state.y = y / Math.max(1, innerHeight - s.h);
				save();
			}
			pet.style.setProperty("--pet-x", `${x}px`);
			pet.style.setProperty("--pet-y", `${y}px`);
			if (!drag) pet.classList.toggle("is-facing-left", x + s.w / 2 < innerWidth / 2);
			speech.classList.toggle("is-below", y < 140);
			speech.classList.toggle("is-left", x > innerWidth / 2);
			positionSpeech();
			if (!panel.hidden) positionPanel();
		}
		function restorePosition() {
			const s = size();
			const px = state.snap && state.edge ? (state.edge === "left" ? 12 : innerWidth - s.w - 12) : state.x === null ? 20 : state.x * (innerWidth - s.w);
			const py = state.snap && state.bottom ? innerHeight - s.h - 16 : state.y === null ? innerHeight - s.h - 24 : state.y * (innerHeight - s.h);
			place(px, py, true);
		}
		function settle(nextX = x, nextY = y) {
			const s = size(), zone = snapZones(nextX + s.w / 2, nextY + s.w / 2, { w: innerWidth, h: innerHeight });
			state.edge = zone.h; state.bottom = zone.bottom;
			place(zone.h === "left" ? 12 : zone.h === "right" ? innerWidth - s.w - 12 : nextX, zone.bottom ? innerHeight - s.h - 16 : nextY, true);
		}
		function positionPanel() {
			panel.style.maxHeight = "";
			let r = panel.getBoundingClientRect();
			const s = size(), above = y - 22, below = innerHeight - y - s.h - 22;
			let px = x, py;
			if (above >= r.height) py = y - r.height - 10;
			else if (below >= r.height) py = y + s.h + 10;
			else if (innerWidth - x - s.w >= r.width + 22) { px = x + s.w + 10; py = y; }
			else if (x >= r.width + 22) { px = x - r.width - 10; py = y; }
			else {
				// On a narrow screen, scroll the menu in the larger gap instead of covering the pet.
				panel.style.maxHeight = `${Math.max(160, Math.max(above, below))}px`;
				r = panel.getBoundingClientRect();
				py = above >= below ? y - r.height - 10 : y + s.h + 10;
			}
			panel.style.left = `${clamp(px, 12, innerWidth - r.width - 12)}px`;
			panel.style.top = `${clamp(py, 12, innerHeight - r.height - 12)}px`;
		}
		function closePanel(returnFocus = false) {
			panel.hidden = true;
			menu.setAttribute("aria-expanded", "false");
			if (returnFocus) menu.focus({ preventScroll: true });
		}
		function speak(text, duration = 2800) {
			clearTimeout(welcomeTimer);
			welcomeTimer = 0;
			clearTimeout(speechTimer);
			speech.textContent = text;
			speech.classList.add("is-visible");
			positionSpeech();
			speechTimer = setTimeout(() => speech.classList.remove("is-visible"), duration);
		}
		function positionSpeech() {
			if (!speech.classList.contains("is-visible")) return;
			const width = speech.offsetWidth;
			speech.style.right = "auto";
			speech.style.left = `${clamp(x + size().w / 2 - width / 2, 12, innerWidth - width - 12) - x}px`;
		}
		function returnGreeting() {
			const choices = [];
			const favorite = favoritePageKey();
			if (favorite) choices.push(
				`又来逛${pageNames[favorite]}啦，我记得你常在这里停留。`,
				`我记得你喜欢${pageNames[favorite]}，今天也慢慢逛吧。`
			);
			if (state.bubbleGames > 0) choices.push(
				`我们已经一起玩过${state.bubbleGames}局泡泡啦，要不要再来一局？`,
				`泡泡游戏的记录我收好啦：${state.bubbleGames}局。今天继续吗？`
			);
			else if (state.bubbles > 0) choices.push(
				`你之前接住过${state.bubbles}颗泡泡，我还记得呢。`,
				`泡泡口袋里还收着你接住的${state.bubbles}颗泡泡。`
			);
			const here = pageNames[currentPageKey()];
			if (here) choices.push(`今天从${here}开始逛呀，我陪你慢慢看。`, `欢迎回来，先在${here}坐一会儿也好。`);
			if (!choices.length) choices.push("好久不见呀，花园里又多了一点新风景。", "你回来啦，今天想先逛哪一页？");
			let choiceIndex = state.greetingCycle % choices.length;
			if (choices[choiceIndex] === state.lastGreeting) choiceIndex = (choiceIndex + 1) % choices.length;
			const greeting = choices[choiceIndex];
			state.greetingCycle = (choiceIndex + 1) % 9999;
			state.lastGreeting = greeting;
			save();
			return greeting;
		}
		function scheduleWelcome() {
			if (!shouldWelcome || !currentPageKey() || state.resting || state.collapsed) return;
			welcomeTimer = setTimeout(() => {
				welcomeTimer = 0;
				if (document.hidden || state.resting || state.collapsed || !panel.hidden || shell.classList.contains("is-obscured")) return;
				speak(hadHistory ? returnGreeting() : "你好呀，我是大鱼。欢迎来花园坐坐。", 4400);
			}, 1100);
		}
		function reflect() {
			pet.classList.toggle("is-collapsed", state.collapsed);
			pet.classList.toggle("is-resting", state.resting);
			bodyButton.setAttribute("aria-label", state.collapsed ? "展开大鱼，花园里的小鲸鱼" : "摸摸大鱼，花园里的小鲸鱼");
			rest.textContent = state.resting ? "唤醒大鱼" : "让大鱼休息";
			rest.setAttribute("aria-pressed", String(state.resting));
			snapToggle.textContent = `靠边停靠 · ${state.snap ? "开" : "关"}`;
			snapToggle.setAttribute("aria-pressed", String(state.snap));
			sizeInput.value = state.width;
			shell.querySelector("#gardenPetSizeValue").textContent = state.width < 128 ? "小巧" : state.width > 144 ? "大一号" : "标准";
			pointerToggle.textContent = reduced.matches ? "花园星屑 · 随系统静态" : `花园星屑 · ${state.halo ? "开" : "关"}`;
			pointerToggle.disabled = reduced.matches || !fine.matches;
			pointerToggle.hidden = !fine.matches;
			pointerToggle.setAttribute("aria-pressed", String(state.halo && fine.matches && !reduced.matches));
			soundToggle.textContent = `触碰音效 · ${state.sound ? "开" : "关"}`;
			soundToggle.setAttribute("aria-pressed", String(state.sound));
			const favorite = favoritePageKey();
			shell.querySelector("#gardenPetMood").textContent = state.resting ? "在这里安静打个盹" : favorite ? `常逛：${pageNames[favorite]}` : state.pats > 2 ? "已经认得你的大鱼" : "很高兴见到你";
			shell.querySelector("#gardenPetPocket").textContent = `点心 ${state.snacks} · 泡泡 ${state.bubbles} · 玩过 ${state.bubbleGames} 局`;
			if (!pointerEnabled()) clearPointer();
		}
		function act(action, text) {
			clearTimeout(actionTimer);
			cancelAnimationFrame(actionFrame);
			pet.dataset.action = "";
			actionFrame = requestAnimationFrame(() => { actionFrame = 0; pet.dataset.action = action; });
			actionTimer = setTimeout(() => { pet.dataset.action = ""; }, action === "feed" ? 2300 : action === "pet" ? 1600 : 900);
			speak(text);
			reflect();
			save();
		}
		function stopGame(message) {
			clearTimeout(gameTimer);
			bubble?.remove();
			bubble = null;
			gameStep = 0;
			if (message) speak(message);
		}
		function playPetChime() {
			if (!state.sound || performance.now() - lastPetSound < 90) return;
			lastPetSound = performance.now();
			const AudioContextClass = window.AudioContext || window.webkitAudioContext;
			if (!AudioContextClass) return;
			try { petAudioContext ||= new AudioContextClass(); } catch (error) { return; }
			const context = petAudioContext;
			const play = () => {
				if (!state.sound || context.state !== "running") return;
				const pairs = [[659, 988], [587, 880], [698, 1046]];
				const now = context.currentTime;
				pairs[state.pats % pairs.length].forEach((frequency, index) => {
					const start = now + index * 0.055, duration = 0.19;
					const oscillator = context.createOscillator();
					const gain = context.createGain();
					oscillator.type = "sine";
					oscillator.frequency.setValueAtTime(frequency, start);
					oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.92, start + duration);
					gain.gain.setValueAtTime(0.0001, start);
					gain.gain.exponentialRampToValueAtTime(0.018, start + 0.012);
					gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
					oscillator.connect(gain);
					gain.connect(context.destination);
					oscillator.start(start);
					oscillator.stop(start + duration + 0.02);
				});
			};
			if (context.state === "suspended") context.resume().then(play).catch(() => {});
			else play();
		}
		function spawnBubble() {
			bubble?.remove();
			bubble = document.createElement("button");
			bubble.type = "button";
			bubble.className = "garden-game-bubble";
			bubble.setAttribute("aria-label", `第 ${gameStep} 颗泡泡，点击让大鱼接住`);
			bubble.innerHTML = `<span aria-hidden="true">${gameStep} / 3</span>`;
			const dx = [105, -55, 160][gameStep - 1];
			bubble.style.left = `${clamp(x + dx, 84, innerWidth - 68)}px`;
			bubble.style.top = `${clamp(y - 70 - gameStep * 22, 74, innerHeight - 80)}px`;
			bubble.addEventListener("click", () => {
				state.bubbles = Math.min(9999, state.bubbles + 1);
				act("pop", gameStep < 3 ? "接住啦！还有一颗藏在风里。" : "三颗都收到啦，送你一肚子的好心情。 ");
				if (gameStep >= 3) { stopGame(); bodyButton.focus({ preventScroll: true }); }
				else { gameStep++; spawnBubble(); bubble.focus({ preventScroll: true }); }
			});
			shell.appendChild(bubble);
			clearTimeout(gameTimer);
			gameTimer = setTimeout(() => stopGame("泡泡飘远了，下次再一起玩。"), 12000);
		}
		bodyButton.addEventListener("click", event => {
			if (performance.now() < ignoreClickUntil) return;
			if (state.collapsed) { playPetChime(); state.collapsed = false; reflect(); restorePosition(); speak("口袋里还藏着一整片夏天。"); return; }
			if (event.detail === 0) { pressDown(); pressUp(); }
			if (performance.now() - lastPat < 350) return;
			lastPat = performance.now();
			state.pats = Math.min(9999, state.pats + 1);
			playPetChime();
			const pageNote = location.pathname.includes("message") ? "墙上的每一封信，都有人认真读过。" : location.pathname.includes("toolbox") ? "又发现好用的工具了吗？记得带一件回去。" : location.pathname.includes("admin") ? "站主回来啦，我陪你整理花园。" : "慢慢翻，喜欢的风景可以多停一会儿。";
			const copy = ["你好呀，我是大鱼。按住揉揉，松手就弹回来。", "摸摸收到，今天也是软乎乎的一天。", pageNote, "不用赶路，下一站的风还在等你。"];
			const step = turn++ % (copy.length + 1);
			if (step === copy.length) { speech.classList.remove("is-visible"); save(); return; }
			act("pet", copy[step]);
		});
		menu.addEventListener("click", () => {
			if (!panel.hidden) { closePanel(); return; }
			stopGame();
			speech.classList.remove("is-visible");
			reflect();
			panel.hidden = false;
			menu.setAttribute("aria-expanded", "true");
			positionPanel();
		});
		shell.querySelector("#gardenPetClose").addEventListener("click", () => closePanel(true));
		if (window.JXGardenJourney) {
			shell.querySelector(".garden-pet-journey").hidden = false;
			shell.querySelector("#gardenPetPassport").addEventListener("click", () => { closePanel(true); window.JXGardenJourney.open("stamps"); });
			shell.querySelector("#gardenPetGuide").addEventListener("click", () => { closePanel(true); window.JXGardenJourney.guide(); });
		}
		shell.querySelector("#gardenPetFeed").addEventListener("click", () => { closePanel(); state.resting = false; state.snacks = Math.min(9999, state.snacks + 1); act("feed", "这一口有夏天的味道，肚子又圆了一点。 "); bodyButton.focus({ preventScroll: true }); });
		shell.querySelector("#gardenPetPlay").addEventListener("click", () => { closePanel(); state.resting = false; state.bubbleGames = Math.min(9999, state.bubbleGames + 1); reflect(); save(); gameStep = 1; spawnBubble(); speak("来，点点那颗小泡泡。 "); bubble.focus({ preventScroll: true }); });
		shell.querySelector("#gardenPetMove").addEventListener("click", () => {
			state.corner = (state.corner + 1) % 4;
			const s = size(), right = innerWidth - s.w - 96;
			const positions = [[20, innerHeight - s.h - 24], [right, innerHeight - s.h - 24], [right, 84], [20, 84]];
			settle(...positions[state.corner]);
			speak("换个角落，也能看见新风景。 ");
		});
		rest.addEventListener("click", () => { state.resting = !state.resting; stopGame(); reflect(); save(); speak(state.resting ? "我安静眯一会儿，点我还是会回应你。" : "睡醒啦，又能陪你逛逛了。 "); });
		shell.querySelector("#gardenPetCollapse").addEventListener("click", () => { closePanel(); stopGame(); state.collapsed = true; reflect(); restorePosition(); bodyButton.focus({ preventScroll: true }); });
		pointerToggle.addEventListener("click", () => { state.halo = !state.halo; reflect(); save(); });
		soundToggle.addEventListener("click", () => { state.sound = !state.sound; reflect(); save(); if (state.sound) playPetChime(); });
		snapToggle.addEventListener("click", () => { state.snap = !state.snap; if (!state.snap) { state.edge = null; state.bottom = false; } else settle(); reflect(); save(); });
		sizeInput.addEventListener("input", () => { state.width = Number(sizeInput.value); reflect(); restorePosition(); });
		document.addEventListener("pointerdown", event => { if (!panel.hidden && !panel.contains(event.target) && !pet.contains(event.target)) closePanel(); }, { passive: true });
		document.addEventListener("pointerdown", () => { clearTimeout(welcomeTimer); welcomeTimer = 0; }, { once: true, capture: true });
		document.addEventListener("keydown", () => { clearTimeout(welcomeTimer); welcomeTimer = 0; }, { once: true, capture: true });
		document.addEventListener("keydown", event => {
			if (event.key !== "Escape") return;
			if (drag) releaseDrag(null, true);
			pressUp();
			if (!panel.hidden) closePanel(panel.contains(document.activeElement));
			if (bubble) { stopGame("泡泡先收进口袋，等你下次来。 "); bodyButton.focus({ preventScroll: true }); }
		});
		bodyButton.addEventListener("pointerdown", event => {
			if (event.button !== 0 || event.isPrimary === false || state.collapsed || drag) return;
			drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x, y, moved: false };
			bodyButton.setPointerCapture(event.pointerId);
			pressDown();
		});
		bodyButton.addEventListener("pointermove", event => {
			if (!drag || drag.id !== event.pointerId) return;
			if (event.buttons === 0) { releaseDrag(event, true); return; }
			const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
			if (!drag.moved && dx * dx + dy * dy < CLICK_SQ) return;
			if (!drag.moved) { closePanel(); stopGame(); speech.classList.remove("is-visible"); }
			drag.moved = true;
			pet.classList.add("is-dragging");
			drag.nextX = drag.x + dx; drag.nextY = drag.y + dy;
			if (!dragFrame) dragFrame = requestAnimationFrame(() => {
				dragFrame = 0;
				if (!drag) return;
				place(drag.nextX, drag.nextY);
			});
		});
		function releaseDrag(event, cancelled = false) {
			if (!drag || (event && drag.id !== event.pointerId)) return;
			cancelAnimationFrame(dragFrame); dragFrame = 0;
			const finished = drag;
			drag = null;
			pressUp();
			pet.classList.remove("is-dragging");
			if (cancelled || !event) {
				ignoreClickUntil = performance.now() + 300;
				place(finished.x, finished.y); // A cancelled gesture never commits a new anchor.
			} else if (finished.moved) {
				ignoreClickUntil = performance.now() + 300;
				settle(finished.x + event.clientX - finished.startX, finished.y + event.clientY - finished.startY);
			}
			if (bodyButton.hasPointerCapture(finished.id)) bodyButton.releasePointerCapture(finished.id);
		}
		bodyButton.addEventListener("pointerup", releaseDrag);
		bodyButton.addEventListener("pointercancel", event => releaseDrag(event, true));
		bodyButton.addEventListener("lostpointercapture", event => releaseDrag(event, true));
		bodyButton.addEventListener("contextmenu", event => { event.preventDefault(); releaseDrag(null, true); menu.click(); });
		bodyButton.addEventListener("keydown", event => { if ([" ", "Enter"].includes(event.key) && !event.repeat && !state.collapsed) pressDown(); });
		bodyButton.addEventListener("keyup", event => { if ([" ", "Enter"].includes(event.key)) pressUp(); });
		bodyButton.addEventListener("blur", pressUp);

		function pointerEnabled() { return state.halo && fine.matches && !reduced.matches && !document.hidden && !document.documentElement.dataset.gardenReading && !document.documentElement.matches(".journey-is-open, .station-booting, .route-is-leaving") && !document.body.classList.contains("page-transitioning") && !shell.classList.contains("is-obscured"); }
		function clearPointer() {
			cursor.classList.remove("is-visible", "is-moving", "is-link", "is-down");
			document.documentElement.classList.remove("garden-pointer-active");
			cancelAnimationFrame(pointerFrame); pointerFrame = 0;
			clearTimeout(pointerIdle);
			shell.querySelectorAll(".garden-cursor-burst").forEach(burst => burst.remove());
		}
		function paintPointer() {
			pointerFrame = 0;
			if (!pointerEnabled()) { clearPointer(); return; }
			cursor.style.setProperty("--cursor-x", `${pointerX}px`);
			cursor.style.setProperty("--cursor-y", `${pointerY}px`);
		}
		document.addEventListener("pointermove", event => {
			if (event.pointerType !== "mouse" || !pointerEnabled() || event.target.closest?.(cursorNative)) { clearPointer(); return; }
			const entering = !cursor.classList.contains("is-visible");
			const moved = Math.hypot(event.clientX - pointerX, event.clientY - pointerY) > 1;
			pointerX = event.clientX; pointerY = event.clientY;
			if (entering) {
				// Place all five stars before revealing them; re-entry never streaks across the page.
				cursor.classList.add("is-placing");
				paintPointer();
				cursor.getBoundingClientRect();
				cursor.classList.remove("is-placing");
			}
			cursor.classList.add("is-visible");
			cursor.classList.toggle("is-link", !!event.target.closest?.(cursorLinks));
			document.documentElement.classList.add("garden-pointer-active");
			if (moved && !entering) cursor.classList.add("is-moving");
			clearTimeout(pointerIdle);
			pointerIdle = setTimeout(() => cursor.classList.remove("is-moving"), 160);
			if (!pointerFrame) pointerFrame = requestAnimationFrame(paintPointer);
		}, { passive: true });
		document.addEventListener("pointerdown", event => {
			if (event.pointerType !== "mouse" || event.target.closest?.(cursorNative)) { clearPointer(); return; }
			if (event.button !== 0 || !pointerEnabled() || event.target.closest?.(":disabled, [aria-disabled='true']")) return;
			cursor.classList.add("is-down");
			if (performance.now() - lastRipple < 100 || shell.querySelectorAll(".garden-cursor-burst").length >= 4) return;
			lastRipple = performance.now();
			const burst = document.createElement("span");
			const linked = !!event.target.closest?.(cursorLinks);
			burst.className = `garden-cursor-burst${linked ? " is-link" : ""}`;
			burst.setAttribute("aria-hidden", "true");
			burst.style.left = `${event.clientX}px`; burst.style.top = `${event.clientY}px`;
			burst.innerHTML = Array.from({ length: 7 }, (_, i) => {
				const angle = i * Math.PI * 2 / 7 - Math.PI / 2;
				const radius = (linked ? 35 : 26) + i % 3 * 4;
				return `<i style="--dx:${(Math.cos(angle) * radius).toFixed(1)}px;--dy:${(Math.sin(angle) * radius - 8).toFixed(1)}px;--turn:${i * 53}deg;--delay:${i % 3 * 18}ms"></i>`;
			}).join("");
			shell.appendChild(burst);
			setTimeout(() => burst.remove(), 760);
		}, { passive: true });
		document.addEventListener("pointerup", () => cursor.classList.remove("is-down"), { passive: true });
		document.addEventListener("pointercancel", clearPointer, { passive: true });
		document.documentElement.addEventListener("pointerleave", clearPointer);
		function visibility() {
			shell.classList.toggle("is-page-hidden", document.hidden);
			if (document.hidden) { releaseDrag(null, true); pressUp(); clearPointer(); stopGame(); }
		}
		document.addEventListener("visibilitychange", visibility);
		window.addEventListener("blur", () => { releaseDrag(null, true); pressUp(); clearPointer(); });
		window.addEventListener("resize", () => {
			if (resizeFrame) return;
			resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; releaseDrag(null, true); stopGame(); restorePosition(); });
		}, { passive: true });
		reduced.addEventListener("change", () => { pressUp(); reflect(); stopGame(); });
		fine.addEventListener("change", reflect);
		window.addEventListener("jxgarden:music", event => pet.classList.toggle("is-listening", !!event.detail?.playing));
		function quietCompanion() { releaseDrag(null, true); pressUp(); closePanel(); stopGame(); clearPointer(); }
		window.addEventListener("jxgarden:journey-overlay", event => { if (event.detail?.open) quietCompanion(); });
		window.addEventListener("jxgarden:reading", event => { if (event.detail?.mode !== "off") quietCompanion(); });
		const modals = document.querySelectorAll("#contact-community-modal, #lightbox-modal, #lyric-card-modal");
		function modalState() {
			const open = Array.from(modals).some(element => element.getAttribute("aria-hidden") === "false" || element.classList.contains("show") || element.classList.contains("is-open"));
			shell.classList.toggle("is-obscured", open);
			if (open) { releaseDrag(null, true); pressUp(); closePanel(); stopGame(); clearPointer(); }
		}
		const observer = new MutationObserver(modalState);
		modals.forEach(modal => observer.observe(modal, { attributes: true, attributeFilter: ["class", "aria-hidden"] }));
		window.addEventListener("pagehide", () => {
			releaseDrag(); save(); stopGame(); clearPointer(); clearTimeout(actionTimer); clearTimeout(speechTimer); clearTimeout(welcomeTimer);
			cancelAnimationFrame(pointerFrame); cancelAnimationFrame(resizeFrame); cancelAnimationFrame(actionFrame);
			pointerFrame = resizeFrame = actionFrame = 0;
			pet.dataset.action = ""; speech.classList.remove("is-visible");
		});
		window.addEventListener("pageshow", event => { if (event.persisted) { readState(); reflect(); restorePosition(); visibility(); modalState(); } });
		reflect(); restorePosition(); visibility(); modalState(); scheduleWelcome();
		pet.classList.toggle("is-listening", !!document.querySelector(".site-audio-toggle-btn.is-active"));
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
	else init();
})();
