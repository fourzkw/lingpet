const {spawn}=require('node:child_process');
const path=require('node:path');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(process.execPath,[path.join(__dirname,'../runtime/bin/cursor-hook.js'),...process.argv.slice(2)],{env,windowsHide:true,stdio:'inherit'});
child.on('error',()=>{process.stderr.write('[board-pet] Node hook launch failed.\n');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
