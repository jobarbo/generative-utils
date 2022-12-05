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
	var d = new Date();
	var datestring = dayoftheweek[d.getDay()] + '_' + d.getDate() + '_' + d.getMonth() + '_' + d.getFullYear() + '_' + d.getHours() + '_' + d.getMinutes() + '_' + d.getSeconds();
	var fileName = datestring + '.jpeg';
	save(fileName);
}
