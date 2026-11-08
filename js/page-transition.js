/**
 * Content-led page transitions.
 * Each destination keeps its own motion language instead of sharing one wipe.
 */
(function () {
	"use strict";

	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
	const transitionCopy = {
		music: ["VINYL · 01", "针落下，旋律开始"],
		game: ["SAVE · 02", "存档读取中"],
		reading: ["PAGE · 03", "翻到下一页"],
		photo: ["FRAME · 04", "装入下一格底片"],
		rail: ["NEXT STOP", "沿着轨道去下一站"],
		letter: ["POST · 05", "把这封信送出去"],
		archive: ["ARCHIVE", "把这一页收进档案"]
	};
	const duration = { music: 260, game: 240, reading: 280, photo: 260, rail: 220, letter: 260, archive: 240 };
	let locked = false;

	function ensureOverlay() {
		let overlay = document.getElementById("routeTransition");
		if (overlay) return overlay;
		overlay = document.createElement("div");
		overlay.id = "routeTransition";
		overlay.className = "route-transition";
		overlay.setAttribute("aria-hidden", "true");
		overlay.innerHTML = `
			<div class="transition-motif motif-music"><span class="transition-disc"></span><span class="transition-needle"></span><span class="transition-groove g1"></span><span class="transition-groove g2"></span></div>
			<div class="transition-motif motif-game"><span class="game-grid"></span><span class="game-scan"></span><span class="game-save-box">SAVE DATA<span class="save-blocks">■■■□□</span></span></div>
			<div class="transition-motif motif-reading"><span class="reading-underpage"></span><span class="reading-page"><i></i><i></i><i></i><b>03</b></span><span class="reading-ink"></span></div>
			<div class="transition-motif motif-photo"><span class="film-frame f1"></span><span class="film-frame f2"></span><span class="film-frame f3"></span><span class="shutter-ring"></span></div>
			<div class="transition-motif motif-rail"><span class="rail-line r1"></span><span class="rail-line r2"></span><span class="rail-station-dot"></span></div>
			<div class="transition-motif motif-letter"><span class="letter-paper"></span><span class="letter-envelope"></span><span class="letter-flap"></span><span class="letter-seal">K</span></div>
			<div class="transition-motif motif-archive"><span class="archive-sheet"></span><span class="archive-folder"></span><span class="archive-tab">VOL. 09</span></div>
			<div class="transition-caption"><span class="transition-code"></span><strong class="transition-title"></strong></div>`;
		document.body.appendChild(overlay);
		return overlay;
	}

	function saveArrival(mode, chapter) {
		try {
			sessionStorage.setItem("kean_route_transition", JSON.stringify({ mode, chapter, timestamp: Date.now() }));
		} catch (error) {}
	}

	function readArrival() {
		try {
			const raw = sessionStorage.getItem("kean_route_transition");
			sessionStorage.removeItem("kean_route_transition");
			if (!raw) return null;
			const data = JSON.parse(raw);
			return Date.now() - data.timestamp < 10000 ? data : null;
		} catch (error) {
			return null;
		}
	}

	function startTransition(href, mode = "rail", chapter = "") {
		if (locked) return;
		if (reduceMotion.matches) {
			window.location.href = href;
			return;
		}
		locked = true;
		if (window.KeanSound) window.KeanSound.playForMode(mode);
		const overlay = ensureOverlay();
		const copy = transitionCopy[mode] || transitionCopy.rail;
		overlay.querySelector(".transition-code").textContent = copy[0];
		overlay.querySelector(".transition-title").textContent = copy[1];
		overlay.className = `route-transition mode-${mode}`;
		void overlay.offsetWidth;
		overlay.classList.add("is-active");
		document.documentElement.classList.add("route-is-leaving");
		saveArrival(mode, chapter);
		window.setTimeout(() => { window.location.href = href; }, duration[mode] || 240);
	}

	function getChapter(link) {
		const href = link.getAttribute("href") || "";
		if (link.classList.contains("chip-2") || href.includes("#game")) return "game";
		if (link.classList.contains("chip-3") || href.includes("#reading")) return "reading";
		if (link.classList.contains("chip-4") || href.includes("#photo")) return "photo";
		return "music";
	}

	function inferMode(link) {
		if (link.dataset.pageTransition) return link.dataset.pageTransition;
		if (link.classList.contains("film-chip")) return getChapter(link);
		const href = link.getAttribute("href") || "";
		if (href.includes("message.html")) return "letter";
		if (href.includes("index.html") || href === "../index.html") return "archive";
		return "rail";
	}

	function shouldHandle(event, link) {
		if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
		if (!link || link.target === "_blank" || link.hasAttribute("download")) return false;
		const href = link.getAttribute("href");
		if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
		try {
			const target = new URL(href, window.location.href);
			if (target.origin !== window.location.origin) return false;
			if (target.pathname === window.location.pathname && target.hash === window.location.hash) return false;
		} catch (error) {
			return false;
		}
		return true;
	}

	function bindLinks() {
			document.addEventListener("click", event => {
			const link = event.target.closest("a.film-chip, a[data-page-transition], .capsule-menu a, .footer-links a");
			if (!shouldHandle(event, link) || reduceMotion.matches) return;
			event.preventDefault();
			const mode = inferMode(link);
			if (link.classList.contains("film-chip")) link.classList.add("is-lifting");
			startTransition(link.href, mode, link.classList.contains("film-chip") ? getChapter(link) : "");
		});
	}

	function showArrival() {
		const data = readArrival();
		if (!data || reduceMotion.matches) return;
		const arrival = document.createElement("div");
		arrival.className = `route-arrival mode-${data.mode || "rail"}`;
		arrival.setAttribute("aria-hidden", "true");
		arrival.innerHTML = '<span class="arrival-line"></span><span class="arrival-mark"></span>';
		document.body.appendChild(arrival);
		requestAnimationFrame(() => arrival.classList.add("is-revealing"));
		window.setTimeout(() => arrival.remove(), 420);

		if (document.body.querySelector(".camp-section")) {
			const chapter = data.chapter || window.location.hash.slice(1) || "music";
			const section = document.getElementById(chapter);
			if (section) {
				section.classList.add("target-entering");
				window.setTimeout(() => section.classList.remove("target-entering"), 420);
			}
		}
	}

	function reset() {
		locked = false;
		document.documentElement.classList.remove("route-is-leaving");
		const overlay = document.getElementById("routeTransition");
		if (overlay) overlay.className = "route-transition";
	}

	function init() {
		ensureOverlay();
		bindLinks();
		showArrival();
		window.addEventListener("pageshow", reset);
	}

	window.KeanTransition = { navigate: startTransition, reset };
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
