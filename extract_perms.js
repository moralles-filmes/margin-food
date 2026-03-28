const fs = require('fs');
const content = fs.readFileSync('c:/Users/morae/Downloads/marginpro-app-main/src/permissions/registry.ts', 'utf8');

const sets = {
  'VIEW_ONLY': ['view'],
  'VIEW_EXPORT': ['view', 'export'],
  'CRUD': ['view', 'create', 'edit', 'delete'],
  'VIEW_CREATE': ['view', 'create'],
  'VIEW_EDIT': ['view', 'edit'],
  'VIEW_MANAGE': ['view', 'manage']
};

const sqlLines = [];

// More aggressive regex to find all key/actions patterns
const modRegex = /key:\s*'([a-zA-Z0-9_\-]+)',\s*label:\s*'[^']+',\s*subtabs:/g;
let modMatch;
while ((modMatch = modRegex.exec(content)) !== null) {
  const modKey = modMatch[1];
  
  // Find everything until next module or end of array
  const moduleStart = modMatch.index;
  const nextModMatch = modRegex.exec(content);
  const moduleEnd = nextModMatch ? nextModMatch.index : content.indexOf('];', moduleStart);
  modRegex.lastIndex = moduleStart + modMatch[0].length; // reset for next iteration
  
  const moduleBlock = content.substring(moduleStart, moduleEnd);
  
  const subtabRegex = /\{ key:\s*'([a-zA-Z0-9_\-]+)',\s*label:\s*'[^']+',\s*actions:\s*([^}]+)\}/g;
  let subMatch;
  while ((subMatch = subtabRegex.exec(moduleBlock)) !== null) {
    const subKey = subMatch[1];
    const actionsRaw = subMatch[2];
    
    let actionsList = [];
    // Check for named sets
    Object.keys(sets).forEach(setName => {
      if (actionsRaw.includes(setName)) {
        actionsList = actionsList.concat(sets[setName]);
      }
    });
    
    // Check for literal actions
    const literalMatch = actionsRaw.match(/action:\s*'([^']+)'/g);
    if (literalMatch) {
      literalMatch.forEach(m => {
        const act = m.match(/'([^']+)'/)[1];
        actionsList.push(act);
      });
    }
    
    [...new Set(actionsList)].forEach(act => {
      const key = `${modKey}:${subKey}:${act}`;
      sqlLines.push(`INSERT INTO permissions (key, module, submodule, action, description) VALUES ('${key}', '${modKey}', '${subKey}', '${act}', '${key}') ON CONFLICT (key) DO NOTHING;`);
    });
  }
}

// Add the legacy ones just in case
const legacyKeys = content.match(/'[a-zA-Z0-9_\-]+:[a-zA-Z0-9_\-]+:[a-zA-Z0-9_\-]+'/g);
if (legacyKeys) {
  legacyKeys.forEach(k => {
    const key = k.replace(/'/g, '');
    const [mod, sub, act] = key.split(':');
    sqlLines.push(`INSERT INTO permissions (key, module, submodule, action, description) VALUES ('${key}', '${mod}', '${sub}', '${act}', '${key}') ON CONFLICT (key) DO NOTHING;`);
  });
}

[...new Set(sqlLines)].forEach(line => console.log(line));
