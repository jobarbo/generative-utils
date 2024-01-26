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
		for (let i = 0; i < this.numLines; i++) {
			// Calculate the direction vector based on the original rotation
			const currentAngle = i * this.angle + 45; // Add 45 degrees offset
			this.createVector(currentAngle);

			// Calculate the intersection of the line with the canvas boundaries
			const endPoint = this.calculateCanvasEdge();
			const endX = endPoint.x;
			const endY = endPoint.y;
			// Add the end point to the array

			// Draw the line
			if (this._debug) {
				this.drawLines(endX, endY);
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
			const endPoint = this.calculateCanvasEdge();
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

	calculateCanvasEdge() {
		let endX, endY;
		if (abs(this.direction.x) > abs(this.direction.y)) {
			// If the line is more horizontal than vertical
			endX = this.direction.x > 0 ? width : 0;
			endY = this.y + (this.direction.y * (endX - this.x)) / this.direction.x;
		} else {
			// If the line is more vertical than horizontal
			endY = this.direction.y > 0 ? height : 0;
			endX = this.x + (this.direction.x * (endY - this.y)) / this.direction.y;
		}
		this.end_point_array.push({x: endX, y: endY});

		return createVector(endX, endY);
	}

	drawVanishingPoint() {
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
		fill(222, 100, 100);
		rect(endX, endY, 30, 30);
	}

	drawNodes() {
		for (let i = 0; i < this.node_array.length; i++) {
			let node = this.node_array[i];
			fill(0, 100, 100);
			ellipse(node.x, node.y, 10);
			// put the index number next to the node
			fill(0, 100, 100);
			text(i, node.x + 10, node.y);
		}
	}
}
