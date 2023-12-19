// if cmd + s is pressed, save the canvas'
function saveCanvas(event) {
	if (event.key === "s" && (event.metaKey || event.ctrlKey)) {
		saveArtwork();
		// Prevent the browser from saving the page
		event.preventDefault();
		return false;
	}
}

// Example usage to add an event listener for key presses
document.addEventListener("keydown", saveCanvas);

// make a function to save the canvas as a png file with the git branch name and a timestamp
function saveArtwork() {
	var dom_spin = document.querySelector(".spin-container");
	var canvas = document.getElementById("defaultCanvas0");
	var d = new Date();
	var datestring =
		d.getDate() +
		"_" +
		`${d.getMonth() + 1}` +
		"_" +
		d.getFullYear() +
		"_" +
		`${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
	console.log(canvas);
	var fileName = datestring + ".png";
	const imageUrl = canvas
		.toDataURL("image/png")
		.replace("image/png", "image/octet-stream");
	const a = document.createElement("a");
	a.href = imageUrl;
	a.setAttribute("download", fileName);
	a.click();

	dom_spin.classList.remove("active");
	console.log("saved " + fileName);
}
