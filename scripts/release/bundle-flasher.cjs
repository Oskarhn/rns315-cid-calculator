"use strict";
const path=require('node:path');
require('esbuild').build({entryPoints:[path.join(__dirname,'flasher-entry.js')],bundle:true,format:'iife',globalName:'Rns315FlashLibrary',platform:'browser',target:'es2022',minify:true,legalComments:'inline',write:false}).then(result=>process.stdout.write(result.outputFiles[0].text)).catch(error=>{console.error(error);process.exitCode=1;});
