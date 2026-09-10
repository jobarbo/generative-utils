/**
 * MIDI live-control registry + knob smoothing.
 *
 * Device I/O lives in public/midi/s1Midi.js (Roland S-1 presets) and
 * public/scene/sceneMidi.js (learn bindings). This file only holds shared state.
 */

let knob = Array(128).fill(0);

// Smooth interpolation for knob-driven shader params
// Each entry: { current, target, speed, effect, param }
const knobSmoothing = {};

/**
 * Registry of MIDI-driven shader params, mirroring audioKnob's live/override
 * interface so shaderEffectsPanel can show a "live" indicator and let the
 * user take manual control from the panel.
 */
const midiLiveControl = {
	mappings: new Map(), // "effect.param" -> {effectName, paramName, label}
	overrides: new Set(),
	_key(effectName, paramName) {
		return `${effectName}.${paramName}`;
	},
	register(effectName, paramName, label) {
		this.mappings.set(this._key(effectName, paramName), {effectName, paramName, label});
	},
	getMapping(effectName, paramName) {
		return this.mappings.get(this._key(effectName, paramName)) || null;
	},
	isLive(effectName, paramName) {
		return !this.overrides.has(this._key(effectName, paramName)) && this.mappings.has(this._key(effectName, paramName));
	},
	overrideParam(effectName, paramName) {
		this.overrides.add(this._key(effectName, paramName));
		return this;
	},
	releaseParam(effectName, paramName) {
		this.overrides.delete(this._key(effectName, paramName));
		return this;
	},
};

function addKnobSmooth(controller, effect, param, initial = 0, speed = 0.08) {
	knobSmoothing[controller] = {current: initial, target: initial, speed, effect, param};
	midiLiveControl.register(effect, param, `MIDI CC${controller}`);
}

function updateKnobSmoothing() {
	for (const ctrl in knobSmoothing) {
		const s = knobSmoothing[ctrl];
		if (Math.abs(s.target - s.current) < 0.0001) continue;
		s.current += (s.target - s.current) * s.speed;
		if (midiLiveControl.overrides.has(midiLiveControl._key(s.effect, s.param))) continue;
		if (typeof shaderEffects !== "undefined") {
			shaderEffects.updateEffectParam(s.effect, s.param, s.current);
		}
	}
}

window.midiLiveControl = midiLiveControl;
window.addKnobSmooth = addKnobSmooth;
window.updateKnobSmoothing = updateKnobSmoothing;
window.knobSmoothing = knobSmoothing;
