(function () {
	const SNAPSHOT_KEY = "fx-live-reload-snapshot";
	const SNAPSHOT_MAX_AGE_MS = 15000;
	const FALLBACK_RELEASE_MS = 4000;
	const FADE_DURATION_MS = 700;

	let overlay = null;
	let isReleased = false;
	let fallbackTimer = null;

	function clearSnapshot() {
		try {
			sessionStorage.removeItem(SNAPSHOT_KEY);
		} catch (error) {
			console.warn("Unable to clear live reload snapshot:", error);
		}
	}

	function getSnapshot() {
		try {
			const raw = sessionStorage.getItem(SNAPSHOT_KEY);
			if (!raw) return null;

			const snapshot = JSON.parse(raw);
			if (!snapshot?.dataUrl || Date.now() - snapshot.timestamp > SNAPSHOT_MAX_AGE_MS) {
				clearSnapshot();
				return null;
			}

			return snapshot;
		} catch (error) {
			console.warn("Unable to read live reload snapshot:", error);
			clearSnapshot();
			return null;
		}
	}

	function captureSnapshot() {
		try {
			const canvas = document.querySelector("canvas.p5Canvas") || document.querySelector("canvas");
			if (!canvas) {
				clearSnapshot();
				return;
			}

			sessionStorage.setItem(
				SNAPSHOT_KEY,
				JSON.stringify({
					dataUrl: canvas.toDataURL("image/png"),
					timestamp: Date.now(),
				}),
			);
		} catch (error) {
			console.warn("Unable to capture live reload snapshot:", error);
			clearSnapshot();
		}
	}

	function mountOverlay() {
		const snapshot = getSnapshot();
		if (!snapshot || !document.body) return;

		overlay = document.createElement("div");
		overlay.className = "reload-transition";
		overlay.setAttribute("aria-hidden", "true");

		const image = document.createElement("img");
		image.className = "reload-transition__image";
		image.src = snapshot.dataUrl;
		image.alt = "";

		overlay.appendChild(image);
		document.body.appendChild(overlay);

		fallbackTimer = window.setTimeout(() => {
			releaseOverlay();
		}, FALLBACK_RELEASE_MS);
	}

	function releaseOverlay() {
		if (isReleased) return;
		isReleased = true;

		if (fallbackTimer) {
			clearTimeout(fallbackTimer);
			fallbackTimer = null;
		}

		if (!overlay) {
			clearSnapshot();
			return;
		}

		overlay.classList.add("reload-transition--fade-out");
		window.setTimeout(() => {
			overlay?.remove();
			overlay = null;
			clearSnapshot();
		}, FADE_DURATION_MS + 100);
	}

	window.liveReloadTransition = {
		captureSnapshot,
		onSketchReady: releaseOverlay,
	};

	window.addEventListener("beforeunload", captureSnapshot);
	window.addEventListener("pagehide", captureSnapshot);

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", mountOverlay, {once: true});
	} else {
		mountOverlay();
	}
})();
