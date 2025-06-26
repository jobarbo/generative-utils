//* CONSOLE LOGS AND ALL *//

// Enhanced logging system with categories and clean formatting
const Logger = {
	// Styling constants
	styles: {
		header: 'color: white; background: #2c3e50; font-weight: bold; font-family: "Courier New", monospace; padding: 2px 8px;',
		success: 'color: #27ae60; font-weight: bold; font-family: "Courier New", monospace;',
		info: 'color: #3498db; font-family: "Courier New", monospace;',
		warning: 'color: #f39c12; font-weight: bold; font-family: "Courier New", monospace;',
		error: 'color: #e74c3c; font-weight: bold; font-family: "Courier New", monospace;',
		debug: 'color: #9b59b6; font-family: "Courier New", monospace;',
		animation: 'color: #16a085; font-family: "Courier New", monospace;',
		memory: 'color: #f1c40f; font-family: "Courier New", monospace; font-weight: bold;',
	},

	// Generic logging methods
	header(title, data = null) {
		console.log(`%c${title}`, this.styles.header);
		if (data) console.log(data);
	},

	success(message) {
		console.log(`%c✓ ${message}`, this.styles.success);
	},

	info(message, data = null) {
		console.log(`%cℹ ${message}`, this.styles.info);
		if (data) console.log(data);
	},

	warning(message) {
		console.log(`%c⚠ ${message}`, this.styles.warning);
	},

	error(message) {
		console.log(`%c✗ ${message}`, this.styles.error);
	},

	debug(message, data = null) {
		console.log(`%c🔧 ${message}`, this.styles.debug);
		if (data) console.log(data);
	},

	table(title, data) {
		console.log(`%c📊 ${title}`, this.styles.info);
		console.table(data);
	},

	// Specialized logging methods
	animation: {
		progress(current, total, extra = "") {
			const percentage = Math.round((current / total) * 100);
			console.log(`%c🎬 Frame ${current}/${total} (${percentage}%) ${extra}`, Logger.styles.animation);
		},

		complete(info) {
			console.log(`%c🎉 Animation Complete!`, Logger.styles.success);
			console.table({
				"Total Frames": info.totalFrames,
				"Saved Images": info.totalSavedFrames,
				Cycles: info.totalCycles,
			});
		},

		cycle(cycleCount) {
			console.log(`%c🔄 Cycle ${cycleCount} completed`, Logger.styles.animation);
		},

		variables(vars) {
			console.log(`%c🎛 Animation Variables:`, Logger.styles.debug);
			console.table(vars);
		},
	},

	memory: {
		usage(used, total, limit) {
			const percentage = Math.round((used / limit) * 100);
			const style = percentage > 80 ? Logger.styles.error : Logger.styles.memory;
			console.log(`%c🧠 Memory: ${used}MB / ${total}MB (${percentage}% of ${limit}MB limit)`, style);
		},

		cleanup(type) {
			console.log(`%c🧹 Memory cleanup: ${type}`, Logger.styles.memory);
		},
	},

	setup: {
		features(features) {
			Logger.header("🎨 TOKEN FEATURES");
			console.table(features);
		},

		variables(vars) {
			Logger.header("⚙️ SETUP VARIABLES");
			console.table(vars);
		},

		controls() {
			Logger.header("🎮 CONTROLS");
			console.log("%ccmd + s : save artwork with timestamp", Logger.styles.info);
		},
	},
};

function generateConsoleLogs(params) {
	//* UNPACK PARAMETERS *//
	// unpacking parameters we need in main.js and turning them into globals
	for (var key in params) {
		window[key] = params[key];
	}

	// Clean header with better spacing
	var jbarbeau_logo =
		"%c                                                                              \n" +
		"%c     Art by Jonathan Barbeau   |  { @jbarbeau.art }  |  2022                  \n" +
		"%c                                                                              \n";

	console.log(
		jbarbeau_logo,
		'color: white; background: #000000; font-weight: bold; font-family: "Courier New", monospace;',
		'color: white; background: #000000; font-weight: bold; font-family: "Courier New", monospace;',
		'color: white; background: #000000; font-weight: bold; font-family: "Courier New", monospace;'
	);

	console.log("%c🌙 La nuit porte... de garage", 'font-style: italic; font-family: "Courier New", monospace; color: #7f8c8d;');
	console.log(""); // Empty line for spacing

	// Use new logging system
	Logger.setup.features(params);
	Logger.setup.controls();
}

// Make Logger globally available
window.Logger = Logger;

//* END CONSOLE LOGGING *//
