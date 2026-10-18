const { Plugin, TFile, Notice, normalizePath } = require('obsidian');

module.exports = class WebClipperCreateOrOpen extends Plugin {
	onload() {
		// Serialize clips so simultaneous requests cannot create duplicate notes.
		this.pending = Promise.resolve();
		this.registerObsidianProtocolHandler('web-clipper', (params) => {
			this.pending = this.pending.then(() => this.clip(params)).catch((error) => {
				console.error('Web Clipper:', error);
				new Notice(`Web Clipper: ${error.message}`);
			});
			return this.pending;
		});
	}

	async clip(params) {
		if (!params.file || params.file.split(/[\\/]/).includes('..')) {
			throw new Error('Invalid destination path');
		}
		let path = normalizePath(params.file);
		if (!path.endsWith('.md')) path += '.md';
		let file = this.app.vault.getAbstractFileByPath(path);
		let existed = file instanceof TFile;
		if (file && !existed) throw new Error('The destination is a folder');
		if (!file) {
			// Read the clipboard only for new files. A failed read must not save
			// the extension's clipboard-error fallback as the note's content.
			const content = 'clipboard' in params
				? await navigator.clipboard.readText()
				: params.content ?? '';
			const parent = path.slice(0, path.lastIndexOf('/') + 1);
			if (parent && !this.app.vault.getAbstractFileByPath(parent.slice(0, -1))) {
				await this.app.vault.createFolder(parent.slice(0, -1));
			}
			try {
				file = await this.app.vault.create(path, content);
			} catch (error) {
				// Another writer may have created the exact path while we waited.
				file = this.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) throw error;
				existed = true;
			}
		}
		// Existing notes always open; silent mode still applies to new clips.
		if (existed || !('silent' in params)) {
			await this.app.workspace.getLeaf(false).openFile(file, { active: true });
		}
	}
};
