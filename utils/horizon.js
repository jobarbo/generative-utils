class Horizon {
	constructor(y = 0) {
		this.y = y;
		this._debug = false;
	}

	set debug(value) {
		if (value !== this._debug) {
			this._debug = value;
			console.log(`Debug mode ${value ? "enabled" : "disabled"}`);
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
		console.log("drawing horizon line");
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
	constructor(x, y, resolution = 1, nodeNum = 10, debug = false) {
		this.x = x;
		this.y = y;
		this._debug = debug;
		this.nodeNum = nodeNum;
		this.node_array = [];
		this.numLines = 4 * resolution;
		this.angle = 360 / this.numLines;
		this.resolution = resolution;
		this.direction = null;
		this.end_point_array = [];
		this.setVanishingPoint(this.x, this.y);
		this.createLines();
		this.distributeNodes();
		console.log(this.end_point_array);
		console.log(this.node_array);
	}

	setVanishingPoint(x, y) {
		this.x = x;
		this.y = y;
		if (this._debug) {
			this.drawVanishingPoint();
		}
	}

	createVector(angle) {
		this.direction = p5.Vector.fromAngle(radians(angle));
	}

	createLines() {
		// Calculate the total number of lines and the angle between each line
		const totalLines = 4 * this.resolution;
		const angleBetweenLines = 360 / totalLines;

		// For each line
		for (let i = 0; i < totalLines; i++) {
			// Calculate the direction vector based on the current angle
			const currentAngle = i * angleBetweenLines + 45; // Add 45 degrees offset
			this.createVector(currentAngle);

			// Calculate the intersection of the line with the canvas edge
			const endPoint = this.calculateIntersection();
			this.end_point_array.push(endPoint);

			// If debug is activated, draw the line from the vanishing point to the intersection point
			if (this._debug) {
				this.drawLines(endPoint.x, endPoint.y);
			}
		}
	}

	distributeNodes() {
		// For each line
		for (let i = 0; i < this.numLines; i++) {
			// Calculate the direction vector based on the current angle
			const currentAngle = i * this.angle + 45; // Add 45 degrees offset
			this.createVector(currentAngle);

			// Calculate the intersection of the line with the canvas edge
			const endPoint = this.calculateIntersection();
			const lineLength = dist(this.x, this.y, endPoint.x, endPoint.y);

			// For each node
			for (let j = 1; j <= this.nodeNum; j++) {
				// Calculate the node position along the line
				let nodePos = p5.Vector.add(this.direction.copy().mult((lineLength * j) / (this.nodeNum + 1)), createVector(this.x, this.y));
				this.node_array.push(nodePos);
			}
		}

		if (this._debug) {
			this.drawNodes();
		}
	}

	calculateIntersection() {
		let x = 0,
			y = 0;

		if (this.direction.y / this.direction.x > height / width) {
			// The line intersects with the top or bottom edge of the canvas
			if (this.direction.y < 0) {
				// The line intersects with the top edge of the canvas
				x = this.x - (this.direction.x / this.direction.y) * this.y;
				y = 0;
			} else {
				// The line intersects with the bottom edge of the canvas
				x = this.x + (this.direction.x / this.direction.y) * (height - this.y);
				y = height;
			}
		} else {
			// The line intersects with the left or right edge of the canvas
			if (this.direction.x < 0) {
				// The line intersects with the left edge of the canvas
				x = 0;
				y = this.y - (this.direction.y / this.direction.x) * this.x;
			} else {
				// The line intersects with the right edge of the canvas
				x = width;
				y = this.y + (this.direction.y / this.direction.x) * (width - this.x);
			}
		}

		return {x: int(x), y: int(y)};
	}

	drawVanishingPoint() {
		console.log("drawing vanishing point");
		noFill();
		stroke(120, 100, 100);
		line(this.x, this.y - width / 13, this.x, this.y + width / 13);
		line(this.x - width / 13, this.y, this.x + width / 13, this.y);

		for (let i = 0; i < 3; i++) {
			ellipse(this.x, this.y, i * (width / 13));
		}
	}

	drawLines(endX, endY) {
		stroke(0, 100, 100);
		line(this.x, this.y, endX, endY);
		//fill(222, 100, 100);
		//rect(endX, endY, 30, 30);
	}

	drawNodes() {
		for (let i = 0; i < this.node_array.length; i++) {
			let node = this.node_array[i];
			fill(0, 100, 100);
			ellipse(node.x, node.y, 10);
		}
	}
}
