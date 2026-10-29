import {rename} from 'node:fs/promises';

// Windows scanners may briefly hold a newly written directory open. Retry the
// same atomic rename; never delete or replace a destination to force success.
export async function publishDirectory(from,to,{move=rename,platform=process.platform,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  for(let attempt=0;;attempt++){
    try{return await move(from,to);}
    catch(error){
      if(platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=7)throw error;
      await wait(50*(attempt+1));
    }
  }
}
// The same bounded rename retry applies to atomic file replacement on Windows.
export const atomicRename=publishDirectory;
