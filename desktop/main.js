import {app,dialog} from 'electron';
import {dataDirectory} from '../src/paths.js';
import {launchDesktop} from '../src/desktop-runtime.js';
app.setName('灵伴');
const dir=dataDirectory();
app.setPath('userData',dir);
if(!app.requestSingleInstanceLock())app.quit();
else void launchDesktop(dir).catch(error=>{console.error(error);dialog.showErrorBox('桌宠启动失败',String(error.message));app.quit();});
