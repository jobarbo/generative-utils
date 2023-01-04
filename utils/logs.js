//* CONSOLE LOGGING *//

function generateConsoleLogs(params) {
	//* UNPACK PARAMETERS *//
	// unpacking parameters we need in main.js and turning them into globals
	for (var key in params) {
		window[key] = params[key];
	}
	var jbarbeau_logo =
		'%c                                                                              \n' +
		'%c                                                                              \n' +
		'%c     Art by Jonathan Barbeau   |  { @jbarbeau.art }  |  2022                  \n' +
		'%c                                                                              \n' +
		'%c                                                                              \n';

	console.log(
		jbarbeau_logo,
		'color: white; background: #000000; font-weight: bold; font-family: "Courier New", monospace;margin-bottom:-1px;',
		'color: white; background: #000000; font-weight: bold; font-family: "Courier New", monospace;margin-bottom:-1px;',
		'color: white; background: #000000; font-weight: bold; font-family: "Courier New", monospace;margin-bottom:-1px;',
		'color: white; background: #000000; font-weight: bold; font-family: "Courier New", monospace;margin-bottom:-1px;',
		'color: white; background: #000000; font-weight: bold; font-family: "Courier New", monospace;margin-bottom:-1px;'
	);
	console.log(
		'%cLa nuit porte... de garage\n',
		'font-style: italic; font-family: "Courier New", monospace;'
	);

	// console table all params with their values
	console.table('%cTOKEN FEATURES', 'color: white; background: #000000;', '\n', params);

	console.log(
		'%cCONTROLS',
		'color: white; background: #000000;',
		'\n',
		'cmd + s   : save artwork with date',
		'\n'
	);
}
//* END CONSOLE LOGGING *//s
