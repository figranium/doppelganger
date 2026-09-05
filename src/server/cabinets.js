const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('jszip');
const { CABINETS_DIR } = require('./constants');
const { Mutex } = require('./utils');

const catalogFile = path.join(CABINETS_DIR, 'catalog.json');
const lock = new Mutex();
let catalog = null;
const id = (prefix) => `${prefix}_${crypto.randomBytes(10).toString('hex')}`;
const safeName = (name, fallback = 'download') => {
    const value = path.basename(String(name || fallback)).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
    return value.slice(0, 180) || fallback;
};
const itemDir = (cabinetId, itemId) => path.join(CABINETS_DIR, cabinetId, itemId);
const uniqueName = (cabinet, name) => {
    const ext = path.extname(name); const stem = ext ? name.slice(0, -ext.length) : name;
    let candidate = name; let index = 2;
    const used = new Set((cabinet.items || []).map(i => i.name.toLowerCase()));
    while (used.has(candidate.toLowerCase())) candidate = `${stem} (${index++})${ext}`;
    return candidate;
};
async function save() {
    await fs.promises.mkdir(CABINETS_DIR, { recursive: true });
    const temp = `${catalogFile}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(temp, JSON.stringify(catalog, null, 2));
    await fs.promises.rename(temp, catalogFile);
}
async function ensure() {
    if (!catalog) { try { catalog = JSON.parse(await fs.promises.readFile(catalogFile, 'utf8')); } catch { catalog = null; } }
    if (!catalog || !Array.isArray(catalog.cabinets)) {
        const basic = { id: 'cab_basic', name: 'Basic Cabinet', createdAt: Date.now(), items: [] };
        catalog = { version: 1, defaultCabinetId: basic.id, cabinets: [basic], legacyPaths: {} };
        await save();
    }
    if (!catalog.cabinets.length) {
        const basic = { id: 'cab_basic', name: 'Basic Cabinet', createdAt: Date.now(), items: [] };
        catalog.cabinets.push(basic); catalog.defaultCabinetId = basic.id; await save();
    }
    if (!catalog.cabinets.some(c => c.id === catalog.defaultCabinetId)) { catalog.defaultCabinetId = catalog.cabinets[0].id; await save(); }
    if (!catalog.migratedLegacy) {
        catalog.legacyPaths = catalog.legacyPaths || {};
        const basic = findCabinet(catalog.defaultCabinetId);
        const roots = [path.join(__dirname, '../../../public/captures'), path.join(__dirname, '../../../src/public/captures')];
        for (const root of roots) {
            let names = []; try { names = await fs.promises.readdir(root); } catch { continue; }
            for (const legacyName of names.filter(n => /_dl_\d+_/i.test(n))) {
                const legacyPath = path.join(root, legacyName);
                let stat; try { stat = await fs.promises.stat(legacyPath); } catch { continue; }
                if (!stat.isFile()) continue;
                const display = uniqueName(basic, safeName(legacyName.replace(/^.*?_dl_\d+_/, '')));
                const itemId = id('item'); const dir = itemDir(basic.id, itemId); await fs.promises.mkdir(dir, { recursive: true });
                await fs.promises.rename(legacyPath, path.join(dir, display));
                const item = { id: itemId, name: display, kind: 'file', status: 'unuploaded', size: stat.size, createdAt: stat.mtimeMs || Date.now(), storageName: display, legacyName };
                basic.items.push(item); catalog.legacyPaths[legacyName] = { cabinetId: basic.id, itemId };
            }
        }
        catalog.migratedLegacy = true;
        await save();
    }
    return catalog;
}
const publicCabinet = c => ({ id: c.id, name: c.name, createdAt: c.createdAt, isDefault: c.id === catalog.defaultCabinetId, itemCount: (c.items || []).length, unuploadedCount: (c.items || []).filter(i => i.status !== 'uploaded').length });
async function withLock(fn) { await lock.lock(); try { await ensure(); return await fn(); } finally { lock.unlock(); } }
function findCabinet(cabinetId) { return catalog.cabinets.find(c => c.id === cabinetId) || catalog.cabinets.find(c => c.id === catalog.defaultCabinetId); }
function findExact(cabinetId) { return catalog.cabinets.find(c => c.id === cabinetId); }
async function listCabinets() { await ensure(); return { defaultCabinetId: catalog.defaultCabinetId, cabinets: catalog.cabinets.map(publicCabinet) }; }
async function createCabinet(name) { return withLock(async () => { const clean = String(name || '').trim().slice(0, 80); if (!clean) throw new Error('Cabinet name is required.'); if (catalog.cabinets.some(c => c.name.toLowerCase() === clean.toLowerCase())) throw new Error('A cabinet already has that name.'); const c = { id: id('cab'), name: clean, createdAt: Date.now(), items: [] }; catalog.cabinets.push(c); await save(); return publicCabinet(c); }); }
async function renameCabinet(cabinetId, name) { return withLock(async () => { const c = findExact(cabinetId); const clean = String(name || '').trim().slice(0, 80); if (!c || !clean) throw new Error('Cabinet not found or name invalid.'); if (catalog.cabinets.some(x => x.id !== c.id && x.name.toLowerCase() === clean.toLowerCase())) throw new Error('A cabinet already has that name.'); c.name = clean; await save(); return publicCabinet(c); }); }
async function listItems(cabinetId) { await ensure(); const c = findExact(cabinetId); if (!c) throw new Error('Cabinet not found.'); return (c.items || []).slice().sort((a,b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)); }
async function addFile(cabinetId, sourcePath, name, meta = {}) { return withLock(async () => { const c = findCabinet(cabinetId); const itemId = id('item'); const display = uniqueName(c, safeName(name)); const dir = itemDir(c.id, itemId); await fs.promises.mkdir(dir, { recursive: true }); const destination = path.join(dir, display); await fs.promises.rename(sourcePath, destination); const stat = await fs.promises.stat(destination); const item = { id: itemId, name: display, kind: 'file', status: 'unuploaded', size: stat.size, createdAt: Date.now(), storageName: display, ...meta }; c.items.push(item); await save(); return { cabinetId: c.id, item }; }); }
async function saveDownload(cabinetId, download, name, meta = {}) { return withLock(async () => { const c = findCabinet(cabinetId); const itemId = id('item'); const display = uniqueName(c, safeName(name)); const dir = itemDir(c.id, itemId); await fs.promises.mkdir(dir, { recursive: true }); const destination = path.join(dir, display); await download.saveAs(destination); const stat = await fs.promises.stat(destination); const item = { id: itemId, name: display, kind: 'file', status: 'unuploaded', size: stat.size, createdAt: Date.now(), storageName: display, ...meta }; c.items.push(item); await save(); return { cabinetId: c.id, item }; }); }
async function getItem(cabinetId, itemId) { await ensure(); const c = findExact(cabinetId); const item = c?.items?.find(i => i.id === itemId); if (!c || !item) throw new Error('Cabinet item not found.'); return { cabinet: c, item, path: path.join(itemDir(c.id, item.id), item.storageName) }; }
async function resolveLegacyPath(name) { await ensure(); const entry = catalog.legacyPaths?.[name]; return entry ? getItem(entry.cabinetId, entry.itemId) : null; }
async function latestUnuploaded(cabinetId) { await ensure(); const c = findCabinet(cabinetId); const item = (c.items || []).filter(i => i.status !== 'uploaded').sort((a,b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))[0]; if (!item) throw new Error('No unuploaded items in this cabinet.'); return getItem(c.id, item.id); }
async function setStatus(cabinetId, itemIds, status) { return withLock(async () => { const c = findExact(cabinetId); if (!c || !['uploaded','unuploaded'].includes(status)) throw new Error('Invalid cabinet status request.'); const wanted = new Set(itemIds || []); c.items.forEach(i => { if (wanted.has(i.id)) i.status = status; }); await save(); return c.items.filter(i => wanted.has(i.id)); }); }
async function removeItems(cabinetId, itemIds) { return withLock(async () => { const c = findExact(cabinetId); if (!c) throw new Error('Cabinet not found.'); const wanted = new Set(itemIds || []); const removed = c.items.filter(i => wanted.has(i.id)); for (const item of removed) await fs.promises.rm(itemDir(c.id, item.id), { recursive: true, force: true }); c.items = c.items.filter(i => !wanted.has(i.id)); await save(); return removed; }); }
async function clearCabinet(cabinetId) { await ensure(); const c = findExact(cabinetId); return removeItems(cabinetId, c?.items?.map(i => i.id) || []); }
async function rewriteReferences(fromId, toId) { const { loadTasks, saveTasks } = require('./storage'); const tasks = await loadTasks(); const rewrite = task => { if (task.downloadCabinetId === fromId) task.downloadCabinetId = toId; (task.actions || []).forEach(a => { if (a.cabinetId === fromId) a.cabinetId = toId; }); (task.versions || []).forEach(v => v.snapshot && rewrite(v.snapshot)); };
    tasks.forEach(rewrite); await saveTasks(tasks);
}
async function deleteCabinet(cabinetId, targetId, migrate) { return withLock(async () => { const c = findExact(cabinetId); const target = findExact(targetId); if (!c || !target || c.id === target.id) throw new Error('Choose a different replacement cabinet.'); if (catalog.cabinets.length < 2) throw new Error('At least one cabinet must remain.'); if (migrate) { for (const item of c.items || []) { const nextName = uniqueName(target, item.name); const nextDir = itemDir(target.id, item.id); await fs.promises.mkdir(path.dirname(nextDir), { recursive: true }); await fs.promises.rename(itemDir(c.id, item.id), nextDir); item.name = nextName; item.storageName = item.storageName; target.items.push(item); } }
        else { for (const item of c.items || []) await fs.promises.rm(itemDir(c.id, item.id), { recursive: true, force: true }); }
        await fs.promises.rm(path.join(CABINETS_DIR, c.id), { recursive: true, force: true }); catalog.cabinets = catalog.cabinets.filter(x => x.id !== c.id); if (catalog.defaultCabinetId === c.id) catalog.defaultCabinetId = target.id; await rewriteReferences(c.id, target.id); await save(); return listCabinets(); }); }
async function zipItems(cabinetId, itemIds, archiveName) { return withLock(async () => { const c = findExact(cabinetId); const items = c?.items?.filter(i => (itemIds || []).includes(i.id)) || []; if (!c || !items.length) throw new Error('Select at least one item.'); const zip = new JSZip(); const add = async (source, prefix) => { const stat = await fs.promises.stat(source); if (stat.isDirectory()) { for (const child of await fs.promises.readdir(source)) await add(path.join(source, child), `${prefix}/${child}`); } else zip.file(prefix, await fs.promises.readFile(source)); };
        for (const item of items) await add(path.join(itemDir(c.id,item.id), item.storageName), item.name);
        const itemId = id('item'); const name = uniqueName(c, safeName(archiveName || `archive-${Date.now()}.zip`)); const dir = itemDir(c.id,itemId); await fs.promises.mkdir(dir,{recursive:true}); await fs.promises.writeFile(path.join(dir,name), await zip.generateAsync({type:'nodebuffer'})); const stat=await fs.promises.stat(path.join(dir,name)); c.items.push({id:itemId,name,kind:'file',status:'unuploaded',size:stat.size,createdAt:Date.now(),storageName:name}); for (const item of items) await fs.promises.rm(itemDir(c.id,item.id),{recursive:true,force:true}); c.items=c.items.filter(i=>!items.includes(i)); await save(); return c.items[c.items.length-1]; }); }
async function unzipItem(cabinetId,itemId) { return withLock(async()=>{ const c=findExact(cabinetId); const source=c?.items?.find(i=>i.id===itemId); if(!c||!source||!source.name.toLowerCase().endsWith('.zip')) throw new Error('Select a ZIP file.'); const zip=await JSZip.loadAsync(await fs.promises.readFile(path.join(itemDir(c.id,source.id),source.storageName))); const nextId=id('item'); const folder=uniqueName(c,safeName(source.name.replace(/\.zip$/i,''),'extracted')); const root=path.join(itemDir(c.id,nextId),folder); for(const entry of Object.values(zip.files)){ if(entry.dir) continue; const rel=entry.name.replace(/\\/g,'/'); if(rel.startsWith('/')||rel.split('/').includes('..')) throw new Error('Unsafe ZIP entry.'); const target=path.join(root,rel); if(!target.startsWith(root+path.sep)) throw new Error('Unsafe ZIP entry.'); await fs.promises.mkdir(path.dirname(target),{recursive:true}); await fs.promises.writeFile(target,await entry.async('nodebuffer')); } const size=async p=>{const s=await fs.promises.stat(p); if(!s.isDirectory())return s.size; let n=0; for(const x of await fs.promises.readdir(p))n+=await size(path.join(p,x)); return n;}; c.items.push({id:nextId,name:folder,kind:'folder',status:'unuploaded',size:await size(root),createdAt:Date.now(),storageName:folder}); await fs.promises.rm(itemDir(c.id,source.id),{recursive:true,force:true}); c.items=c.items.filter(i=>i.id!==source.id); await save(); return c.items[c.items.length-1]; }); }
module.exports={ensure,listCabinets,createCabinet,renameCabinet,listItems,saveDownload,getItem,resolveLegacyPath,latestUnuploaded,setStatus,removeItems,clearCabinet,deleteCabinet,zipItems,unzipItem};
