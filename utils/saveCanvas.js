function keyPressed() {
	if (key == 's' || key == 'S') {
		saveArtwork();
	}
}

// make a function to save the canvas as a png file with the git branch name and a timestamp
function saveArtwork() {
	var timestamp = Date.now();
	save('artwork' + '-' + timestamp + '.png');
}
