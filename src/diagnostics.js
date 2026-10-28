export function diagnosticReport({release,pets,sessions,uptime,memory,logs,update,platform,login}){
  return {schemaVersion:1,createdAt:new Date().toISOString(),version:release.version,backendHash:release.backendHash,frontendHash:release.frontendHash,platform,uptimeSeconds:Math.floor(uptime),memory,login,update,
    pets:pets.map(p=>({name:p.name,visible:p.enabled!==false&&p.petVisible!==false,variant:p.variant,scale:p.scale,followMode:p.follow.mode,source:p.follow.source??'all'})),
    connections:{total:sessions.length,connected:sessions.filter(s=>s.connected).length,sources:[...new Set(sessions.map(s=>s.source).filter(Boolean))]},logs};
}
