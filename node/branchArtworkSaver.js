const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SAVE_ENDPOINT = "/__fx-save-artwork";
const MAX_IMAGE_BYTES = 150 * 1024 * 1024;

function getCurrentGitBranch(repoRoot) {
	const branch = execFileSync("git", ["branch", "--show-current"], {
		cwd: repoRoot,
		encoding: "utf8",
	}).trim();

	if (branch) return branch;

	const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
		cwd: repoRoot,
		encoding: "utf8",
	}).trim();
	return `detached-${commit}`;
}

function safePathPart(value, fallback) {
	const safe = String(value || "")
		.normalize("NFKC")
		.replace(/[\\/]/g, "-")
		.replace(/[<>:"|?*\x00-\x1f]/g, "-")
		.replace(/^\.+|\.+$/g, "")
		.trim();
	return safe || fallback;
}

function createBranchArtworkSaver(options = {}) {
	const repoRoot = options.repoRoot || process.cwd();
	const downloadsDirectory = options.downloadsDirectory || path.join(os.homedir(), "Downloads");

	return function branchArtworkSaver(req, res, next) {
		const requestPath = new URL(req.url, "http://localhost").pathname;
		if (requestPath !== SAVE_ENDPOINT || req.method !== "POST") {
			next();
			return;
		}

		if (!String(req.headers["content-type"] || "").startsWith("image/png")) {
			res.statusCode = 415;
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify({ error: "Expected an image/png request body" }));
			return;
		}

		const chunks = [];
		let size = 0;
		let tooLarge = false;

		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_IMAGE_BYTES) {
				tooLarge = true;
				return;
			}
			chunks.push(chunk);
		});

		req.on("end", () => {
			res.setHeader("Content-Type", "application/json");
			if (tooLarge) {
				res.statusCode = 413;
				res.end(JSON.stringify({ error: "PNG exceeds the 150 MB save limit" }));
				return;
			}

			try {
				const branch = getCurrentGitBranch(repoRoot);
				const branchFolder = safePathPart(branch, "unknown-branch");
				const requestedName = decodeURIComponent(String(req.headers["x-artwork-filename"] || "artwork.png"));
				const fileName = safePathPart(requestedName, "artwork.png");
				const pngFileName = fileName.toLowerCase().endsWith(".png") ? fileName : `${fileName}.png`;
				const outputDirectory = path.join(downloadsDirectory, branchFolder);
				const outputPath = path.join(outputDirectory, pngFileName);

				fs.mkdirSync(outputDirectory, { recursive: true });
				fs.writeFileSync(outputPath, Buffer.concat(chunks));

				res.statusCode = 201;
				res.end(JSON.stringify({ branch, branchFolder, fileName: pngFileName, outputPath }));
			} catch (error) {
				res.statusCode = 500;
				res.end(JSON.stringify({ error: error.message }));
			}
		});

		req.on("error", (error) => {
			if (res.writableEnded) return;
			res.statusCode = 500;
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify({ error: error.message }));
		});
	};
}

module.exports = {
	SAVE_ENDPOINT,
	createBranchArtworkSaver,
	getCurrentGitBranch,
	safePathPart,
};
