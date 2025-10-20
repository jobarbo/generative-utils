/**
 * Audio Debug Display
 *
 * Simple on-screen display for debugging audio values
 * Shows real-time frequency bands, volume, beats, etc.
 *
 * Usage:
 * 1. In setup(): audioDebugDisplay.init(audioAnalyzer)
 * 2. In draw(): audioDebugDisplay.draw()
 * 3. Toggle with: audioDebugDisplay.toggle()
 */
class AudioDebugDisplay {
	constructor() {
		this.audioAnalyzer = null;
		this.visible = false;
		this.position = "top-right"; // 'top-right', 'top-left', 'bottom-right', 'bottom-left'
		this.width = 200;
		this.height = 250;
		this.padding = 10;
		this.barHeight = 15;
		this.fontSize = 11;
	}

	/**
	 * Initialize the debug display
	 * @param {AudioAnalyzer} audioAnalyzer - The audio analyzer instance
	 */
	init(audioAnalyzer) {
		this.audioAnalyzer = audioAnalyzer;

		// Add keyboard shortcut to toggle display
		document.addEventListener("keydown", (e) => {
			if (e.key === "v" || e.key === "V") {
				this.toggle();
			}
		});

		console.log("Audio debug display initialized - press V to toggle");
		return this;
	}

	/**
	 * Toggle visibility
	 */
	toggle() {
		this.visible = !this.visible;
		console.log(`Audio debug display: ${this.visible ? "ON" : "OFF"}`);
		return this;
	}

	/**
	 * Show the display
	 */
	show() {
		this.visible = true;
		return this;
	}

	/**
	 * Hide the display
	 */
	hide() {
		this.visible = false;
		return this;
	}

	/**
	 * Set position
	 * @param {string} position - 'top-right', 'top-left', 'bottom-right', 'bottom-left'
	 */
	setPosition(position) {
		this.position = position;
		return this;
	}

	/**
	 * Get position coordinates
	 */
	getPosition() {
		const margin = 15;

		switch (this.position) {
			case "top-left":
				return {x: margin, y: margin};
			case "top-right":
				return {x: width - this.width - margin, y: margin};
			case "bottom-left":
				return {x: margin, y: height - this.height - margin};
			case "bottom-right":
				return {x: width - this.width - margin, y: height - this.height - margin};
			default:
				return {x: width - this.width - margin, y: margin};
		}
	}

	/**
	 * Draw the debug display
	 */
	draw() {
		if (!this.visible || !this.audioAnalyzer || !this.audioAnalyzer.isInitialized) {
			return;
		}

		push();

		const pos = this.getPosition();
		const x = pos.x;
		const y = pos.y;
		const w = this.width;
		const p = this.padding;

		// Background
		fill(0, 0, 0, 80);
		noStroke();
		rect(x, y, w, this.height, 5);

		// Title
		fill(255, 255, 255);
		textSize(12);
		textAlign(LEFT, TOP);
		text("Audio Debug (V)", x + p, y + p);

		let currentY = y + p + 20;

		// Main frequency bands
		this.drawBar(x + p, currentY, w - 2 * p, "Bass", this.audioAnalyzer.bass, color(255, 50, 50));
		currentY += this.barHeight + 3;

		this.drawBar(x + p, currentY, w - 2 * p, "Mid", this.audioAnalyzer.mid, color(50, 255, 50));
		currentY += this.barHeight + 3;

		this.drawBar(x + p, currentY, w - 2 * p, "Treble", this.audioAnalyzer.treble, color(50, 150, 255));
		currentY += this.barHeight + 3;

		// Volume & Energy
		currentY += 5;
		this.drawBar(x + p, currentY, w - 2 * p, "Volume", this.audioAnalyzer.volume, color(200, 200, 200));
		currentY += this.barHeight + 3;

		this.drawBar(x + p, currentY, w - 2 * p, "Energy", this.audioAnalyzer.energy, color(255, 200, 50));
		currentY += this.barHeight + 3;

		// Beat indicator
		currentY += 5;
		fill(255);
		textSize(this.fontSize);
		text("Beat:", x + p, currentY);

		if (this.audioAnalyzer.isBeat) {
			fill(255, 100, 100);
			ellipse(x + p + 40, currentY + 6, 12, 12);
		} else {
			noFill();
			stroke(100);
			strokeWeight(1);
			ellipse(x + p + 40, currentY + 6, 12, 12);
		}

		// BPM
		noStroke();
		fill(255);
		text(`BPM: ${this.audioAnalyzer.bpm || "---"}`, x + p + 60, currentY);
		currentY += 20;

		// Source info
		fill(150);
		textSize(10);
		text(`Source: ${this.audioAnalyzer.sourceType}`, x + p, currentY);

		pop();
	}

	/**
	 * Draw a level bar
	 */
	drawBar(x, y, maxWidth, label, value, barColor) {
		push();

		// Label
		fill(200);
		textSize(this.fontSize);
		textAlign(LEFT, TOP);
		text(label, x, y);

		// Value
		const valueText = (value * 100).toFixed(0) + "%";
		textAlign(RIGHT, TOP);
		text(valueText, x + maxWidth, y);

		// Bar background
		const barY = y + 13;
		const barMaxWidth = maxWidth - 10;
		fill(40);
		noStroke();
		rect(x, barY, barMaxWidth, 5, 2);

		// Bar foreground
		const barWidth = barMaxWidth * Math.min(value, 1.0);
		fill(barColor);
		rect(x, barY, barWidth, 5, 2);

		pop();
	}

	/**
	 * Draw spectrum visualizer (advanced)
	 * @param {number} x - X position
	 * @param {number} y - Y position
	 * @param {number} w - Width
	 * @param {number} h - Height
	 */
	drawSpectrum(x, y, w, h) {
		if (!this.audioAnalyzer || !this.audioAnalyzer.isInitialized) return;

		const spectrum = this.audioAnalyzer.getSpectrum();
		const sliceWidth = w / spectrum.length;

		push();
		noFill();
		stroke(100, 200, 255);
		strokeWeight(2);

		beginShape();
		for (let i = 0; i < spectrum.length; i++) {
			const amplitude = spectrum[i] / 255.0;
			const barHeight = amplitude * h;
			const xPos = x + i * sliceWidth;
			const yPos = y + h - barHeight;

			vertex(xPos, yPos);
		}
		endShape();

		pop();
	}

	/**
	 * Draw waveform (advanced)
	 * @param {number} x - X position
	 * @param {number} y - Y position
	 * @param {number} w - Width
	 * @param {number} h - Height
	 */
	drawWaveform(x, y, w, h) {
		if (!this.audioAnalyzer || !this.audioAnalyzer.isInitialized) return;

		const waveform = this.audioAnalyzer.getWaveform();
		const sliceWidth = w / waveform.length;

		push();
		noFill();
		stroke(255, 100, 100);
		strokeWeight(2);

		beginShape();
		for (let i = 0; i < waveform.length; i++) {
			const amplitude = waveform[i];
			const xPos = x + i * sliceWidth;
			const yPos = y + h / 2 + (amplitude * h) / 2;

			vertex(xPos, yPos);
		}
		endShape();

		pop();
	}
}

// Global instance
const audioDebugDisplay = new AudioDebugDisplay();

