class Smudge {
	constructor(rdnX, rdnY, w1, hue) {
		this.xoff = 0;
		this.yoff = 1;
		this.woff1 = 0;
		this.rdnX = rdnX;
		this.rdnY = rdnY;
		this.rdnW1 = w1;
		this.mapXLow = -width / 3;
		this.mapXHigh = width * 1.5;
		this.mapYLow = -height / 3;
		this.mapYHigh = height * 1.5;
		this.hue = hue;
		this.alpha = int(random(0, 15));
	}

	display() {
		this.xoff += width / 26666.67;
		this.yoff += width / 100000;
		this.woff1 += width / 1454.55;

		const w1 = map(noise(this.woff1 + this.rdnW1), 0, 1, 0, width / 800);
		const x = map(noise(this.xoff + this.rdnX), 0, 1, this.mapXLow, this.mapXHigh);
		const y = map(noise(this.yoff + this.rdnY), 0, 1, this.mapYLow, this.mapYHigh);

		fill(this.hue, 10, 100, this.alpha);
		noStroke();
		rect(x, y, w1, w1);
	}
}
