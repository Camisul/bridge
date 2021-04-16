const fs = require('fs');
const { join } = require('path');
const cfg_path = join(__dirname, '..', 'bridgeconfig.json');

let timeout;
function scheduleSave(obj) {
  if(timeout != null) 
    return;
  timeout = setTimeout(() => {
    timeout = null;
    const str = JSON.stringify(obj, null, 2);
    fs.writeFileSync(cfg_path, str + '\n');
  }, 5000);
}

const handlers = {
  set: function(obj, prop, val) {
    // default beahviour
    obj[prop] = val;
    
    scheduleSave(obj);
    
    return true;
  }
};

let proxy;

function loadCfg() {
  const a = fs.readFileSync(cfg_path).toString();
  const obj = JSON.parse(a);

  proxy = new Proxy(obj, handlers);
  return proxy;
}

module.exports = loadCfg();
