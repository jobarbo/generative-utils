class Horizon {
	constructor(y = 0) {
		this.y = y;
		this._debug = false;
	}

	set debug(value) {
		if (value !== this._debug) {
			this._debug = value;
			console.log(`Debug mode ${value ? 'enabled' : 'disabled'}`);
			if (value) {
				console.log(value);
				this.drawDebug();
			} else {
				clear();
			}
		}
	}

	get debug() {
		return this._debug;
	}

	drawDebug() {
		console.log('drawing horizon line');
		//fill(111, 30, 0, 100);

		stroke(0, 100, 100, 100);
		rect(0, this.y, width, height);
		line(0, this.y, width, this.y);
		line(0, height, width, height);
		line(0, this.y, 0, height);
		line(width, this.y, width, height);
		// diagonal lines
		line(0, this.y, width, height);
		line(width, this.y, 0, height);
	}

	aboveHorizon(y) {
		return y < this.y;
	}

	belowHorizon(y) {
		return y > this.y;
	}
}

class VanishingPoint {
	constructor(x, y, resolution = 1) {
		this.x = x;
		this.y = y;
		this._debug = false;
		this.resolution = resolution;
	}

	set debug(value) {
		if (value !== this._debug) {
			this._debug = value;
			console.log(`Vanishing Debug mode ${value ? 'enabled' : 'disabled'}`);
			if (value) {
				this.drawDebug();
			} else {
				clear();
			}
		}
	}

	get debug() {
		return this._debug;
	}

	setVanishingPoint(x, y) {
		this.x = x;
		this.y = y;
	}

	drawDebug() {
		if (!this._debug) return;

		console.log('drawing perspective lines');

		// set points according to this.resolution around the canvas using angles
		// resolution 1 = 4 points (top, bottom, left, right)
		// resolution 2 = 8 points (top, bottom, left, right, top-left, top-right, bottom-left, bottom-right)
		// resolution 3 = 12 points (top, bottom, left, right, top-left, top-right, bottom-left, bottom-right, top-left, top-right, bottom-left, bottom-right)
		// resolution 4 = 16 points (top, bottom, left, right, top-left, top-right, bottom-left, bottom-right, top-left, top-right, bottom-left, bottom-right, top-left, top-right, bottom-left, bottom-right)

		// draw a crosshair at the vanishing point with an ellipse around it
		stroke(0, 100, 100, 100);
		line(0, this.y, width, this.y);
		line(this.x, 0, this.x, height);
		ellipse(this.x, this.y, 100, 100);
		ellipse(this.x, this.y, 50, 50);
		ellipse(this.x, this.y, 25, 25);
	}

	drawVanishingPoint(x, y) {
		line(this.x, this.y, x, y);
	}
}
