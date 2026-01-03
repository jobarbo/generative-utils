let knob = Array(19).fill(0);

let kval = "";
let kname = "";

let circlex, circley, circlew;
let velx = 0;
let vely = 0;

let currentPage = 0;

if (navigator.requestMIDIAccess) {
	navigator.requestMIDIAccess().then(function (midi) {
		const inputs = midi.inputs.values();
		const xtouch = [...inputs].filter((v) => v.name === "Grid")[0];
		console.log(inputs);

		console.log(xtouch);

		xtouch.onmidimessage = ({data}) => {
			const [status, controller, value] = data;

			const channel = status & 0x0f; // 0..15
			currentPage = channel;
			console.log(`Page ${currentPage + 1}`);

			if (controller < 0) {
				return;
			}

			const knobValue = (value / 127) * 100;
			knob[controller] = knobValue;
			kval = knobValue;
			kname = controller;
			console.log(`Controller ${controller}, value ${value}`);

			if (currentPage === 0) {
				if (controller === 32) {
					const angle = map(value, 0, 127, 0, 1.14159 * 2, true);
					if (typeof shaderEffects !== "undefined" && typeof shaderEffects.updateEffectParam === "function") {
						shaderEffects.updateEffectParam("symmetry", "rotationStartingAngle", angle);
					}
				}

				if (controller === 33) {
					const angle = map(value, 0, 127, 0, 1, true);
					if (typeof shaderEffects !== "undefined" && typeof shaderEffects.updateEffectParam === "function") {
						shaderEffects.updateEffectParam("pixelSort", "invert", angle);
					}
				}

				if (controller === 34) {
					const angle = map(value, 0, 127, 0, 1, true);
					if (typeof shaderEffects !== "undefined" && typeof shaderEffects.updateEffectParam === "function") {
						console.log("threshold", angle);
						shaderEffects.updateEffectParam("pixelSort", "threshold", angle);
					}
				}

				if (controller === 35) {
					const angle = map(value, 0, 127, 0, 10, true);
					if (typeof shaderEffects !== "undefined" && typeof shaderEffects.updateEffectParam === "function") {
						shaderEffects.updateEffectParam("pixelSort", "sortAmount", angle);
					}
				}

				if (controller === 36) {
					const angle = int(map(value, 0, 127, 1, 64, true));
					if (typeof shaderEffects !== "undefined" && typeof shaderEffects.updateEffectParam === "function") {
						console.log("sampleCount", angle);
						shaderEffects.updateEffectParam("pixelSort", "sampleCount", angle);
					}
				}

				if (controller === 37) {
					const angle = map(value, 0, 127, 0.1, 5, true);
					if (typeof shaderEffects !== "undefined" && typeof shaderEffects.updateEffectParam === "function") {
						console.log("translationSpeed", angle);
						shaderEffects.updateEffectParam("symmetry", "translationSpeed", angle);
					}
				}

				if (controller === 38) {
					const angle = map(value, 0, 127, 0.1, 150, true);
					if (typeof shaderEffects !== "undefined" && typeof shaderEffects.updateEffectParam === "function") {
						console.log("rotationSpeed", angle);
						shaderEffects.updateEffectParam("symmetry", "rotationSpeed", angle);
					}
				}

				if (controller === 39) {
					const timeMultiplier = map(value, 0, 127, 0.0001, 0.1, true);
					if (typeof shaderEffects !== "undefined" && typeof shaderEffects.updateEffectParam === "function") {
						console.log("timeMultiplier", timeMultiplier);
						shaderEffects.updateEffectParam("symmetry", "timeMultiplier", timeMultiplier);
					}
				}
			}
		};
	});
}

let bgmode = 0;
let pressOnce = false;
let timer;

let h = 0;
let s = 0;

function checkMIDI() {
	//if any knob is changed, reset the particles

	if (kname == "32") {
		size = map(int(kval), 0, 100, 0.01, 0.5, true);
		//a = map(int(kval), 0, 100, 0, 100, true);
	}
	if (kname == "33") {
		h = int(map(int(kval), 0, 100, 0, 360, true));
	}
	if (kname == "34") {
		s = int(map(int(kval), 0, 100, 0, 100, true));
		//s = int(map(int(kval), 0, 100, -5, 5, true));
	}
	if (kname == "35") {
		//b = int(map(int(kval), 0, 100, 0, 100, true));
		b = int(map(int(kval), 0, 100, -5, 5, true));
	}
	if (kname == "36") {
		frame = int(map(int(kval), 0, 100, 0, framesMax / 4, true));
	}
	if (kname == "37") {
		frame = int(map(int(kval), 0, 100, framesMax / 4, framesMax / 3, true));
	}
	if (kname == "38") {
		frame = int(map(int(kval), 0, 100, framesMax / 3, framesMax / 2, true));
	}
	if (kname == "39") {
		frame = int(map(int(kval), 0, 100, framesMax / 2, framesMax, true));
	}
	if (kname == "40" && pressOnce == false) {
		particles = [];
		pressOnce = true;
		return;
	}

	if (kname == "41" && pressOnce == false) {
		particles = [];
		bgmode = 0;
		background(50, 5, 100);
		h = random(360);
		//drawTexture(h);
		blend_mode = "BLEND";
		pressOnce = true;
		return;
	}
	if (kname == "42" && pressOnce == false) {
		particles = [];
		bgmode = 1;
		background(50, 5, 10);
		h = random(360);
		blend_mode = "ADD";
		//drawTexture(h);
		pressOnce = true;
		return;
	}

	if (pressOnce == true) {
		kname = "";
		// set pressOnce to false after 1000ms
		timer = setTimeout(() => {
			pressOnce = false;
		}, 1000);
	} else {
		clearTimeout(timer);
	}
}
