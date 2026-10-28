export function githubLinks(repository,tag){
 if(typeof repository!=='string'||!/^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})$/.test(repository)||repository.includes('..'))throw new Error('无效 GitHub 仓库');
 const repo='https://github.com/'+repository;
 return {repository:repo,release:typeof tag==='string'&&tag.length>0&&tag.length<=100?repo+'/releases/tag/'+encodeURIComponent(tag):repo+'/releases'};
}
