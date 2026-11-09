/* Shared My Garden background music and foreground-player priority. */
(function () {
	"use strict";

	const MUSIC_URL = new URL("../audio/stream-20261028/station.mp3", document.currentScript.src).href;
	const PREFERENCE_KEY = "jxgarden-background-music-v1";
	const POSITION_KEY = "jxgarden-background-music-position-v1";
	const TARGET_VOLUME = 0.1;
	const FADE_IN_MS = 1300;
	const FADE_OUT_MS = 550;
	const REPEAT_GAP_MS = 25000;
	const RESUME_DELAY_MS = 650;

	const audio = document.createElement("audio");
	audio.id = "jxgarden-background-music";
	audio.preload = "none";
	audio.src = MUSIC_URL;
	audio.volume = 0;
	audio.setAttribute("aria-hidden", "true");
	audio.tabIndex = -1;
	document.body.appendChild(audio);

	const existingButton = document.getElementById("btnAudioToggle");
	let wrap = existingButton ? existingButton.closest(".audio-control-wrap") : null;
	let button = existingButton;
	if (!button) {
		wrap = document.createElement("div");
		wrap.className = "site-audio-control-wrap";
		button = document.createElement("button");
		button.type = "button";
		button.className = "site-audio-toggle-btn";
		button.id = "btnSiteMusicToggle";
		wrap.appendChild(button);
		document.body.appendChild(wrap);
	} else {
		wrap.classList.add("site-audio-control-wrap", "is-portal");
		button.classList.add("site-audio-toggle-btn");
	}
	if (document.querySelector(".somersault-cloud-btn")) wrap.classList.add("has-detail-float");


	button.removeAttribute("title");
	button.innerHTML = `<span class="site-audio-mark" aria-hidden="true">
		<svg viewBox="0 0 80 54" focusable="false">
			<g class="site-audio-staff">
				<path d="M3 32C20 34 27 18 43 14S65 11 77 15"/>
				<path d="M3 36C20 38 27 22 43 18S65 15 77 19"/>
				<path d="M3 40C20 42 27 26 43 22S65 19 77 23"/>
				<path d="M3 44C20 46 27 30 43 26S65 23 77 27"/>
				<path d="M3 48C20 50 27 34 43 30S65 27 77 31"/>
			</g>
			<g class="site-audio-note note-coral"><ellipse cx="13" cy="39" rx="3" ry="2.1" transform="rotate(-22 13 39)"/><path d="M15.6 38V27.5c3 .4 4.6 2 4.4 4"/></g>
			<g class="site-audio-note note-gold"><ellipse cx="28" cy="33" rx="2.9" ry="2" transform="rotate(-22 28 33)"/><path d="M30.5 32V21"/></g>
			<g class="site-audio-note note-coral"><ellipse cx="41" cy="27" rx="3" ry="2.1" transform="rotate(-22 41 27)"/><path d="M43.6 26V15.5c3 .6 4.2 2 4 4"/></g>
			<g class="site-audio-note note-amber"><ellipse cx="53" cy="27" rx="2.9" ry="2" transform="rotate(-22 53 27)"/><ellipse cx="64" cy="23" rx="2.9" ry="2" transform="rotate(-22 64 23)"/><path d="M55.5 26V14l11-4v12M55.5 16.5l11-4"/></g>
		</svg>
	</span>`;
	const tooltip = document.createElement("div");
	tooltip.className = "site-audio-tooltip";
	tooltip.setAttribute("role", "tooltip");
	tooltip.innerHTML = '<span class="site-audio-title">Summer Station</span><span class="site-audio-status" id="siteMusicStatus" aria-live="polite"></span><svg class="site-audio-flourish" viewBox="0 0 24 20" aria-hidden="true" focusable="false"><path d="M8 14V5l9-2v9M8 7l9-2"/><ellipse cx="6.5" cy="14.5" rx="2.2" ry="1.6"/><ellipse cx="15.5" cy="12.5" rx="2.2" ry="1.6"/></svg>';
	wrap.appendChild(tooltip);
	button.setAttribute("aria-describedby", "siteMusicStatus");
	const status = tooltip.querySelector("#siteMusicStatus");
	button.addEventListener("pointerenter", () => wrap.classList.remove("is-tooltip-dismissed"));
	button.addEventListener("focus", () => wrap.classList.remove("is-tooltip-dismissed"));
	document.addEventListener("keydown", event => { if (event.key === "Escape") wrap.classList.add("is-tooltip-dismissed"); });
	document.addEventListener("pointerdown", event => { if (!wrap.contains(event.target)) wrap.classList.add("is-tooltip-dismissed"); }, { passive: true });

	function readPreference() {
		try { return localStorage.getItem(PREFERENCE_KEY) === "true"; }
		catch (error) { return false; }
	}

	function writePreference(value) {
		try { localStorage.setItem(PREFERENCE_KEY, String(value)); }
		catch (error) {}
	}

	function readSavedPosition() {
		try {
			const value = Number(sessionStorage.getItem(POSITION_KEY));
			return Number.isFinite(value) && value > 0 ? value : 0;
		} catch (error) { return 0; }
	}

	function savePosition() {
		try {
			if (Number.isFinite(audio.currentTime) && audio.currentTime > 0) {
				sessionStorage.setItem(POSITION_KEY, String(audio.currentTime));
			}
		} catch (error) {}
	}

	let enabled = readPreference();
	let retryNeeded = false;
	let pageIsClosing = false;
	let gapPending = false;
	let gapTimer = 0;
	let resumeTimer = 0;
	let fadeFrame = 0;
	let fadeToken = 0;
	let backgroundPlayGeneration = 0;
	let savedPosition = readSavedPosition();

	if (savedPosition > 0) {
		audio.addEventListener("loadedmetadata", function restorePosition() {
			if (Number.isFinite(audio.duration) && audio.duration > 1) {
				audio.currentTime = Math.min(savedPosition, audio.duration - 1);
			}
		}, { once: true });
	}

	function hasForegroundAudio() {
		return Array.from(document.querySelectorAll("audio, video")).some((media) => (
			media !== audio && !media.paused && !media.ended && !media.muted && media.volume > 0.01 && (media.readyState >= 2 || media.currentTime > 0)
		));
	}

	function canPlayBackground() {
		return enabled && !document.hidden && !pageIsClosing && !hasForegroundAudio();
	}

	function updateButton() {
		const foreground = hasForegroundAudio();
		const playing = enabled && !audio.paused && audio.readyState >= 2 && !foreground;
		let message = "点击开启 · 轻轻听";
		if (enabled && foreground) message = "页面音乐优先";
		else if (enabled && gapTimer) message = "静默留白中";
		else if (enabled && retryNeeded) message = "点击继续播放";
		else if (playing) message = "轻声播放 · 点击暂停";
		else if (enabled && audio.readyState < 2) message = "正在准备 · 再点可取消";
		else if (enabled) message = "等待继续播放";
		status.textContent = message;
		button.classList.toggle("is-active", playing);
		button.setAttribute("aria-pressed", String(enabled));
		button.setAttribute("aria-label", `Summer Station 背景音乐：${message}`);
		button.removeAttribute("title");
		window.dispatchEvent(new CustomEvent("jxgarden:music", { detail: { enabled, playing } }));
	}

	function fadeTo(target, duration, onComplete) {
		if (fadeFrame) cancelAnimationFrame(fadeFrame);
		const token = ++fadeToken;
		const from = audio.volume;
		const start = performance.now();
		const step = (now) => {
			if (token !== fadeToken) return;
			const progress = Math.min(1, (now - start) / duration);
			const eased = progress * progress * (3 - 2 * progress);
			audio.volume = Math.max(0, Math.min(1, from + (target - from) * eased));
			if (progress < 1) fadeFrame = requestAnimationFrame(step);
			else {
				fadeFrame = 0;
				audio.volume = target;
				if (onComplete) onComplete();
			}
		};
		fadeFrame = requestAnimationFrame(step);
	}

	function clearTimers() {
		if (gapTimer) window.clearTimeout(gapTimer);
		if (resumeTimer) window.clearTimeout(resumeTimer);
		gapTimer = 0;
		resumeTimer = 0;
	}

	function startBackground() {
		if (!canPlayBackground() || gapTimer) {
			updateButton();
			return;
		}
		if (audio.ended) audio.currentTime = 0;
		retryNeeded = false;
		const generation = ++backgroundPlayGeneration;
		const playRequest = audio.play();
		if (playRequest && typeof playRequest.then === "function") {
			playRequest.then(() => {
				if (generation !== backgroundPlayGeneration) return;
				if (canPlayBackground()) fadeTo(TARGET_VOLUME, FADE_IN_MS);
				else fadeTo(0, FADE_OUT_MS, () => { if (!canPlayBackground()) audio.pause(); });
				updateButton();
			}).catch(() => {
				if (generation !== backgroundPlayGeneration) return;
				retryNeeded = true;
				updateButton();
			});
		} else {
			fadeTo(TARGET_VOLUME, FADE_IN_MS);
			updateButton();
		}
	}

	function pauseBackground() {
		++backgroundPlayGeneration;
		if (audio.paused) {
			updateButton();
			return;
		}
		fadeTo(0, FADE_OUT_MS, () => {
			if (!canPlayBackground()) audio.pause();
			updateButton();
		});
		updateButton();
	}

	function scheduleGap() {
		if (!gapPending || !canPlayBackground() || gapTimer) return;
		gapTimer = window.setTimeout(() => {
			gapTimer = 0;
			if (!canPlayBackground()) {
				gapPending = true;
				updateButton();
				return;
			}
			gapPending = false;
			startBackground();
		}, REPEAT_GAP_MS);
		updateButton();
	}

	function syncPlayback() {
		if (!enabled) {
			clearTimers();
			gapPending = false;
			pauseBackground();
			return;
		}
		if (!canPlayBackground()) {
			if (gapTimer) {
				window.clearTimeout(gapTimer);
				gapTimer = 0;
				gapPending = true;
			}
			if (audio.paused) updateButton();
			else pauseBackground();
			return;
		}
		if (resumeTimer) window.clearTimeout(resumeTimer);
		if (gapPending) scheduleGap();
		else if (audio.paused) startBackground();
		else {
			fadeTo(TARGET_VOLUME, FADE_IN_MS);
			updateButton();
		}
	}

	button.addEventListener("click", () => {
		if (enabled && retryNeeded && audio.paused && !hasForegroundAudio()) {
			startBackground();
			return;
		}
		enabled = !enabled;
		writePreference(enabled);
		if (enabled) {
			retryNeeded = false;
			gapPending = false;
			clearTimers();
			startBackground();
		} else {
			retryNeeded = false;
			syncPlayback();
		}
		updateButton();
	});

	document.addEventListener("play", (event) => {
		if (event.target === audio) return;
		if (resumeTimer) window.clearTimeout(resumeTimer);
		resumeTimer = 0;
		syncPlayback();
	}, true);
	document.addEventListener("playing", (event) => {
		if (event.target === audio) { updateButton(); return; }
		if (resumeTimer) window.clearTimeout(resumeTimer);
		resumeTimer = 0; syncPlayback();
	}, true);

	["pause", "ended", "volumechange", "emptied"].forEach((eventName) => {
		document.addEventListener(eventName, (event) => {
			if (event.target === audio) return;
			if (resumeTimer) window.clearTimeout(resumeTimer);
			resumeTimer = window.setTimeout(() => {
				resumeTimer = 0;
				syncPlayback();
			}, RESUME_DELAY_MS);
		}, true);
	});

	audio.addEventListener("ended", () => {
		audio.volume = 0;
		gapPending = true;
		if (canPlayBackground()) scheduleGap();
		updateButton();
	});

	document.addEventListener("visibilitychange", syncPlayback);
	window.addEventListener("pagehide", () => {
		pageIsClosing = true;
		savePosition();
		clearTimers();
		audio.pause();
	}, { once: true });

	window.addEventListener("pageshow", (event) => { if (event.persisted) { pageIsClosing = false; syncPlayback(); } });
	updateButton();
	if (enabled) {
		window.setTimeout(() => {
			if (canPlayBackground()) startBackground();
			else updateButton();
		}, 0);
	}
})();
