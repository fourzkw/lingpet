import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {PACKAGE_ROOT} from '../src/paths.js';

// DSH 的客户端模块扫描（dsh-client-modules 的 locatePkgJson /
// exactPackageSpecifier）只会为「裸包名」specifier 解析 package.json。
// 早先这里用 `name: dsh-board-pet/plugin` 挂载宿主插件，扫描器直接返回
// undefined，整个包（包括浏览器 bundle）被静默跳过，DSH 设置界面因此
// 永远不会出现「桌宠」页签。这个测试把挂载名与客户端 bundle 的契约固定住。

function isResolvablePackageSpecifier(specifier){
  if(typeof specifier!=='string'||specifier.length===0)return false;
  if(specifier.startsWith('.')||specifier.startsWith('file:')||path.isAbsolute(specifier))return true;
  if(specifier.startsWith('@')){
    const parts=specifier.split('/');
    return parts.length===2&&parts.every(Boolean);
  }
  return !specifier.includes('/')&&!specifier.includes(':');
}

function insertEntryNames(patchYaml){
  return patchYaml
    .split(/\r?\n/)
    .map(line=>/^\s*name:\s*(\S+)\s*$/.exec(line))
    .filter(Boolean)
    .map(match=>match[1].replace(/^["']|["']$/g,''));
}

const pkg=JSON.parse(await readFile(path.join(PACKAGE_ROOT,'package.json'),'utf8'));
const patchPath=path.join(PACKAGE_ROOT,pkg.dsh?.bundle?.patch??'cordis.patch.yml');
const patchYaml=await readFile(patchPath,'utf8');

test('宿主插件以裸包名挂载，客户端模块扫描才能解析到 package.json',()=>{
  const names=insertEntryNames(patchYaml);
  assert.ok(names.length>0,'cordis.patch.yml 没有 insert 条目');
  assert.ok(names.includes(pkg.name),`cordis.patch.yml 必须以裸包名 ${pkg.name} 挂载宿主插件`);
  for(const name of names){
    assert.ok(isResolvablePackageSpecifier(name),`挂载名 "${name}" 不是裸包名：DSH 客户端模块扫描会静默跳过该包，设置页不会出现「桌宠」页签`);
  }
});

test('dsh.client 声明与 ./client 导出齐全，浏览器 bundle 的注册 id 等于包名',async()=>{
  const client=pkg.dsh?.client;
  assert.ok(client,'package.json 缺少 dsh.client');
  assert.equal(client.platform,'web');
  assert.ok(Array.isArray(client.inject),'dsh.client.inject 必须是数组');
  const entry=pkg.exports?.['./client'];
  const rel=typeof entry==='string'?entry:entry?.default;
  assert.equal(typeof rel,'string','package.json exports["./client"] 必须是字符串或 {default:string}');
  const bundlePath=path.join(PACKAGE_ROOT,rel);
  await access(bundlePath);
  const source=await readFile(bundlePath,'utf8');
  assert.ok(source.includes(`id:'${pkg.name}'`),`客户端 bundle 必须以 id:'${pkg.name}' 注册（DSH 要求注册 id 等于包名）`);
  assert.ok(source.includes('settings.section'),'客户端 bundle 应向 settings.section 注册设置页');
});
