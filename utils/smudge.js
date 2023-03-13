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
		this.xoff += this.xoffInc;
		this.yoff += this.yoffInc;
		this.woff1 += this.woff1Inc;
		this.aoff += this.aoffInc;

		this.w = map(noise(this.woff1), 0, 1, this.minWidth, this.maxWidth, true);
		this.x = map(noise(this.xoff), 0, 1, this.mapXHigh, this.mapXLow, true);
		this.y = map(noise(this.yoff), 0, 1, this.mapYHigh, this.mapYLow, true);
		this.alpha = map(noise(this.woff1), 0.6, 1, 1, 100, true);

		this.offset = this.w / 2;
		noStroke();
		fill(this.hue, 0, 0, this.alpha / 2);
		ellipse(this.x - this.offset, this.y - this.offset, this.w, this.w);
		fill(0, 100, 100, this.alpha);
		ellipse(this.x - this.offset, this.y + this.offset, this.w, this.w);
		fill(200, 100, 100, this.alpha);
		ellipse(this.x + this.offset, this.y - this.offset, this.w, this.w);
		fill(this.hue, 0, 100, this.alpha);
		ellipse(this.x + this.offset, this.y + this.offset, this.w * 1.25, this.w * 1.25);
	}
}
