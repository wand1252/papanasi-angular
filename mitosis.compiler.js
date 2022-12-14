const glob = require('glob');
const fs = require('fs');
const prependFile = require('prepend-file');
const path = require('path');
const filesystemTools = require('gluegun/filesystem');
const stringTools = require('gluegun/strings');
const printTools = require('gluegun/print');
const config = require('./mitosis.config');
const htmlTags = require('html-tags');
const compileCommand = require('@builder.io/mitosis-cli/dist/commands/compile');

function compile(filepath) {
  const file = path.parse(filepath);

  const targets = process.argv.includes('--dev') ? ['react'] : config.targets;

  targets.forEach(async (target, i) => {
    const outPath = `${config.dest}/${target}`;
    const outFile = `${outPath}/${filepath.replace(`/${file.base}`, '')}.${config.extensions[i]}`;
    const isFirstCompilation = !fs.existsSync(`${outPath}/src`);

    if (isFirstCompilation) {
      // Copy basic files
      fs.mkdirSync(`${outPath}/src`);
      fs.copyFileSync('./src/index.ts', `${outPath}/src/index.ts`);
      fs.copyFileSync('./README.md', `${outPath}/README.md`);

      // Copy services
      function getServices() {
        return new Promise((resolve) => glob('./src/**/*.service.ts', (er, files) => resolve(files)));
      }

      const services = await getServices();
      services.forEach((element) => fs.copyFileSync(element, `${outPath}/src/${path.parse(element).base}`));
    }

    await compileCommand.run({
      parameters: {
        options: {
          from: 'mitosis',
          to: target,
          out: outFile,
          force: true,

          state: 'useState'
        },
        array: [filepath]
      },
      strings: stringTools.strings,
      filesystem: filesystemTools.filesystem,
      print: printTools.print
    });

    // Fix css imports
    const data = fs.readFileSync(outFile, 'utf8');
    const result = data
      // Meanwhile mitosis don't support import external types...
      .replace(
        'import',
        "import { Dynamic, SharedProps, Variant, Intent, BreakpointProps } from '../../../models';\nimport"
      )
      // Fix css import
      .replace(/import ("|')\.\/(.+)\.css("|')\;/g, "import '../../../src/$2/$2.css';");

    fs.writeFileSync(outFile, result, 'utf8');

    if (isFirstCompilation) {
      // Move Readme
      const data = fs.readFileSync('./README.md', 'utf8');
      const result = data.replace(/\/\{platform\}.+/g, `/${target + (target === 'webcomponent' ? 's' : '')}`);

      fs.writeFileSync(`${outPath}/README.md`, result, 'utf8');
    }

    if (target === 'angular') {
      const data = fs.readFileSync(outFile, 'utf8');
      const result = data
        // Add selector to be a directive because in angular you cannot use existing tags
        .replace(
          /selector: ?["|'](.+)["|']/,
          `selector: "${
            !htmlTags.includes(file.name.replace('.lite', '')) ? '$1,' : ''
          }[pa-$1]", exportAs: "pa-$1", encapsulation: 2`
        )
        // Enable children
        .replace(/(,\n)?(\} from \"\@angular\/core\"\;)/, ', ContentChildren, QueryList $2')
        .replace(
          /\@Input\(\) className\: any\;/,
          "@Input() className: any;\n@ContentChildren('child') children: QueryList<any>;"
        )
        // Fix value names on selectors
        .replace(/='value\((.*, ?)'(.*)'\)'/g, '="value($1\'$2\')"')
        // Fix angular styles property
        .replace(/\[style\]/g, '[ngStyle]');

      fs.writeFileSync(outFile, result, 'utf8');
    }

    if (target === 'react') {
      const data = fs.readFileSync(outFile, 'utf8');
      const result = data
        // fix contenteditable
        .replace(/contentEditable\=(.*)/g, 'contentEditable=$1\nsuppressContentEditableWarning={true}');
      fs.writeFileSync(outFile, result, 'utf8');
    }

    if (target === 'svelte' && isFirstCompilation) {
      const data = fs.readFileSync(`${outPath}/src/index.ts`, 'utf8');
      const result = data
        // Add .svelte to index
        .replace(/\'\;/g, ".svelte';")
        .replace(/\.css\.svelte/g, '.css')
        .replace(/helpers\.svelte/g, 'helpers')
        .replace(/src\/(.*)\.svelte/g, 'src/$1');

      fs.writeFileSync(`${outPath}/src/index.ts`, result, 'utf8');
    }

    if (target === 'svelte') {
      const data = fs.readFileSync(outFile, 'utf8');
      const result = data
        // Work with children (currently not working as expected)
        .replace(/children/g, '$$$slots')
        // Fix circle svg as component
        .replace(/state\./g, '')
        // Svelte compiler is not adding let to the state values
        .replace(/^  (\w*) = (.*)/gm, '  let $1 = $2')
        // Fix state in svelte
        .replace(/svelte:component\n.*this=\{circle\}/g, 'circle');

      fs.writeFileSync(outFile, result, 'utf8');
    }

    if (target === 'vue' && isFirstCompilation) {
      const data = fs.readFileSync(`${outPath}/src/index.ts`, 'utf8');
      const result = data
        // Add .vue to index
        .replace(/\'\;/g, ".vue';")
        .replace(/\.css\.vue/g, '.css')
        .replace(/helpers\.vue/g, 'helpers')
        .replace(/src\/(.*)\.vue/g, 'src/$1');

      fs.writeFileSync(`${outPath}/src/index.ts`, result, 'utf8');
    }

    if (target === 'vue') {
      const data = fs.readFileSync(outFile, 'utf8');
      const result = data
        // Enable children
        .replace(/this\.children/, 'this.$slots.default()');

      fs.writeFileSync(outFile, result, 'utf8');
    }

    if (target === 'webcomponent') {
      // Ignore types
      prependFile.sync(outFile, '//@ts-nocheck \n');

      // Make component exportable
      const data = fs.readFileSync(outFile, 'utf8');
      const result = data
        // Fix class name
        .replace(/class /, 'export default class ')
        .replace(
          /customElements\.define\("(.*)",(.*)\);/g,
          'customElements.get("pa-$1") || customElements.define("pa-$1", $2);'
        )
        // Fix part selectors
        .replace(/class=/g, 'part=')
        .replace(/el\.setAttribute\("class"/g, 'el.setAttribute("part"')
        .replace(/el\.className ?= ?\n?(.*);/g, 'el.setAttribute("part",$1);')
        // Enable children
        .replace(
          /this\.props\.children/,
          'this.shadowRoot.querySelector("slot").assignedNodes().filter((x,i) => i % 2 !== 0 )'
        );
      fs.writeFileSync(outFile, result, 'utf8');
    }
  });
}

glob(config.files, (er, files) => files.forEach((element) => compile(element)));
