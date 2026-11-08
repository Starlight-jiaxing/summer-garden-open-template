/**
 * Small local sound palette for navigation and tactile UI feedback.
 * It uses Web Audio only, so there are no external media files to load.
 */
(function () {
	"use strict";

	const STORAGE_KEY = "kean-sound-enabled-v2";
	let audioContext = null;

	function readEnabled() {
		try {
			return localStorage.getItem(STORAGE_KEY) !== "false";
		} catch (error) {
			return true;
		}
	}

	function getContext() {
		if (audioContext) return audioContext;
		const AudioContextClass = window.AudioContext || window.webkitAudioContext;
		if (!AudioContextClass) return null;
		audioContext = new AudioContextClass();
		return audioContext;
	}

	function unlock() {
		const context = getContext();
		if (context && context.state === "suspended") context.resume().catch(() => {});
		return context;
	}

	function tone(frequency, duration, volume, type = "sine", endFrequency = frequency, delay = 0) {
		if (!readEnabled()) return;
		const context = unlock();
		if (!context) return;
		const start = context.currentTime + delay;
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		oscillator.type = type;
		oscillator.frequency.setValueAtTime(frequency, start);
		oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), start + duration);
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.02, duration * 0.3));
		gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
		oscillator.connect(gain);
		gain.connect(context.destination);
		oscillator.start(start);
		oscillator.stop(start + duration + 0.02);
	}

	function texture(duration, volume, filterType, frequency, delay = 0) {
		if (!readEnabled()) return;
		const context = unlock();
		if (!context) return;
		const start = context.currentTime + delay;
		const length = Math.max(1, Math.floor(context.sampleRate * duration));
		const buffer = context.createBuffer(1, length, context.sampleRate);
		const data = buffer.getChannelData(0);
		for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
		const source = context.createBufferSource();
		const filter = context.createBiquadFilter();
		const gain = context.createGain();
		source.buffer = buffer;
		filter.type = filterType;
		filter.frequency.setValueAtTime(frequency, start);
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
		gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
		source.connect(filter);
		filter.connect(gain);
		gain.connect(context.destination);
		source.start(start);
		source.stop(start + duration + 0.02);
	}

	const sounds = {
		music() {
			texture(0.075, 0.025, "lowpass", 900);
			tone(150, 0.24, 0.035, "sine", 72, 0.015);
		},
		game() {
			tone(220, 0.1, 0.025, "square", 245);
			tone(330, 0.12, 0.022, "triangle", 360, 0.075);
			tone(495, 0.18, 0.018, "sine", 520, 0.15);
		},
		reading() {
			texture(0.18, 0.022, "lowpass", 1500);
			tone(280, 0.18, 0.024, "triangle", 185, 0.045);
		},
		photo() {
			texture(0.08, 0.04, "bandpass", 1800);
			tone(880, 0.045, 0.045, "triangle", 260, 0.008);
		},
		rail() {
			tone(392, 0.22, 0.018, "sine", 392);
			tone(523, 0.28, 0.02, "sine", 523, 0.08);
			tone(659, 0.34, 0.018, "sine", 659, 0.16);
		},
		letter() {
			texture(0.12, 0.024, "lowpass", 1100);
			tone(330, 0.2, 0.02, "sine", 250, 0.05);
		},
		archive() {
			tone(196, 0.24, 0.024, "triangle", 150);
			tone(98, 0.32, 0.016, "sine", 70, 0.08);
		}
	};

	function playBookTurn() {
		if (!readEnabled()) return;
		texture(0.24, 0.026, "lowpass", 2300);
		tone(420, 0.2, 0.018, "triangle", 250, 0.08);
	}

	document.addEventListener("pointerdown", event => {
		if (!readEnabled() || event.target.closest("#btnAudioToggle")) return;
		unlock();
	}, { once: true, passive: true });

	window.KeanSound = {
		playForMode(mode) {
			if (sounds[mode]) sounds[mode]();
		},
		playBookTurn,
		isEnabled() {
			return readEnabled();
		}
	};
})();
