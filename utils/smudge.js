class Smudge {
	constructor(rdnX, rdnY, w1, color) {
		this.xoff = random(1000000);
		this.yoff = random(1000000);
		this.woff1 = random(1000000);
		this.aoff = random(1000000);
		this.rdnX = rdnX;
		this.rdnY = rdnY;
		this.rdnW1 = w1;
		this.mapXLow = -width * 3;
		this.mapXHigh = width * 3;
		this.mapYLow = -height * 3;
		this.mapYHigh = height * 3;
		this.alpha = int(random(0, 50));
		this.hue = hue(color);
		this.sat = saturation(color);
		this.bri = brightness(color);
		this.xoffInc = width / 10000000;
		this.yoffInc = width / 10000000;
		this.woff1Inc = width / 4000;
		this.aoffInc = width / 400000;
		this.maxWidth = height / 1000;
		this.minWidth = height / 5000;
		this.x = rdnX;
		this.y = rdnY;
		this.w = map(noise(this.woff1), 0, 1, this.minWidth, this.maxWidth, true);
		this.offset = this.w / 2;
	}

	display() {
		this.updateValues();

		noStroke();

		const ellipseConfigs = [
			{x: this.x - this.offset, y: this.y - this.offset, w: this.w, h: this.w, col: [this.hue, 0, 0, this.alpha / 2]},
			{x: this.x - this.offset, y: this.y + this.offset, w: this.w, h: this.w, col: [0, 100, 100, this.alpha]},
			{x: this.x + this.offset, y: this.y - this.offset, w: this.w, h: this.w, col: [200, 100, 100, this.alpha]},
			{
				x: this.x + this.offset,
				y: this.y + this.offset,
				w: this.w * 1.25,
				h: this.w * 1.25,
				col: [this.hue, 0, 100, this.alpha],
			},
		];

		ellipseConfigs.forEach(({x, y, w, h, col}) => {
			fill(...col);
			ellipse(x, y, w, h);
		});
	}

	updateValues() {
		this.xoff += this.xoffInc;
		this.yoff += this.yoffInc;
		this.woff1 += this.woff1Inc;
		this.aoff += this.aoffInc;

		this.w = map(noise(this.woff1), 0, 1, this.minWidth, this.maxWidth, true);
		this.x = map(noise(this.xoff), 0, 1, this.mapXHigh, this.mapXLow, true);
		this.y = map(noise(this.yoff), 0, 1, this.mapYHigh, this.mapYLow, true);
		this.alpha = map(noise(this.woff1), 0.6, 1, 1, 100, true);
		this.offset = this.w / 2;
	}
}
