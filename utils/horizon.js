class Horizon {
	constructor(y) {
		this.y = y; // y-coordinate of the horizon line
	}

	// Draw the horizon line
	draw() {
		console.log('drawing horizon line');
		stroke(0, 0, 100, 100);
		line(0, this.y, width, this.y);
	}

	// Check if an element is above or below the horizon line
	aboveHorizon(y) {
		return y < this.y;
	}

	belowHorizon(y) {
		return y > this.y;
	}
}
