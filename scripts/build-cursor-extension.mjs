import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {PACKAGE_ROOT} from '../src/paths.js';

const out=path.resolve(process.argv[2]||path.join(PACKAGE_ROOT,'artifacts/cursor-sidebar-'+Date.now()));
const plugin=path.resolve(process.argv[3]||path.join(PACKAGE_ROOT,'artifacts/cursor-board-pet-0.3.0-win-x64'));
await mkdir(out,{recursive:false});
await cp(path.join(PACKAGE_ROOT,'cursor-extension'),path.join(out,'extension'),{recursive:true});
await cp(plugin,path.join(out,'extension/cursor-plugin'),{recursive:true});
const pkg=JSON.parse(await readFile(path.join(out,'extension/package.json'),'utf8'));
await writeFile(path.join(out,'extension.vsixmanifest'),`<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
<Metadata><Identity Language="en-US" Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}"/><DisplayName>${pkg.displayName}</DisplayName><Description xml:space="preserve">${pkg.description}</Description><Tags>cursor,desktop,pet</Tags><Categories>Other</Categories><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${pkg.engines.vscode}"/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui"/></Properties></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" Version="[1.90.0,)"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/></Assets></PackageManifest>`);
await writeFile(path.join(out,'[Content_Types].xml'),'<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="svg" ContentType="image/svg+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="css" ContentType="text/css"/><Default Extension="html" ContentType="text/html"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="exe" ContentType="application/octet-stream"/><Default Extension="dll" ContentType="application/octet-stream"/><Default Extension="node" ContentType="application/octet-stream"/><Default Extension="dat" ContentType="application/octet-stream"/><Default Extension="bin" ContentType="application/octet-stream"/><Default Extension="pak" ContentType="application/octet-stream"/><Default Extension="txt" ContentType="text/plain"/></Types>');
console.log(out);
