/**
 * Your Name · Personal Station Portal Engine (portal.js)
 * - 轻量站台开场与原生声音开关
 * - 原生 Web Audio API 沉浸式站台微风与列车音效引擎 (无外部音频依赖)
 * - 车票、轨道站点与启程按钮多维联动交互
 * - 沿铁轨推镜启程平滑转场
 */

(function () {
	"use strict";

	// 1. 动效与时序控制
	const body = document.body;
	const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	// The shared arrival ticket releases as soon as the first view is ready.

	// 2. 原生 Web Audio API 站台声效引擎 (零外部文件依赖，100% 离线可用)
	let audioCtx = null;
	const audioStorageKey = "kean-sound-enabled-v2";
	let isAudioEnabled = readAudioPreference();

	function readAudioPreference() {
		try {
			return localStorage.getItem(audioStorageKey) !== "false";
		} catch (e) {
			return true;
		}
	}

	function initAudioContext() {
		if (audioCtx) return;
		const AudioContextClass = window.AudioContext || window.webkitAudioContext;
		if (!AudioContextClass) return;
		audioCtx = new AudioContextClass();
	}

	document.addEventListener("pointerdown", () => {
		initAudioContext();
		if (audioCtx?.state === "suspended") audioCtx.resume().catch(() => {});
	}, { once: true, passive: true });

	// 纸张摩擦微音 (悬停车票)
	function playPaperFlutter() {
		if (!isAudioEnabled || !audioCtx) return;
		try {
			const osc = audioCtx.createOscillator();
			const gain = audioCtx.createGain();
			osc.type = "sine";
			osc.frequency.setValueAtTime(160, audioCtx.currentTime);
			osc.frequency.exponentialRampToValueAtTime(380, audioCtx.currentTime + 0.08);

			gain.gain.setValueAtTime(0.025, audioCtx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.08);

			osc.connect(gain);
			gain.connect(audioCtx.destination);
			osc.start();
			osc.stop(audioCtx.currentTime + 0.08);
		} catch (e) {}
	}

	// 检票打孔清脆微音
	function playTicketPunch() {
		if (!isAudioEnabled || !audioCtx) return;
		try {
			const osc = audioCtx.createOscillator();
			const gain = audioCtx.createGain();
			osc.type = "triangle";
			osc.frequency.setValueAtTime(780, audioCtx.currentTime);
			osc.frequency.exponentialRampToValueAtTime(180, audioCtx.currentTime + 0.06);

			gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.07);

			osc.connect(gain);
			gain.connect(audioCtx.destination);
			osc.start();
			osc.stop(audioCtx.currentTime + 0.07);
		} catch (e) {}
	}

	// 列车启程钟声与轨道推镜回响
	function playDepartureChime() {
		if (!isAudioEnabled || !audioCtx) return;
		try {
			const freqs = [523.25, 659.25, 783.99]; // C - E - G 和弦
			freqs.forEach((freq, idx) => {
				const osc = audioCtx.createOscillator();
				const gain = audioCtx.createGain();
				osc.type = "sine";
				osc.frequency.setValueAtTime(freq, audioCtx.currentTime + idx * 0.05);

				gain.gain.setValueAtTime(0.04, audioCtx.currentTime + idx * 0.05);
				gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6);

				osc.connect(gain);
				gain.connect(audioCtx.destination);
				osc.start(audioCtx.currentTime + idx * 0.05);
				osc.stop(audioCtx.currentTime + 0.6);
			});
		} catch (e) {}
	}

	// 3. 工程档案铭牌微动效音律
	const engSpecPlate = document.getElementById("engSpecPlate");
	function playSpecTick() {
		if (!isAudioEnabled || !audioCtx) return;
		try {
			const osc = audioCtx.createOscillator();
			const gain = audioCtx.createGain();
			osc.type = "sine";
			osc.frequency.setValueAtTime(880, audioCtx.currentTime);
			osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.04);

			gain.gain.setValueAtTime(0.015, audioCtx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.04);

			osc.connect(gain);
			gain.connect(audioCtx.destination);
			osc.start();
			osc.stop(audioCtx.currentTime + 0.04);
		} catch (e) {}
	}

	if (engSpecPlate) {
		engSpecPlate.addEventListener("mouseenter", playSpecTick);
	}

	// 5. 入口按钮悬停：点亮旅程地图的第一站
	const btnEnterJourney = document.getElementById("btnEnterJourney");
	const stationStart = document.getElementById("stationStart");

	if (btnEnterJourney) {
		btnEnterJourney.addEventListener("mouseenter", () => {
			if (stationStart) {
				stationStart.classList.add("is-highlighted");
			}
		});
		btnEnterJourney.addEventListener("mouseleave", () => {
			if (stationStart) {
				stationStart.classList.remove("is-highlighted");
			}
		});

		// 点击启程：铁轨推镜离开过渡
		btnEnterJourney.addEventListener("click", (e) => {
			if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || prefersReducedMotion) return;
			e.preventDefault();
			const targetUrl = btnEnterJourney.getAttribute("href") || "html/home.html";

			btnEnterJourney.classList.add("is-departing");
			playDepartureChime();
			body.classList.add("page-transitioning");

			setTimeout(() => {
				window.location.href = targetUrl;
			}, 180);
		});
	}
	window.addEventListener("pageshow", () => {
		body.classList.remove("page-transitioning");
		btnEnterJourney?.classList.remove("is-departing");
	});
})();
