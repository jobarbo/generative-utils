// Definitions ===========================================================
({sin, cos, imul, PI} = Math);
TAU = PI * 2;
F = (N, f) => [...Array(N)].map((_, i) => f(i)); // for loop / map / list function

// A seeded PRNG =========================================================
//seed = 'das9d7as9d7as'; // random seed]
seed = Math.random() * 2 ** 32;
S = Uint32Array.of(9, 7, 5, 3); // PRNG state
R = (a = 1) =>
	a *
	((a = S[3]),
	(S[3] = S[2]),
	(S[2] = S[1]),
	(a ^= a << 11),
	(S[0] ^= a ^ (a >>> 8) ^ ((S[1] = S[0]) >>> 19)),
	S[0] / 2 ** 32); // random function
[...(seed + 'ThxPiter')].map((c) => R((S[3] ^= c.charCodeAt() * 23205))); // seeding the random function

// general noise definitions =============================================
KNUTH = 0x9e3779b1; // prime number close to PHI * 2 ** 32
NSEED = R(2 ** 32); // noise seed, random 32 bit integer
// 3d noise grid function
ri = (i, j, k) => (
	(i = imul((((i & 1023) << 20) | ((j & 1023) << 10) | ((i ^ j ^ k) & 1023)) ^ NSEED, KNUTH)),
	(i <<= 3 + (i >>> 29)),
	(i >>> 1) / 2 ** 31 - 0.5
);

// 3D value noise function ===============================================
no = F(99, (_) => R(1024)); // random noise offsets

n3 = (
	x,
	y,
	z,
	s,
	i, // (x,y,z) = coordinate, s = scale, i = noise offset index
	xi = floor((x = x * s + no[(i *= 3)])), // (xi,yi,zi) = integer coordinates
	yi = floor((y = y * s + no[i + 1])),
	zi = floor((z = z * s + no[i + 2]))
) => (
	(x -= xi),
	(y -= yi),
	(z -= zi), // (x,y,z) are now fractional parts of coordinates
	(x *= x * (3 - 2 * x)), // smoothstep polynomial (comment out if true linear interpolation is desired)
	(y *= y * (3 - 2 * y)), // this is like an easing function for the fractional part
	(z *= z * (3 - 2 * z)),
	// calculate the interpolated value
	ri(xi, yi, zi) * (1 - x) * (1 - y) * (1 - z) +
		ri(xi, yi, zi + 1) * (1 - x) * (1 - y) * z +
		ri(xi, yi + 1, zi) * (1 - x) * y * (1 - z) +
		ri(xi, yi + 1, zi + 1) * (1 - x) * y * z +
		ri(xi + 1, yi, zi) * x * (1 - y) * (1 - z) +
		ri(xi + 1, yi, zi + 1) * x * (1 - y) * z +
		ri(xi + 1, yi + 1, zi) * x * y * (1 - z) +
		ri(xi + 1, yi + 1, zi + 1) * x * y * z
);

// 2D value noise function ===============================================
na = F(99, (_) => R(TAU)); // random noise angles
ns = na.map(sin);
nc = na.map(cos); // sin and cos of those angles
nox = F(99, (_) => R(1024)); // random noise x offset
noy = F(99, (_) => R(1024)); // random noise y offset

n2 = (
	x,
	y,
	s,
	i,
	c = nc[i] * s,
	n = ns[i] * s,
	xi = floor((([x, y] = [x * c + y * n + nox[i], y * c - x * n + noy[i]]), x)),
	yi = floor(y) // (x,y) = coordinate, s = scale, i = noise offset index
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

function oct1(x, y, s, i) {
	// this function adds together 1 noise, in "octaves". This means
	// it adds the first noise normally
	return n2(x, y, s, i);
	// the result of this is that you get a better quality "cloudy" kind
	// of noise, often called fBm ("fractal Brownian motion"). It is also
	// often confused with Perlin noise but it's not.
}

function oct2(x, y, s, i) {
	// this function adds together 2 noises, in "octaves". This means
	// it adds the first noise normally, and the second noise has double the scale but half the amplitude
	i *= 2; // multiply the noise index by 2 because we use two noises
	return n2(x, y, s, i) + n2(x, y, s * 2, i + 1) / 2;
	// the result of this is that you get a better quality "cloudy" kind
	// of noise, often called fBm ("fractal Brownian motion"). It is also
	// often confused with Perlin noise but it's not.
}

function oct3(x, y, s, i) {
	// this function adds together 3 noises, in "octaves". This means
	// it adds the first noise normally, the second noise has double the scale but half the amplitude, and the third noise has four times the scale and a quarter of the amplitude (if you want to add more it would be 8, 16, 32, etc)
	i *= 3; // multiply the noise index by 3 because we use three noises
	return n2(x, y, s, i) + n2(x, y, s * 2, i + 1) / 2 + n2(x, y, s * 4, i + 2) / 4;
	// the result of this is that you get a better quality "cloudy" kind
	// of noise, often called fBm ("fractal Brownian motion"). It is also
	// often confused with Perlin noise but it's not.
}

function oct4(x, y, s, i) {
	// this function adds together 3 noises, in "octaves". This means
	// it adds the first noise normally, the second noise has double the scale but half the amplitude, and the third noise has four times the scale and a quarter of the amplitude (if you want to add more it would be 8, 16, 32, etc)
	i *= 4; // multiply the noise index by 3 because we use three noises
	return n2(x, y, s, i) + n2(x, y, s * 2, i + 1) / 2 + n2(x, y, s * 4, i + 2) / 4 + n2(x, y, s * 8, i + 3) / 8;
	// the result of this is that you get a better quality "cloudy" kind
	// of noise, often called fBm ("fractal Brownian motion"). It is also
	// often confused with Perlin noise but it's not.
}

function oct5(x, y, s, i) {
	// this function adds together 3 noises, in "octaves". This means
	// it adds the first noise normally, the second noise has double the scale but half the amplitude, and the third noise has four times the scale and a quarter of the amplitude (if you want to add more it would be 8, 16, 32, etc)
	i *= 5; // multiply the noise index by 3 because we use three noises
	return (
		n2(x, y, s, i) +
		n2(x, y, s * 2, i + 1) / 2 +
		n2(x, y, s * 4, i + 2) / 4 +
		n2(x, y, s * 8, i + 3) / 8 +
		n2(x, y, s * 16, i + 4) / 16
	);
	// the result of this is that you get a better quality "cloudy" kind
	// of noise, often called fBm ("fractal Brownian motion"). It is also
	// often confused with Perlin noise but it's not.
}

function oct6(x, y, s, i) {
	// this function adds together 3 noises, in "octaves". This means
	// it adds the first noise normally, the second noise has double the scale but half the amplitude, and the third noise has four times the scale and a quarter of the amplitude (if you want to add more it would be 8, 16, 32, etc)
	i *= 6; // multiply the noise index by 3 because we use three noises
	return (
		n2(x, y, s, i) +
		n2(x, y, s * 2, i + 1) / 2 +
		n2(x, y, s * 4, i + 2) / 4 +
		n2(x, y, s * 8, i + 3) / 8 +
		n2(x, y, s * 16, i + 4) / 16 +
		n2(x, y, s * 32, i + 5) / 32
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
