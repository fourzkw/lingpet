const root=document.getElementById('downloadCards'),status=document.getElementById('downloadStatus');
function element(tag,content){const e=document.createElement(tag);e.textContent=content;return e;}
const card=element('article','');card.className='download-card';
const icon=element('span','↗');icon.className='download-host-icon';icon.setAttribute('aria-hidden','true');
const kind=element('p','WINDOWS · 桌面安装程序');kind.className='download-kind';
const link=element('a','前往 GitHub 下载 Windows 版 ↗');link.className='button primary';link.href='/downloads/desktop';link.id='download-desktop';link.target='_blank';link.rel='noopener noreferrer';
const help=element('a','查看安装指引');help.className='install-link';help.href='#install';
card.append(icon,kind,element('h3','灵伴桌面版'),element('p','安装一次，在灵伴内接入 Cursor、Codex 或 DSH。'),link,help);
root.replaceChildren(card);root.setAttribute('aria-busy','false');
status.textContent='前往 GitHub Release，在版本附件中选择 LingPet-Setup 安装程序。';