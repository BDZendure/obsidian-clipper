const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function setup() {
	class TFile { constructor(path) { this.path = path; } }
	const files = new Map();
	const contents = new Map();
	const opened = [];
	const module = { exports: {} };
	let clipboardReads = 0;
	vm.runInNewContext(readFileSync(`${__dirname}/main.js`, 'utf8'), {
		module,
		require: () => ({ Plugin: class {}, TFile, Notice: class {}, normalizePath: p => p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '') }),
		navigator: { clipboard: { readText: async () => { clipboardReads++; return 'clipboard content'; } } },
		console,
	});
	const plugin = new module.exports();
	plugin.app = {
		vault: {
			getAbstractFileByPath: path => files.get(path),
			createFolder: async path => files.set(path, {}),
			create: async (path, content) => {
				assert.equal(files.has(path), false);
				const file = new TFile(path);
				files.set(path, file);
				contents.set(path, content);
				return file;
			},
		},
		workspace: { getLeaf: newLeaf => {
			assert.equal(newLeaf, false);
			return { openFile: async file => opened.push(file.path) };
		} },
	};
	return { plugin, files, contents, opened, clipboardReads: () => clipboardReads };
}

test('repeated clipping opens the exact existing path without changing content or making a suffix', async () => {
	const s = setup();
	await s.plugin.clip({ file: 'Clips/Article', content: 'original' });
	await s.plugin.clip({ file: 'Clips/Article', content: 'replacement', clipboard: '', silent: 'true' });
	assert.equal(s.contents.get('Clips/Article.md'), 'original');
	assert.deepEqual([...s.contents.keys()], ['Clips/Article.md']);
	assert.deepEqual(s.opened, ['Clips/Article.md', 'Clips/Article.md']);
	assert.equal(s.clipboardReads(), 0);
});

test('new clips support clipboard, explicit .md extension, and silent creation', async () => {
	const s = setup();
	await s.plugin.clip({ file: 'Article.md', clipboard: '', silent: 'true' });
	assert.equal(s.contents.get('Article.md'), 'clipboard content');
	assert.deepEqual(s.opened, []);
});

test('rejects traversal and folder collisions without writing', async () => {
	const s = setup();
	await assert.rejects(s.plugin.clip({ file: '../Article', content: 'bad' }));
	s.files.set('Folder.md', {});
	await assert.rejects(s.plugin.clip({ file: 'Folder.md', content: 'bad' }));
	assert.equal(s.contents.size, 0);
});
