const fs = require("fs");
const os = require("os");
const path = require("path");

const SAVE_ENDPOINT = "/__fx-save-artwork";
const MAX_IMAGE_BYTES = 150 * 1024 * 1024;

/**
 * Branch name from .git/HEAD. Avoids spawning git: this dev server often runs
 * as x86_64 under Rosetta, and /usr/bin/git then fails in xcrun because the
 * Command Line Tools dylib is arm64-only.
 */
function getCurrentGitBranch(repoRoot) {
	let gitPath = path.join(repoRoot, ".git");
	const stat = fs.lstatSync(gitPath);

	if (stat.isFile()) {
		const contents = fs.readFileSync(gitPath, "utf8").trim();
		const gitdir = contents.match(/^gitdir:\s*(.+)$/);
		if (!gitdir) throw new Error("Unrecognized .git file");
		gitPath = path.resolve(path.dirname(gitPath), gitdir[1]);
	}

	const head = fs.readFileSync(path.join(gitPath, "HEAD"), "utf8").trim();
	const ref = head.match(/^ref:\s+refs\/heads\/(.+)$/);
	if (ref) return ref[1];

	if (/^[0-9a-f]{7,40}$/i.test(head)) return `detached-${head.slice(0, 7)}`;
	throw new Error(`Unrecognized git HEAD: ${head}`);
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
