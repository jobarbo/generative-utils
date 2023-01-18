// ok ignore the first bit of all this code, it defines the noise
// function. I can explain how it works another day if you like.

let F = (N, f) => [...Array(N)].map((_) => f()); // loop function
let imul = Math.imul,
	floor = Math.floor;
// 2d value noise function
const KNUTH = 0x9e3779b1;
let NSEED = fxrand() * 2 ** 32;
let ri = (i, j, k) => (
	(i = imul((((i & 1023) << 20) | ((j & 1023) << 10) | ((i ^ j ^ k) & 1023)) ^ NSEED, KNUTH)),
	(i <<= 3 + (i >>> 29)),
	(i >>> 1) / 2 ** 31 - 0.5
);
let na = F(99, (_) => fxrand() * Math.PI * 2);
let ns = na.map(Math.sin),
	nc = na.map(Math.cos);
let nox = F(99, (_) => fxrand() * 1024);
let noy = F(99, (_) => fxrand() * 1024);
let nz = (
	x,
	y,
	s,
	i,
	c = nc[i] * s,
	n = ns[i] * s,
	xi = floor((([x, y] = [x * c + y * n + nox[i], y * c - x * n + noy[i]]), x)),
	yi = floor(y)
) => (
	(x -= xi),
	(y -= yi),
	(x *= x * (3 - 2 * x)),
	(y *= y * (3 - 2 * y)),
	ri(xi, yi, i) * (1 - x) * (1 - y) +
		ri(xi, yi + 1, i) * (1 - x) * y +
		ri(xi + 1, yi, i) * x * (1 - y) +
		ri(xi + 1, yi + 1, i) * x * y
);

// the point of all the previous code is that now you have a very
// fast value noise function called nz(x,y,s,i). It has four parameters:
// x -- the x coordinate
// y -- the y coordinate
// s -- the scale (simply multiplies x and y by s)
// i -- the noise index, you get 99 different random noises! (but you
//      can increase this number by changing the 99s in the code above)
//      each of the 99 noises also has a random rotation which increases
//      the "randomness" if you add many together
//
// ohh also important to mention that it returns smooth noise values
// between -.5 and .5

function n3(x, y, s, i) {
	// this function adds together 3 noises, in "octaves". This means
	// it adds the first noise normally, the second noise has double the scale but half the amplitude, and the third noise has four times the scale and a quarter of the amplitude (if you want to add more it would be 8, 16, 32, etc)
	i *= 15; // multiply the noise index by 3 because we use three noises
	return (
		nz(x, y, s, i) +
		nz(x, y, s * 2, i + 1) / 2 +
		nz(x, y, s * 4, i + 2) / 4 +
		nz(x, y, s * 8, i + 3) / 8 +
		nz(x, y, s * 16, i + 4) / 16 +
		nz(x, y, s * 32, i + 5) / 32 +
		nz(x, y, s * 64, i + 6) / 64 +
		nz(x, y, s * 128, i + 7) / 128 +
		nz(x, y, s * 256, i + 8) / 256 +
		nz(x, y, s * 512, i + 9) / 512 +
		nz(x, y, s * 1024, i + 10) / 1024 +
		nz(x, y, s * 2048, i + 11) / 2048 +
		nz(x, y, s * 4096, i + 12) / 4096 +
		nz(x, y, s * 8192, i + 13) / 8192 +
		nz(x, y, s * 16384, i + 14) / 16384
	);
	// the result of this is that you get a better quality "cloudy" kind
	// of noise, often called fBm ("fractal Brownian motion"). It is also
	// often confused with Perlin noise but it's not.
}

// so now we got this cloudy noise, we're gonna use it and distort it
// using itself!
/* function setup() {
  createCanvas(400, 400);
}
function draw() {
  background(0); // this was already there
  noStroke();
  for (let y = 0; y < height; y+=1) {
    for (let x = 0; x < width; x+=1) {
      // copy x and y into nx and ny, and initialize some variables
      let nx=x,ny=y,a=9.5,sc=.02,dx,dy;
      // first we use two noises to determine the step direction in
      // dx and dy. then we add the step direction to nx and ny,
      // multiplied by the amount a. this moves the position (nx,ny)
      // slightly in a direction determined by the noise field
      dx = n3(nx,ny,sc,0); dy = n3(nx,ny,sc,1); nx += dx*a; ny += dy*a;
      // then we do this again
      dx = n3(nx,ny,sc,0); dy = n3(nx,ny,sc,1); nx += dx*a; ny += dy*a;
      // and again
      dx = n3(nx,ny,sc,0); dy = n3(nx,ny,sc,1); nx += dx*a; ny += dy*a;
      // finally we use a third noise (index 2) to get a noise value
      // at the position that we arrived at
      let v = n3(nx,ny,.03,2);
      console.log(v);
      fill(128 + v * 127); // change the colour to a greyscale of v
      rect(x,y,1,1); // draw a pixel
    }
  }
  noLoop();
} */
