// if cmd + s is pressed, save the canvas'
function keyPressed() {
	if (key == 's' && (keyIsDown(91) || keyIsDown(93))) {
		saveArtwork();
		// prevent the browser from saving the page
		return false;
	}
}

// make a function to save the canvas as a png file with the git branch name and a timestamp
function saveArtwork() {
	var dayoftheweek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
	var monthoftheyear = [
		'january',
		'february',
		'march',
		'april',
		'may',
		'june',
		'july',
		'august',
		'september',
		'october',
		'november',
		'december',
	];
	var d = new Date();
	var datestring =
		d.getDate() +
		'_' +
		`${d.getMonth() + 1}` +
		'_' +
		d.getFullYear() +
		'_' +
		`${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
	var fileName = datestring + '.png';

	save(fileName);
	console.log('saved ' + fileName);
}
